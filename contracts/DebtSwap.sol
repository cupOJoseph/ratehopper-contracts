// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "./dependencies/IERC20.sol";
import {GPv2SafeERC20} from "./dependencies/GPv2SafeERC20.sol";
import {IFlashLoanSimpleReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IProtocolHandler} from "./interfaces/IProtocolHandler.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./Types.sol";

contract DebtSwap is Ownable, ReentrancyGuard {
    using GPv2SafeERC20 for IERC20;
    uint8 public protocolFee;
    address public feeBeneficiary;
    mapping(Protocol => address) public protocolHandlers;

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

    event FlashLoanBorrowed(address indexed pool, address indexed asset, uint256 amount, uint256 fee);

    constructor(Protocol[] memory protocols, address[] memory handlers) {
        require(protocols.length == handlers.length, "Protocols and handlers length mismatch");

        for (uint256 i = 0; i < protocols.length; i++) {
            require(handlers[i] != address(0), "Invalid handler address");
            protocolHandlers[protocols[i]] = handlers[i];
        }
    }

    function setProtocolFee(uint8 _fee) public onlyOwner {
        require(_fee <= 100, "_fee cannot be greater than 1%");
        protocolFee = _fee;
    }

    function setFeeBeneficiary(address _feeBeneficiary) public onlyOwner {
        require(_feeBeneficiary != address(0), "_feeBeneficiary cannot be zero address");
        feeBeneficiary = _feeBeneficiary;
    }

    function getHandler(Protocol protocol) public view returns (address) {
        return protocolHandlers[protocol];
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
    ) public nonReentrant {
        require(_fromDebtAsset != address(0), "_fromDebtAsset cannot be zero address");
        require(_toDebtAsset != address(0), "_toDebtAsset cannot be zero address");
        require(_amount > 0, "_amount cannot be zero");
        require(_srcAmount > 0, "_srcAmount cannot be zero");

        IUniswapV3Pool pool = IUniswapV3Pool(_flashloanPool);
        address token0;
        try pool.token0() returns (address result) {
            token0 = result;
        } catch {
            revert("Invalid flashloan pool address");
        }

        uint256 debtAmount = _amount;
        if (_amount == type(uint256).max) {
            address handler = getHandler(_fromProtocol);

            debtAmount = IProtocolHandler(handler).getDebtAmount(_fromDebtAsset, msg.sender, _fromExtraData);
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

        emit FlashLoanBorrowed(decoded.flashloanPool, decoded.fromAsset, decoded.amount, flashloanFee);

        uint256 protocolFeeAmount = (decoded.amount * protocolFee) / 10000;

        uint256 amountInMax = decoded.srcAmount == 0 ? decoded.amount : decoded.srcAmount;
        uint256 amountTotal = amountInMax + flashloanFee + protocolFeeAmount;

        if (decoded.fromProtocol == decoded.toProtocol) {
            address handler = getHandler(decoded.fromProtocol);

            (bool success, ) = handler.delegatecall(
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
            require(success, "protocol switchIn failed");
        } else {
            address fromHandler = getHandler(decoded.fromProtocol);
            (bool successFrom, ) = fromHandler.delegatecall(
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
            require(successFrom, "protocol switchFrom failed");

            address toHandler = getHandler(decoded.toProtocol);
            (bool successTo, ) = toHandler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.switchTo,
                    (decoded.toAsset, amountTotal, decoded.onBehalfOf, decoded.collateralAssets, decoded.toExtraData)
                )
            );
            require(successTo, "protocol switchTo failed");
        }

        if (decoded.fromAsset != decoded.toAsset) {
            swapByParaswap(
                decoded.toAsset,
                amountTotal,
                decoded.paraswapParams.tokenTransferProxy,
                decoded.paraswapParams.router,
                decoded.paraswapParams.swapData
            );
        }

        // repay flashloan
        IERC20 fromToken = IERC20(decoded.fromAsset);
        fromToken.safeTransfer(address(decoded.flashloanPool), decoded.amount + flashloanFee);

        if (protocolFee > 0) {
            IERC20(decoded.toAsset).safeTransfer(feeBeneficiary, protocolFeeAmount);
        }

        // repay remaining amount
        uint256 remainingBalance = IERC20(decoded.toAsset).balanceOf(address(this));

        if (remainingBalance > 0) {
            address handler = getHandler(decoded.toProtocol);

            (bool success, ) = handler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.repay,
                    (decoded.toAsset, remainingBalance, decoded.onBehalfOf, decoded.toExtraData)
                )
            );
            require(success, "Repay remainingBalance failed");
        }

        // send dust amount back to user if it exists
        uint256 fromTokenRemainingBalance = IERC20(decoded.fromAsset).balanceOf(address(this));
        if (fromTokenRemainingBalance > 0) {
            IERC20(decoded.fromAsset).safeTransfer(decoded.onBehalfOf, fromTokenRemainingBalance);
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
        uint256 amount,
        address tokenTransferProxy,
        address router,
        bytes memory _txParams
    ) internal {
        IERC20(asset).approve(tokenTransferProxy, amount);
        (bool success, ) = router.call(_txParams);
        require(success, "Token swap by paraSwap failed");
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}
