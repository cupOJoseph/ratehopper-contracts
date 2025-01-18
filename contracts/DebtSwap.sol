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
import {ProtocolRegistry} from "./protocolRegistry.sol";

import "hardhat/console.sol";

contract DebtSwap {
    using GPv2SafeERC20 for IERC20;
    ProtocolRegistry private protocolRegistry;

    IUniswapV3Pool public pool;
    ISwapRouter02 public immutable swapRouter;
    address public immutable uniswapV3Factory;

    enum Protocol {
        AAVE_V3,
        COMPOUND,
        MORPHO,
        FLUID
    }

    struct FlashCallbackData {
        address flashloanPool;
        Protocol fromProtocol;
        Protocol toProtocol;
        address fromAsset;
        address toAsset;
        uint256 amount;
        uint256 amountInMaximum;
        address onBehalfOf;
        bytes fromExtraData;
        bytes toExtraData;
    }

    constructor(
        address registry,
        address uniswap_v3_factory,
        address uniswap_v3_swap_router
    ) {
        protocolRegistry = ProtocolRegistry(registry);
        uniswapV3Factory = uniswap_v3_factory;
        swapRouter = ISwapRouter02(uniswap_v3_swap_router);
    }

    function executeDebtSwap(
        address _flashloanPool,
        Protocol _fromProtocol,
        Protocol _toProtocol,
        address _fromAsset,
        address _toAsset,
        uint256 _amount,
        uint256 _amountInMaximum,
        bytes calldata _fromExtraData,
        bytes calldata _toExtraData
    ) public {
        pool = IUniswapV3Pool(_flashloanPool);

        address token0 = pool.token0();
        uint256 amount0 = _fromAsset == token0 ? _amount : 0;
        uint256 amount1 = _fromAsset == token0 ? 0 : _amount;

        bytes memory data = abi.encode(
            FlashCallbackData({
                flashloanPool: _flashloanPool,
                fromProtocol: _fromProtocol,
                toProtocol: _toProtocol,
                fromAsset: _fromAsset,
                toAsset: _toAsset,
                amount: _amount,
                amountInMaximum: _amountInMaximum,
                onBehalfOf: msg.sender,
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

        uint256 fromTokenBalance = IERC20(decoded.fromAsset).balanceOf(
            address(this)
        );

        if (decoded.fromProtocol == decoded.toProtocol) {
            ProtocolRegistry.Protocol protocol = ProtocolRegistry.Protocol(
                uint(decoded.fromProtocol)
            );

            address handler = protocolRegistry.getHandler(protocol);
            handler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.switchIn,
                    (
                        decoded.fromAsset,
                        decoded.toAsset,
                        decoded.amount,
                        decoded.amountInMaximum,
                        totalFee,
                        decoded.onBehalfOf,
                        decoded.fromExtraData
                    )
                )
            );
        } else {
            ProtocolRegistry.Protocol fromProtocol = ProtocolRegistry.Protocol(
                uint(decoded.fromProtocol)
            );

            address fromHandler = protocolRegistry.getHandler(fromProtocol);
            fromHandler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.switchFrom,
                    (
                        decoded.fromAsset,
                        decoded.amount,
                        decoded.onBehalfOf,
                        decoded.fromExtraData
                    )
                )
            );

            ProtocolRegistry.Protocol toProtocol = ProtocolRegistry.Protocol(
                uint(decoded.toProtocol)
            );

            address toHandler = protocolRegistry.getHandler(toProtocol);
            toHandler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.switchTo,
                    (
                        decoded.toAsset,
                        decoded.amountInMaximum + totalFee,
                        decoded.onBehalfOf,
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
                decoded.amountInMaximum
            );
        }

        IERC20 fromToken = IERC20(decoded.fromAsset);
        IERC20 toToken = IERC20(decoded.toAsset);

        fromToken.transfer(address(pool), decoded.amount + totalFee);

        // repay remaining amount
        uint256 remainingBalance = toToken.balanceOf(address(this));
        console.log("remainingBalance:", remainingBalance);

        if (remainingBalance > 0) {
            ProtocolRegistry.Protocol protocol = ProtocolRegistry.Protocol(
                uint(decoded.toProtocol)
            );

            address handler = protocolRegistry.getHandler(protocol);

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
