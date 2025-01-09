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

contract DebtSwap {
    using GPv2SafeERC20 for IERC20;

    // TODO: extract this to another registry contract
    IPoolV3 public immutable aaveV3Pool;

    IUniswapV3Pool public pool;
    ISwapRouter02 public immutable swapRouter;
    address public immutable uniswapV3Factory;

    enum Protocol {
        AAVE_V3,
        COMPOUND
    }

    struct FlashCallbackData {
        Protocol protocol;
        address flashloanPool;
        address fromAsset;
        address toAsset;
        uint256 amount;
        uint256 amountInMaximum;
        address onBehalfOf;
        bytes extraData;
    }

    constructor(
        address _aaveV3PoolAddress,
        address _uniswapV3Factory,
        address _UNISWAP_V3_SWAP_ROUTER_ADDRESS
    ) {
        aaveV3Pool = IPoolV3(_aaveV3PoolAddress);
        uniswapV3Factory = _uniswapV3Factory;
        swapRouter = ISwapRouter02(_UNISWAP_V3_SWAP_ROUTER_ADDRESS);
    }

    function executeDebtSwap(
        Protocol _protocol,
        address _flashloanPool,
        address _fromAsset,
        address _toAsset,
        uint256 _amount,
        uint256 _amountInMaximum,
        bytes calldata _extraData
    ) public {
        pool = IUniswapV3Pool(_flashloanPool);

        address token0 = pool.token0();
        uint256 amount0 = _fromAsset == token0 ? _amount : 0;
        uint256 amount1 = _fromAsset == token0 ? 0 : _amount;

        bytes memory data = abi.encode(
            FlashCallbackData({
                protocol: _protocol,
                flashloanPool: _flashloanPool,
                fromAsset: _fromAsset,
                toAsset: _toAsset,
                amount: _amount,
                amountInMaximum: _amountInMaximum,
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

        // implement the same logic as CallbackValidation.verifyCallback()
        require(msg.sender == address(decoded.flashloanPool));

        // suppose either of fee0 or fee1 is 0
        uint totalFee = fee0 + fee1;

        IERC20 fromToken = IERC20(decoded.fromAsset);
        IERC20 toToken = IERC20(decoded.toAsset);

        // TODO: refactor this
        if (decoded.protocol == Protocol.COMPOUND) {
            compoundSwap(
                address(decoded.fromAsset),
                address(decoded.toAsset),
                decoded.amount,
                decoded.amountInMaximum,
                totalFee,
                decoded.onBehalfOf,
                decoded.extraData
            );
        } else if (decoded.protocol == Protocol.AAVE_V3) {
            aaveV3Swap(
                address(decoded.fromAsset),
                address(decoded.toAsset),
                decoded.amount,
                decoded.amountInMaximum,
                totalFee,
                decoded.onBehalfOf
            );
        }

        fromToken.transfer(address(pool), decoded.amount + totalFee);

        // repay remaining amount
        uint256 remainingBalance = toToken.balanceOf(address(this));

        if (decoded.protocol == Protocol.COMPOUND) {
            (, address toCContract, , ) = abi.decode(
                decoded.extraData,
                (address, address, address, uint256)
            );
            IERC20(decoded.toAsset).approve(
                address(toCContract),
                remainingBalance
            );
            IComet toComet = IComet(toCContract);
            toComet.supply(decoded.toAsset, remainingBalance);
        } else if (decoded.protocol == Protocol.AAVE_V3) {
            aaveV3Repay(decoded.toAsset, remainingBalance, decoded.onBehalfOf);
        }
    }

    function compoundSwap(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountInMaximum,
        uint256 totalFee,
        address onBehalfOf,
        bytes memory extraData
    ) internal {
        (
            address fromCContract,
            address toCContract,
            address collateralAsset,
            uint256 collateralAmount
        ) = abi.decode(extraData, (address, address, address, uint256));

        IComet fromComet = IComet(fromCContract);
        IComet toComet = IComet(toCContract);

        // repay
        fromComet.supplyFrom(onBehalfOf, onBehalfOf, fromAsset, amount);
        console.log("repay done");

        // withdraw collateral
        fromComet.withdrawFrom(
            onBehalfOf,
            onBehalfOf,
            collateralAsset,
            collateralAmount
        );
        console.log("withdraw collateral done");

        // // supply collateral
        toComet.supplyFrom(
            onBehalfOf,
            onBehalfOf,
            collateralAsset,
            collateralAmount
        );
        console.log("supply done");

        // new borrow
        toComet.withdrawFrom(
            onBehalfOf,
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

    function aaveV3Swap(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountInMaximum,
        uint256 totalFee,
        address onBehalfOf
    ) public {
        aaveV3Repay(address(fromAsset), amount, onBehalfOf);
        aaveV3Pool.borrow(
            address(toAsset),
            amountInMaximum + totalFee,
            2,
            0,
            onBehalfOf
        );
        swapToken(
            address(toAsset),
            address(fromAsset),
            amount + totalFee,
            amountInMaximum
        );
    }

    function aaveV3Supply(
        address asset,
        uint256 amount,
        address onBehalfOf
    ) public {
        IERC20(asset).safeTransferFrom(onBehalfOf, address(this), amount);
        IERC20(asset).approve(address(aaveV3Pool), amount);
        aaveV3Pool.supply(asset, amount, onBehalfOf, 0);
    }

    function aaveV3Repay(
        address asset,
        uint256 amount,
        address onBehalfOf
    ) public returns (uint256) {
        IERC20(asset).approve(address(aaveV3Pool), amount);
        return aaveV3Pool.repay(asset, amount, 2, onBehalfOf);
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
