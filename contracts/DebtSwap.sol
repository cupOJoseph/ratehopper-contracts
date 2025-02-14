// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "./dependencies/IERC20.sol";
import {GPv2SafeERC20} from "./dependencies/GPv2SafeERC20.sol";
import {IFlashLoanSimpleReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IProtocolHandler} from "./interfaces/IProtocolHandler.sol";
import {ProtocolRegistry} from "./ProtocolRegistry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Types.sol";

import "hardhat/console.sol";

contract DebtSwap is Ownable {
    using GPv2SafeERC20 for IERC20;
    ProtocolRegistry public protocolRegistry;
    uint8 public protocolFee;
    address public feeBeneficiary;

    struct FlashCallbackData {
        address flashloanPool;
        Protocol fromProtocol;
        Protocol toProtocol;
        address fromAsset;
        address toAsset;
        uint256 amount;
        uint256 srcAmount;
        CollateralAsset[] collateralAssets;
        address onBehalfOf;
        bytes fromExtraData;
        bytes toExtraData;
        ParaswapParams paraswapParams;
    }

    event DebtSwapped(
        address indexed onBehalfOf,
        Protocol fromProtocol,
        Protocol toProtocol,
        address fromAsset,
        address toAsset,
        uint256 amount
    );

    constructor(address _registry) {
        protocolRegistry = ProtocolRegistry(_registry);
    }

    function setProtocolFee(uint8 _fee) public onlyOwner {
        protocolFee = _fee;
    }

    function setFeeBeneficiary(address _feeBeneficiary) public onlyOwner {
        feeBeneficiary = _feeBeneficiary;
    }

    function executeDebtSwap(
        address _flashloanPool,
        Protocol _fromProtocol,
        Protocol _toProtocol,
        address _fromDebtAsset,
        address _toDebtAsset,
        uint256 _amount,
        uint256 _srcAmount,
        CollateralAsset[] calldata _collateralAssets,
        bytes calldata _fromExtraData,
        bytes calldata _toExtraData,
        ParaswapParams calldata _paraswapParams
    ) public {
        require(_fromDebtAsset != address(0), "Invalid from asset address");
        require(_toDebtAsset != address(0), "Invalid to asset address");

        IUniswapV3Pool pool = IUniswapV3Pool(_flashloanPool);
        uint256 debtAmount = _amount;

        if (_amount == type(uint256).max) {
            address handler = protocolRegistry.getHandler(_fromProtocol);

            debtAmount = IProtocolHandler(handler).getDebtAmount(_fromDebtAsset, msg.sender, _fromExtraData);
        }

        address token0;
        try pool.token0() returns (address result) {
            token0 = result;
        } catch {
            revert("Invalid flashloan pool address");
        }

        uint256 amount0 = _fromDebtAsset == token0 ? debtAmount : 0;
        uint256 amount1 = _fromDebtAsset == token0 ? 0 : debtAmount;

        bytes memory data = abi.encode(
            FlashCallbackData({
                flashloanPool: _flashloanPool,
                fromProtocol: _fromProtocol,
                toProtocol: _toProtocol,
                fromAsset: _fromDebtAsset,
                toAsset: _toDebtAsset,
                amount: debtAmount,
                srcAmount: _srcAmount,
                onBehalfOf: msg.sender,
                collateralAssets: _collateralAssets,
                fromExtraData: _fromExtraData,
                toExtraData: _toExtraData,
                paraswapParams: _paraswapParams
            })
        );

        pool.flash(address(this), amount0, amount1, data);
    }

    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
        FlashCallbackData memory decoded = abi.decode(data, (FlashCallbackData));

        // implement the same logic as CallbackValidation.verifyCallback()
        require(msg.sender == address(decoded.flashloanPool), "Caller is not flashloan pool");

        // suppose either of fee0 or fee1 is 0
        uint flashloanFee = fee0 + fee1;

        uint256 protocolFeeAmount = (decoded.amount * protocolFee) / 10000;
        console.log("protocolFeeAmount:", protocolFeeAmount);

        uint256 amountInMax = decoded.srcAmount == 0 ? decoded.amount : decoded.srcAmount;
        uint256 amountTotal = amountInMax + flashloanFee + protocolFeeAmount;

        if (decoded.fromProtocol == decoded.toProtocol) {
            address handler = protocolRegistry.getHandler(decoded.fromProtocol);

            handler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.switchIn,
                    (
                        decoded.fromAsset,
                        decoded.toAsset,
                        decoded.amount,
                        amountTotal,
                        decoded.onBehalfOf,
                        decoded.collateralAssets,
                        decoded.fromExtraData,
                        decoded.toExtraData
                    )
                )
            );
        } else {
            address fromHandler = protocolRegistry.getHandler(decoded.fromProtocol);
            fromHandler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.switchFrom,
                    (
                        decoded.fromAsset,
                        decoded.amount,
                        decoded.onBehalfOf,
                        decoded.collateralAssets,
                        decoded.fromExtraData
                    )
                )
            );

            address toHandler = protocolRegistry.getHandler(decoded.toProtocol);
            toHandler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.switchTo,
                    (decoded.toAsset, amountTotal, decoded.onBehalfOf, decoded.collateralAssets, decoded.toExtraData)
                )
            );
        }

        if (decoded.fromAsset != decoded.toAsset) {
            swapByParaswap(
                decoded.toAsset,
                decoded.paraswapParams.tokenTransferProxy,
                decoded.paraswapParams.router,
                decoded.paraswapParams.swapData
            );
        }

        // repay flashloan
        IERC20 fromToken = IERC20(decoded.fromAsset);
        fromToken.transfer(address(decoded.flashloanPool), decoded.amount + flashloanFee);

        if (protocolFee > 0) {
            IERC20(decoded.toAsset).transfer(feeBeneficiary, protocolFeeAmount);
        }

        // repay remaining amount
        uint256 remainingBalance = IERC20(decoded.toAsset).balanceOf(address(this));

        if (remainingBalance > 0) {
            address handler = protocolRegistry.getHandler(decoded.toProtocol);

            handler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.repay,
                    (decoded.toAsset, remainingBalance, decoded.onBehalfOf, decoded.toExtraData)
                )
            );
        }

        emit DebtSwapped(
            decoded.onBehalfOf,
            decoded.fromProtocol,
            decoded.toProtocol,
            decoded.fromAsset,
            decoded.toAsset,
            decoded.amount
        );
    }

    function swapByParaswap(
        address asset,
        address tokenTransferProxy,
        address router,
        bytes memory _txParams
    ) internal {
        IERC20(asset).approve(tokenTransferProxy, type(uint256).max);

        (bool success, bytes memory returnData) = router.call(_txParams);

        require(success, "Token swap failed");
    }
}
