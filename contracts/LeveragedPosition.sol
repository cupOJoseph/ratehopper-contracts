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
import "./types.sol";

import "hardhat/console.sol";

contract LeveragedPosition {
    using GPv2SafeERC20 for IERC20;
    ProtocolRegistry private protocolRegistry;

    IUniswapV3Pool public pool;
    ISwapRouter02 public immutable swapRouter;
    address public immutable uniswapV3Factory;

    struct FlashCallbackData {
        address flashloanPool;
        Protocol protocol;
        address collateralAsset;
        address debtAsset;
        uint256 principleCollateralAmount;
        uint256 targetCollateralAmount;
        uint256 debtAmount;
        uint16 allowedSlippage;
        address onBehalfOf;
        bytes extraData;
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

    function createLeveragedPosition(
        address _flashloanPool,
        Protocol _protocol,
        address _collateralAsset,
        uint256 _principleCollateralAmount,
        uint256 _targetCollateralAmount,
        address _debtAsset,
        uint256 _debtAmount,
        uint16 _allowedSlippage,
        bytes calldata _extraData
    ) public {
        IERC20(_collateralAsset).transferFrom(
            msg.sender,
            address(this),
            _principleCollateralAmount
        );

        pool = IUniswapV3Pool(_flashloanPool);

        uint256 flashloanBorrowAmount = _targetCollateralAmount -
            _principleCollateralAmount;

        address token0 = pool.token0();
        uint256 amount0 = _collateralAsset == token0
            ? flashloanBorrowAmount
            : 0;
        uint256 amount1 = _collateralAsset == token0
            ? 0
            : flashloanBorrowAmount;

        bytes memory data = abi.encode(
            FlashCallbackData({
                flashloanPool: _flashloanPool,
                protocol: _protocol,
                collateralAsset: _collateralAsset,
                debtAsset: _debtAsset,
                principleCollateralAmount: _principleCollateralAmount,
                targetCollateralAmount: _targetCollateralAmount,
                debtAmount: _debtAmount,
                allowedSlippage: _allowedSlippage,
                onBehalfOf: msg.sender,
                extraData: _extraData
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
        uint256 flashloanBorrowAmount = decoded.targetCollateralAmount -
            decoded.principleCollateralAmount;

        // implement the same logic as CallbackValidation.verifyCallback()
        require(msg.sender == address(decoded.flashloanPool));

        // suppose either of fee0 or fee1 is 0
        uint totalFee = fee0 + fee1;

        uint256 amountInMax = (decoded.debtAmount * decoded.allowedSlippage) /
            10 ** 4;

        ProtocolRegistry.Protocol protocol = ProtocolRegistry.Protocol(
            uint(decoded.protocol)
        );

        address handler = protocolRegistry.getHandler(protocol);

        handler.delegatecall(
            abi.encodeCall(
                IProtocolHandler.supply,
                (
                    decoded.collateralAsset,
                    decoded.targetCollateralAmount,
                    decoded.onBehalfOf,
                    decoded.extraData
                )
            )
        );

        handler.delegatecall(
            abi.encodeCall(
                IProtocolHandler.borrow,
                (
                    decoded.debtAsset,
                    amountInMax,
                    decoded.onBehalfOf,
                    decoded.extraData
                )
            )
        );

        swapToken(
            address(decoded.debtAsset),
            address(decoded.collateralAsset),
            flashloanBorrowAmount + totalFee,
            amountInMax
        );

        IERC20 token = IERC20(decoded.collateralAsset);

        token.transfer(address(pool), flashloanBorrowAmount + totalFee);

        // repay remaining amount
        IERC20 debtToken = IERC20(decoded.debtAsset);
        uint256 remainingBalance = debtToken.balanceOf(address(this));
        console.log("remainingBalance:", remainingBalance);

        if (remainingBalance > 0) {
            ProtocolRegistry.Protocol protocol = ProtocolRegistry.Protocol(
                uint(decoded.protocol)
            );

            address handler = protocolRegistry.getHandler(protocol);

            handler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.repay,
                    (
                        decoded.debtAsset,
                        remainingBalance,
                        decoded.onBehalfOf,
                        decoded.extraData
                    )
                )
            );
        }

        uint256 remainingBalanceAfter = debtToken.balanceOf(address(this));
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
                fee: 3000,
                recipient: address(this),
                amountOut: amountOut,
                amountInMaximum: amountInMaximum,
                sqrtPriceLimitX96: 0
            });

        uint256 amountIn = swapRouter.exactOutputSingle(params);

        console.log("swap from ", inputToken, " to ", outputToken);
    }
}
