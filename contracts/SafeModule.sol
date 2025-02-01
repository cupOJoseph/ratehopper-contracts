// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "./dependencies/IERC20.sol";
import {GPv2SafeERC20} from "./dependencies/GPv2SafeERC20.sol";
import {IFlashLoanSimpleReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";
import {IPoolV3} from "./interfaces/aaveV3/IPoolV3.sol";

import {IDebtToken} from "./interfaces/aaveV3/IDebtToken.sol";
import {IAaveProtocolDataProvider} from "./interfaces/aaveV3/IAaveProtocolDataProvider.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IMToken} from "./interfaces/moonwell/IMToken.sol";
import {ISwapRouter02} from "./interfaces/uniswapV3/ISwapRouter02.sol";
import {IV3SwapRouter} from "./interfaces/uniswapV3/IV3SwapRouter.sol";
import {IComet} from "./interfaces/compound/IComet.sol";
import {PoolAddress} from "./dependencies/uniswapV3/PoolAddress.sol";
import {IProtocolHandler} from "./interfaces/IProtocolHandler.sol";
import {ProtocolRegistry} from "./ProtocolRegistry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Types.sol";
import "./interfaces/safe/ISafe.sol";

import "hardhat/console.sol";

contract SafeModule is Ownable {
    address public safe;
    ProtocolRegistry public protocolRegistry;

    struct FlashCallbackData {
        address flashloanPool;
        Protocol fromProtocol;
        Protocol toProtocol;
        address fromAsset;
        address toAsset;
        uint256 amount;
        uint256 allowedSlippage;
        CollateralAsset[] collateralAssets;
        address onBehalfOf;
        bytes fromExtraData;
        bytes toExtraData;
    }

    event TransactionExecuted(address indexed target, bytes data);

    modifier onlySafe() {
        require(msg.sender == safe, "SafeModule: Caller is not the Safe");
        _;
    }

    constructor(address _safe) {
        safe = _safe;
    }

    function setRegistry(address _registry) public onlyOwner {
        protocolRegistry = ProtocolRegistry(_registry);
    }

    function executeDebtSwap(
        address _flashloanPool,
        Protocol _fromProtocol,
        Protocol _toProtocol,
        address _fromDebtAsset,
        address _toDebtAsset,
        uint256 _amount,
        uint16 _allowedSlippage,
        CollateralAsset[] calldata _collateralAssets,
        bytes calldata _fromExtraData,
        bytes calldata _toExtraData
    ) public {
        require(_fromDebtAsset != address(0), "Invalid from asset address");
        require(_toDebtAsset != address(0), "Invalid to asset address");

        IUniswapV3Pool pool = IUniswapV3Pool(_flashloanPool);
        uint256 debtAmount = _amount;

        if (_amount == type(uint256).max) {
            address handler = protocolRegistry.getHandler(_fromProtocol);

            debtAmount = IProtocolHandler(handler).getDebtAmount(
                _fromDebtAsset,
                msg.sender,
                _fromExtraData
            );
            console.log("on-chain debtAmount:", debtAmount);
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
                allowedSlippage: _allowedSlippage,
                onBehalfOf: msg.sender,
                collateralAssets: _collateralAssets,
                fromExtraData: _fromExtraData,
                toExtraData: _toExtraData
            })
        );

        pool.flash(address(this), amount0, amount1, data);
    }

    function uniswapV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external {
        FlashCallbackData memory decoded = abi.decode(
            data,
            (FlashCallbackData)
        );

        // implement the same logic as CallbackValidation.verifyCallback()
        require(
            msg.sender == address(decoded.flashloanPool),
            "Caller is not flashloan pool"
        );

        console.log("callback is called");

        // suppose either of fee0 or fee1 is 0
        uint totalFee = fee0 + fee1;

        // uint8 fromDecimals = IERC20(decoded.fromAsset).decimals();
        // uint8 toDecimals = IERC20(decoded.toAsset).decimals();
        // uint8 decimalDiff = fromDecimals > toDecimals
        //     ? fromDecimals - toDecimals
        //     : toDecimals - fromDecimals;

        // uint256 amountInMax = (decoded.amount *
        //     (10 ** 4 + decoded.allowedSlippage)) / 10 ** 4;

        // if (decimalDiff > 0) {
        //     amountInMax = amountInMax * 10 ** decimalDiff;
        // }
        // console.log("amountInMax:", amountInMax);

        // if (decoded.fromProtocol == decoded.toProtocol) {
        //     address handler = protocolRegistry.getHandler(decoded.fromProtocol);

        //     handler.delegatecall(
        //         abi.encodeCall(
        //             IProtocolHandler.switchIn,
        //             (
        //                 decoded.fromAsset,
        //                 decoded.toAsset,
        //                 decoded.amount,
        //                 amountInMax,
        //                 totalFee,
        //                 decoded.onBehalfOf,
        //                 decoded.collateralAssets,
        //                 decoded.fromExtraData,
        //                 decoded.toExtraData
        //             )
        //         )
        //     );
        // } else {
        //     address fromHandler = protocolRegistry.getHandler(
        //         decoded.fromProtocol
        //     );
        //     fromHandler.delegatecall(
        //         abi.encodeCall(
        //             IProtocolHandler.switchFrom,
        //             (
        //                 decoded.fromAsset,
        //                 decoded.amount,
        //                 decoded.onBehalfOf,
        //                 decoded.collateralAssets,
        //                 decoded.fromExtraData
        //             )
        //         )
        //     );

        //     address toHandler = protocolRegistry.getHandler(decoded.toProtocol);
        //     toHandler.delegatecall(
        //         abi.encodeCall(
        //             IProtocolHandler.switchTo,
        //             (
        //                 decoded.toAsset,
        //                 amountInMax + totalFee,
        //                 decoded.onBehalfOf,
        //                 decoded.collateralAssets,
        //                 decoded.toExtraData
        //             )
        //         )
        //     );
        // }

        // if (decoded.fromAsset != decoded.toAsset) {
        //     swapToken(
        //         address(decoded.toAsset),
        //         address(decoded.fromAsset),
        //         decoded.amount + totalFee,
        //         amountInMax
        //     );
        // }

        // bytes memory approveData = abi.encodeCall(
        //     IERC20(decoded.fromAsset).approve,
        //     (address(this), 10)
        // );

        // bool successA = ISafe(0x2f9054Eb6209bb5B94399115117044E4f150B2De)
        //     .execTransactionFromModule(
        //         decoded.fromAsset,
        //         0,
        //         approveData,
        //         ISafe.Operation.Call
        //     );
        // console.log("successA: ", successA);

        bytes memory borrowData = abi.encodeCall(
            IPoolV3.borrow,
            (
                decoded.fromAsset,
                10,
                2,
                0,
                0x2f9054Eb6209bb5B94399115117044E4f150B2De
            )
        );

        bool success2 = ISafe(0x2f9054Eb6209bb5B94399115117044E4f150B2De)
            .execTransactionFromModule(
                0xA238Dd80C259a72e81d7e4664a9801593F98d1c5,
                0,
                borrowData,
                ISafe.Operation.Call
            );

        console.log("success2: ", success2);

        bytes memory transferData = abi.encodeCall(
            IERC20(decoded.fromAsset).transfer,
            (address(this), 10)
        );
        bool success = ISafe(0x2f9054Eb6209bb5B94399115117044E4f150B2De)
            .execTransactionFromModule(
                decoded.fromAsset,
                0,
                transferData,
                ISafe.Operation.Call
            );
        console.log("success1: ", success);

        // bytes memory repayData = abi.encodeCall(
        //     IPoolV3.repay,
        //     (
        //         decoded.fromAsset,
        //         10,
        //         2,
        //         0x2f9054Eb6209bb5B94399115117044E4f150B2De
        //     )
        // );

        // // repay flashloan
        IERC20 fromToken = IERC20(decoded.fromAsset);
        console.log("balance: ", fromToken.balanceOf(address(this)));
        console.log("amount: ", decoded.amount + totalFee);
        fromToken.transfer(
            address(decoded.flashloanPool),
            decoded.amount + totalFee
        );

        // // repay remaining amount
        // IERC20 toToken = IERC20(decoded.toAsset);
        // uint256 remainingBalance = toToken.balanceOf(address(this));
        // console.log("remainingBalance:", remainingBalance);

        // if (remainingBalance > 0) {
        //     address handler = protocolRegistry.getHandler(decoded.toProtocol);

        //     handler.delegatecall(
        //         abi.encodeCall(
        //             IProtocolHandler.repay,
        //             (
        //                 decoded.toAsset,
        //                 remainingBalance,
        //                 decoded.onBehalfOf,
        //                 decoded.toExtraData
        //             )
        //         )
        //     );
        // }

        // uint256 remainingBalanceAfter = toToken.balanceOf(address(this));
        // console.log("remainingBalanceAfter:", remainingBalanceAfter);
    }

    function executeTransaction(
        address _safeAddr,
        address _target,
        bytes calldata data
    ) external onlySafe returns (bool success) {
        console.log("executing");
        bool success = ISafe(_safeAddr).execTransactionFromModule(
            _target,
            0,
            data,
            ISafe.Operation.Call
        );
        // (success, ) = target.call(data);
        // require(success, "SafeModule: Transaction failed");

        // emit TransactionExecuted(target, data);
    }
}
