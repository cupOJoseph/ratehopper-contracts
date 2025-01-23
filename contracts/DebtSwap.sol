// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

import {IERC20} from "./dependencies/IERC20.sol";
import {GPv2SafeERC20} from "./dependencies/GPv2SafeERC20.sol";
import {IFlashLoanSimpleReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";

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

import "hardhat/console.sol";

struct CollateralAsset {
    address asset;
    uint256 amount;
}

contract DebtSwap is Ownable {
    using GPv2SafeERC20 for IERC20;
    ProtocolRegistry public protocolRegistry;

    IUniswapV3Pool public pool;
    ISwapRouter02 public immutable swapRouter;
    address public immutable uniswapV3Factory;

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

    constructor(address _uniswap_v3_factory, address _uniswap_v3_swap_router) {
        uniswapV3Factory = _uniswap_v3_factory;
        swapRouter = ISwapRouter02(_uniswap_v3_swap_router);
    }

    function setRegistry(address _registry) public onlyOwner {
        protocolRegistry = ProtocolRegistry(_registry);
    }

    function executeDebtSwap(
        address _flashloanPool,
        Protocol _fromProtocol,
        Protocol _toProtocol,
        address _fromAsset,
        address _toAsset,
        uint256 _amount,
        uint16 _allowedSlippage,
        CollateralAsset[] calldata _collateralAssets,
        bytes calldata _fromExtraData,
        bytes calldata _toExtraData
    ) public {
        pool = IUniswapV3Pool(_flashloanPool);
        uint256 debtAmount = _amount;

        console.log("collateralAmount:", _collateralAssets[0].amount);

        if (_amount == type(uint256).max) {
            address handler = protocolRegistry.getHandler(_fromProtocol);

            // TODO: remove delegateCall?
            (bool success, bytes memory returnData) = handler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.getDebtAmount,
                    (_fromAsset, msg.sender, _fromExtraData)
                )
            );
            require(success);
            debtAmount = abi.decode(returnData, (uint256));
            console.log("on-chain debtAmount:", debtAmount);
        }

        address token0 = pool.token0();
        uint256 amount0 = _fromAsset == token0 ? debtAmount : 0;
        uint256 amount1 = _fromAsset == token0 ? 0 : debtAmount;

        bytes memory data = abi.encode(
            FlashCallbackData({
                flashloanPool: _flashloanPool,
                fromProtocol: _fromProtocol,
                toProtocol: _toProtocol,
                fromAsset: _fromAsset,
                toAsset: _toAsset,
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
        require(msg.sender == address(decoded.flashloanPool));

        // suppose either of fee0 or fee1 is 0
        uint totalFee = fee0 + fee1;

        uint256 amountInMax = (decoded.amount *
            (10 ** 4 + decoded.allowedSlippage)) / 10 ** 4;
        console.log("amountInMax:", amountInMax);

        if (decoded.fromProtocol == decoded.toProtocol) {
            address handler = protocolRegistry.getHandler(decoded.fromProtocol);

            handler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.switchIn,
                    (
                        decoded.fromAsset,
                        decoded.toAsset,
                        decoded.amount,
                        amountInMax,
                        totalFee,
                        decoded.onBehalfOf,
                        decoded.collateralAssets,
                        decoded.fromExtraData,
                        decoded.toExtraData
                    )
                )
            );
        } else {
            address fromHandler = protocolRegistry.getHandler(
                decoded.fromProtocol
            );
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
                    (
                        decoded.toAsset,
                        amountInMax + totalFee,
                        decoded.onBehalfOf,
                        decoded.collateralAssets,
                        decoded.toExtraData
                    )
                )
            );
        }

        if (decoded.fromAsset != decoded.toAsset) {
            swapToken(
                address(decoded.toAsset),
                address(decoded.fromAsset),
                decoded.amount + totalFee,
                amountInMax
            );
        }

        IERC20 fromToken = IERC20(decoded.fromAsset);
        IERC20 toToken = IERC20(decoded.toAsset);

        fromToken.transfer(address(pool), decoded.amount + totalFee);

        // repay remaining amount
        uint256 remainingBalance = toToken.balanceOf(address(this));
        console.log("remainingBalance:", remainingBalance);

        if (remainingBalance > 0) {
            address handler = protocolRegistry.getHandler(decoded.toProtocol);

            handler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.repay,
                    (
                        decoded.toAsset,
                        remainingBalance,
                        decoded.onBehalfOf,
                        decoded.toExtraData
                    )
                )
            );
        }

        uint256 remainingBalanceAfter = toToken.balanceOf(address(this));
        console.log("remainingBalanceAfter:", remainingBalanceAfter);
    }

    function swapToken(
        address inputToken,
        address outputToken,
        uint256 amountOut,
        uint256 amountInMaximum
    ) internal {
        IERC20(inputToken).approve(address(swapRouter), amountInMaximum);

        IV3SwapRouter.ExactOutputSingleParams memory params = IV3SwapRouter
            .ExactOutputSingleParams({
                tokenIn: inputToken,
                tokenOut: outputToken,
                fee: 100,
                recipient: address(this),
                amountOut: amountOut,
                amountInMaximum: amountInMaximum,
                sqrtPriceLimitX96: 0
            });

        uint256 amountIn = swapRouter.exactOutputSingle(params);

        console.log("swap from ", inputToken, " to ", outputToken);
    }
}
