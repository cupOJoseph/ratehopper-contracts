// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

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

import "hardhat/console.sol";

contract CompoundDebtSwap {
    using GPv2SafeERC20 for IERC20;

    IUniswapV3Pool public pool;
    ISwapRouter02 public immutable swapRouter;
    address public immutable uniswapV3Factory;

    struct FlashCallbackData {
        address poolKey;
        uint256 amount;
        address caller;
        address fromAsset;
        address toAsset;
        address fromCContract;
        address toCContract;
        address collateralAsset;
        uint256 collateralAmount;
        uint256 amountInMaximum;
    }

    constructor(
        address _uniswapV3Factory,
        address _UNISWAP_V3_SWAP_ROUTER_ADDRESS
    ) {
        uniswapV3Factory = _uniswapV3Factory;
        swapRouter = ISwapRouter02(_UNISWAP_V3_SWAP_ROUTER_ADDRESS);
    }

    function executeDebtSwap(
        address _flashloanPool,
        address _fromAsset,
        address _toAsset,
        address _fromCContract,
        address _toCContract,
        address _collateralAsset,
        uint256 _collateralAmount,
        uint256 _amount,
        uint256 _amountInMaximum
    ) public {
        IERC20 fromToken = IERC20(_fromAsset);

        pool = IUniswapV3Pool(_flashloanPool);

        address token0 = pool.token0();
        uint256 amount0 = _fromAsset == token0 ? _amount : 0;
        uint256 amount1 = _fromAsset == token0 ? 0 : _amount;

        bytes memory data = abi.encode(
            FlashCallbackData({
                poolKey: _flashloanPool,
                amount: _amount,
                caller: msg.sender,
                fromAsset: _fromAsset,
                toAsset: _toAsset,
                fromCContract: _fromCContract,
                toCContract: _toCContract,
                collateralAsset: _collateralAsset,
                collateralAmount: _collateralAmount,
                amountInMaximum: _amountInMaximum
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
        require(msg.sender == address(decoded.poolKey));

        // suppose either of fee0 or fee1 is 0
        uint totalFee = fee0 + fee1;

        IERC20 fromToken = IERC20(decoded.fromAsset);
        IERC20 toToken = IERC20(decoded.toAsset);

        compoundSwap(
            address(decoded.fromAsset),
            address(decoded.toAsset),
            decoded.fromCContract,
            decoded.toCContract,
            decoded.collateralAsset,
            decoded.collateralAmount,
            decoded.amount,
            decoded.amountInMaximum,
            totalFee,
            decoded.caller
        );

        fromToken.transfer(address(pool), decoded.amount + totalFee);

        // repay remaining amount
        uint256 remainingBalance = toToken.balanceOf(address(this));

        IERC20(decoded.toAsset).approve(
            address(decoded.toCContract),
            remainingBalance
        );
        IComet toComet = IComet(decoded.toCContract);
        toComet.supply(decoded.toAsset, remainingBalance);
    }

    function compoundSwap(
        address fromAsset,
        address toAsset,
        address fromCContract,
        address toCContract,
        address collateralAsset,
        uint256 collateralAmount,
        uint256 amount,
        uint256 amountInMaximum,
        uint256 totalFee,
        address caller
    ) internal {
        IComet fromComet = IComet(fromCContract);
        IComet toComet = IComet(toCContract);

        // repay
        fromComet.supplyFrom(caller, caller, fromAsset, amount);
        console.log("repay done");

        // withdraw collateral
        fromComet.withdrawFrom(
            caller,
            caller,
            collateralAsset,
            collateralAmount
        );
        console.log("withdraw collateral done");

        // // supply collateral
        toComet.supplyFrom(caller, caller, collateralAsset, collateralAmount);
        console.log("supply done");

        // new borrow
        toComet.withdrawFrom(
            caller,
            address(this),
            toAsset,
            amountInMaximum + totalFee
        );
        console.log("borrow done");

        swapToken(
            address(toAsset),
            address(fromAsset),
            amount + totalFee,
            amountInMaximum
        );
    }

    function swapToken(
        address inputToken,
        address outputToken,
        uint256 amountOut,
        uint256 amountInMaximum
    ) public {
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
    }
}
