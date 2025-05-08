// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./dependencies/uniswapV3/CallbackValidation.sol";
import {IERC20} from "./dependencies/IERC20.sol";
import {PoolAddress} from "./dependencies/uniswapV3/PoolAddress.sol";
import {GPv2SafeERC20} from "./dependencies/GPv2SafeERC20.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "./Types.sol";
import "./interfaces/safe/ISafe.sol";
import {IProtocolHandler} from "./interfaces/IProtocolHandler.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "./dependencies/TransferHelper.sol";

contract SafeModuleDebtSwap is Ownable, ReentrancyGuard, Pausable {
    using GPv2SafeERC20 for IERC20;
    uint8 public protocolFee;
    address public feeBeneficiary;
    address public executor;
    address public pauser;
    address public uniswapV3Factory;
    address public paraswapTokenTransferProxy;
    address public paraswapRouter;
    mapping(Protocol => address) public protocolHandlers;

    struct FlashCallbackData {
        Protocol fromProtocol;
        Protocol toProtocol;
        address fromAsset;
        address toAsset;
        uint256 amount;
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

    event FeeBeneficiarySet(address indexed oldBeneficiary, address indexed newBeneficiary);

    event ProtocolFeeSet(uint8 oldFee, uint8 newFee);

    modifier onlyOwnerOrExecutor(address onBehalfOf) {
        if (msg.sender == executor) {
            _;
            return;
        }

        // Check if caller is any owner of the Safe
        require(ISafe(onBehalfOf).isOwner(msg.sender), "Caller is not authorized");
        _;
    }

    modifier onlyPauser() {
        require(msg.sender == pauser, "Caller is not authorized to pause");
        _;
    }

    constructor(
        address _uniswapV3Factory,
        Protocol[] memory protocols,
        address[] memory handlers,
        address _pauser
    ) Ownable(msg.sender) {
        require(protocols.length == handlers.length, "Protocols and handlers length mismatch");

        for (uint256 i = 0; i < protocols.length; i++) {
            require(handlers[i] != address(0), "Invalid handler address");
            protocolHandlers[protocols[i]] = handlers[i];
        }

        executor = msg.sender;
        pauser = _pauser;
        uniswapV3Factory = _uniswapV3Factory;
    }

    function setProtocolFee(uint8 _fee) public onlyOwner {
        require(_fee <= 100, "_fee cannot be greater than 1%");
        uint8 oldFee = protocolFee;
        protocolFee = _fee;
        emit ProtocolFeeSet(oldFee, _fee);
    }

    function setFeeBeneficiary(address _feeBeneficiary) public onlyOwner {
        require(_feeBeneficiary != address(0), "_feeBeneficiary cannot be zero address");
        address oldBeneficiary = feeBeneficiary;
        feeBeneficiary = _feeBeneficiary;
        emit FeeBeneficiarySet(oldBeneficiary, _feeBeneficiary);
    }

    function setExecutor(address _executor) public onlyOwner {
        require(_executor != address(0), "_executor cannot be zero address");
        executor = _executor;
    }

    function setParaswapAddresses(address _paraswapTokenTransferProxy, address _paraswapRouter) external onlyOwner {
        require(_paraswapTokenTransferProxy != address(0), "paraswapTokenTransferProxy cannot be zero address");
        require(_paraswapRouter != address(0), "paraswapRouter cannot be zero address");
        paraswapTokenTransferProxy = _paraswapTokenTransferProxy;
        paraswapRouter = _paraswapRouter;
    }

    function executeDebtSwap(
        address _flashloanPool,
        Protocol _fromProtocol,
        Protocol _toProtocol,
        address _fromDebtAsset,
        address _toDebtAsset,
        uint256 _amount,
        CollateralAsset[] calldata _collateralAssets,
        address _onBehalfOf,
        bytes[2] calldata _extraData,
        ParaswapParams calldata _paraswapParams
    ) public onlyOwnerOrExecutor(_onBehalfOf) whenNotPaused {
        require(_fromDebtAsset != address(0), "Invalid from asset address");
        require(_toDebtAsset != address(0), "Invalid to asset address");
        require(_amount > 0, "_amount cannot be zero");

        IUniswapV3Pool pool = IUniswapV3Pool(_flashloanPool);
        uint256 debtAmount = _amount;

        if (_amount == type(uint256).max) {
            address handler = protocolHandlers[_fromProtocol];

            debtAmount = IProtocolHandler(handler).getDebtAmount(_fromDebtAsset, _onBehalfOf, _extraData[0]);
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
                fromProtocol: _fromProtocol,
                toProtocol: _toProtocol,
                fromAsset: _fromDebtAsset,
                toAsset: _toDebtAsset,
                amount: debtAmount,
                onBehalfOf: _onBehalfOf,
                collateralAssets: _collateralAssets,
                fromExtraData: _extraData[0],
                toExtraData: _extraData[1],
                paraswapParams: _paraswapParams
            })
        );

        pool.flash(address(this), amount0, amount1, data);
    }

    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external whenNotPaused {
        FlashCallbackData memory decoded = abi.decode(data, (FlashCallbackData));

        // verify callback
        IUniswapV3Pool pool = IUniswapV3Pool(msg.sender);
        PoolAddress.PoolKey memory poolKey = PoolAddress.getPoolKey(pool.token0(), pool.token1(), pool.fee());
        CallbackValidation.verifyCallback(uniswapV3Factory, poolKey);

        address safe = decoded.onBehalfOf;

        // suppose either of fee0 or fee1 is 0
        uint flashloanFeeOriginal = fee0 + fee1;

        // need this flashloanFee conversion to calculate amountTotal correctly when fromAsset and toAsset have different decimals
        uint8 fromAssetDecimals = IERC20(decoded.fromAsset).decimals();
        uint8 toAssetDecimals = IERC20(decoded.toAsset).decimals();
        int8 decimalDifference = int8(fromAssetDecimals) - int8(toAssetDecimals);
        uint flashloanFee;
        if (decimalDifference > 0) {
            flashloanFee = flashloanFeeOriginal / (10 ** uint8(decimalDifference));
        } else if (decimalDifference < 0) {
            flashloanFee = flashloanFeeOriginal * (10 ** uint8(-decimalDifference));
        } else {
            flashloanFee = flashloanFeeOriginal;
        }

        uint256 protocolFeeAmount = (decoded.amount * protocolFee) / 10000;

        uint256 amountInMax = decoded.paraswapParams.srcAmount == 0 ? decoded.amount : decoded.paraswapParams.srcAmount;
        uint256 amountTotal = amountInMax + flashloanFee + protocolFeeAmount;

        address fromHandler = protocolHandlers[decoded.fromProtocol];

        if (decoded.fromProtocol == decoded.toProtocol) {
            (bool success, ) = fromHandler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.switchIn,
                    (
                        decoded.fromAsset,
                        decoded.toAsset,
                        decoded.amount,
                        amountTotal,
                        safe,
                        decoded.collateralAssets,
                        decoded.fromExtraData,
                        decoded.toExtraData
                    )
                )
            );
            require(success, "protocol switchIn failed");
        } else {
            (bool successFrom, ) = fromHandler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.switchFrom,
                    (decoded.fromAsset, decoded.amount, safe, decoded.collateralAssets, decoded.fromExtraData)
                )
            );
            require(successFrom, "protocol switchFrom failed");

            address toHandler = protocolHandlers[decoded.toProtocol];
            (bool successTo, ) = toHandler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.switchTo,
                    (decoded.toAsset, amountTotal, safe, decoded.collateralAssets, decoded.toExtraData)
                )
            );
            require(successTo, "protocol switchTo failed");
        }

        if (decoded.fromAsset != decoded.toAsset) {
            swapByParaswap(
                decoded.toAsset,
                amountTotal,
                decoded.paraswapParams.swapData
            );
        }

        // repay flashloan
        IERC20(decoded.fromAsset).transfer(msg.sender, decoded.amount + flashloanFeeOriginal);

        if (protocolFee > 0 && feeBeneficiary != address(0)) {
            IERC20(decoded.toAsset).safeTransfer(feeBeneficiary, protocolFeeAmount);
        }

        // repay remaining amount
        IERC20 toToken = IERC20(decoded.toAsset);
        uint256 remainingBalance = toToken.balanceOf(address(this));

        if (remainingBalance > 0) {
            address handler = protocolHandlers[decoded.toProtocol];

            (bool success, ) = handler.delegatecall(
                abi.encodeCall(IProtocolHandler.repay, (decoded.toAsset, remainingBalance, safe, decoded.toExtraData))
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
        bytes memory _txParams
    ) internal {
        TransferHelper.safeApprove(asset, paraswapTokenTransferProxy, amount);
        (bool success, ) = paraswapRouter.call(_txParams);
        require(success, "Token swap by paraSwap failed");
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token address");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(amount <= balance, "Insufficient balance");
        IERC20(token).safeTransfer(owner(), amount);
    }

    /**
     * @notice Pauses the contract, preventing debt swap operations
     * @dev Only callable by the pauser or owner
     */
    function pause() external onlyPauser {
        _pause();
    }

    /**
     * @notice Unpauses the contract, allowing debt swap operations
     * @dev Only callable by the pauser or owner
     */
    function unpause() external onlyPauser {
        _unpause();
    }
}
