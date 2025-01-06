// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

import {IERC20} from "./dependencies/IERC20.sol";
import {GPv2SafeERC20} from "./dependencies/GPv2SafeERC20.sol";
import {IFlashLoanSimpleReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";
import {IPoolV3} from "./interfaces/aaveV3/IPoolV3.sol";
import {IDebtToken} from "./interfaces/aaveV3/IDebtToken.sol";
import {IAaveProtocolDataProvider} from "./interfaces/aaveV3/IAaveProtocolDataProvider.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {ISwapRouter02} from "./interfaces/uniswapV3/ISwapRouter02.sol";
import {IV3SwapRouter} from "./interfaces/uniswapV3/IV3SwapRouter.sol";
import {PoolAddress} from "./dependencies/uniswapV3/PoolAddress.sol";

import "hardhat/console.sol";

contract DebtSwap {
    using GPv2SafeERC20 for IERC20;

    IPoolV3 public immutable aaveV3Pool;
    IAaveProtocolDataProvider public immutable aaveV3ProtocolDataProvider;
    IUniswapV3Pool public  pool;
    ISwapRouter02 public immutable swapRouter;
    address public immutable uniswapV3Factory;

    struct FlashCallbackData {
        address poolKey;
        uint256 amount;
        address caller;
        address fromAsset;
        address toAsset;
        uint256 amountInMaximum;
    }
    
    constructor(address _aaveV3PoolAddress, address _uniswapV3Factory, address _swapRouterAddress) {
        aaveV3Pool = IPoolV3(_aaveV3PoolAddress);
        uniswapV3Factory = _uniswapV3Factory;
        swapRouter = ISwapRouter02(_swapRouterAddress);
    }

    function executeDebtSwap(address _flashloanPool, address fromAsset, address toAsset, uint256 amount, uint256 amountInMaximum) public {
        IERC20 fromToken = IERC20(fromAsset);
        
        pool = IUniswapV3Pool(_flashloanPool);
    
        address token0 = pool.token0();
        uint256 amount0 = fromAsset == token0 ? amount : 0;
        uint256 amount1 = fromAsset == token0 ? 0 : amount;

        bytes memory data = abi.encode(
            FlashCallbackData({
                poolKey: _flashloanPool,
                amount: amount,
                caller: msg.sender,
                fromAsset: fromAsset,
                toAsset: toAsset,
                amountInMaximum: amountInMaximum
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
        console.log("tokenBalanceOnThisContract=",fromToken.balanceOf(address(this)));
        console.log("fee0=", fee0);
        console.log("fee1=", fee1);
        console.log("borrowedAmount=", decoded.amount + totalFee);

        aaveV3Swap(address(decoded.fromAsset), address(decoded.toAsset), decoded.amount, decoded.amountInMaximum, totalFee, decoded.caller);

        
        fromToken.transfer(address(pool), decoded.amount + totalFee);

        // console.log("remainingBalance=",fromToken.balanceOf(address(this)));
        uint256 remainingBalance = toToken.balanceOf(address(this));
        console.log("remainingBalanceOfToToken=", remainingBalance);

        aaveV3Repay(decoded.toAsset, remainingBalance, decoded.caller);
    }

    function aaveV3Swap(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountInMaximum,
        uint256 totalFee,
        address caller
    ) public {
        aaveV3Repay(address(fromAsset), amount, caller);
        aaveV3Pool.borrow(address(toAsset), amountInMaximum + totalFee, 2, 0, caller);
        swapToken(address(toAsset), address(fromAsset), amount + totalFee, amountInMaximum);
    }

    function swapToken(
        address inputToken,
        address outputToken,
        uint256 amountOut,
        uint256 amountInMaximum
    ) public {
        IERC20(inputToken).approve(address(swapRouter), amountInMaximum);
        IERC20 fromTokenContract = IERC20(inputToken);

        console.log("input token balance=",fromTokenContract.balanceOf(address(this)));
        console.log("amountInMaximum=", amountInMaximum);
        console.log("amount=", amountOut);

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

    function aaveV3Supply(address asset, uint256 amount, address caller) public {
        IERC20(asset).safeTransferFrom(caller, address(this), amount);
        IERC20(asset).approve(address(aaveV3Pool), amount);
        aaveV3Pool.supply(asset, amount, caller, 0);
    }

    function aaveV3Repay(address asset, uint256 amount, address caller) public returns (uint256) {
        IERC20(asset).approve(address(aaveV3Pool), amount);
        return aaveV3Pool.repay(asset, amount, 2, caller);
    }
}
