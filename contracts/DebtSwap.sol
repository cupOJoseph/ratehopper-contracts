// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

import {IERC20} from "./dependencies/IERC20.sol";
import {GPv2SafeERC20} from "./dependencies/GPv2SafeERC20.sol";
import {IFlashLoanSimpleReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";
import {IPoolV3} from "./interfaces/aaveV3/IPoolV3.sol";
import {IDebtToken} from "./interfaces/aaveV3/IDebtToken.sol";
import {IAaveProtocolDataProvider} from "./interfaces/aaveV3/IAaveProtocolDataProvider.sol";
import {IRouter} from "./interfaces/aerodrome/IRouter.sol";
import {IUniswapV3Pool} from "./interfaces/uniswapV3/IUniswapV3Pool.sol";

import "hardhat/console.sol";

contract DebtSwap {
    using GPv2SafeERC20 for IERC20;

    address internal constant aerodromeFactoryAddress = 0x420DD381b31aEf6683db6B902084cB0FFECe40Da;
    address internal constant aerodromeRouterAddress = 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43;

    IPoolV3 public aaveV3Pool;
    IAaveProtocolDataProvider public aaveV3ProtocolDataProvider;
    IRouter public aerodromeRouter;
    IUniswapV3Pool public  pool;

    IERC20 private  token0;
    IERC20 private  token1;

    struct FlashCallbackData {
        uint256 amount0;
        uint256 amount1;
        address caller;
        address fromAsset;
        address toAsset;
        uint256 amountOutMin;
        uint256 deadline;
    }
    
    constructor(address _aaveV3PoolAddress) {
        aaveV3Pool = IPoolV3(_aaveV3PoolAddress);
        aerodromeRouter = IRouter(aerodromeRouterAddress);
    }

    function executeDebtSwap(address _pool, uint256 amount0, uint256 amount1, address fromAsset, address toAsset, uint256 amountOutMin, uint256 deadline) public {
        token0 = IERC20(fromAsset);
        token1 = IERC20(toAsset);

        bytes memory data = abi.encode(
            FlashCallbackData({
                amount0: amount0,
                amount1: amount1,
                caller: msg.sender,
                fromAsset: fromAsset,
                toAsset: toAsset,
                amountOutMin: amountOutMin,
                deadline: deadline
            })
        );
        pool = IUniswapV3Pool(_pool);
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
    
        // todo: implement this
        //CallbackValidation.verifyCallback(factory, decoded.poolKey);

        aaveV3Swap(address(decoded.fromAsset), address(decoded.toAsset), decoded.amount0, decoded.amountOutMin, decoded.deadline, decoded.caller);

        console.log("tokenBalanceOnThisContract=",token0.balanceOf(address(this)));
        console.log("fee0=", fee0);
        console.log("fee1=", fee1);
        console.log("borrowedAmount=", decoded.amount0);
        // suppose either of fee0 or fee1 is 0
        token0.transfer(address(pool), decoded.amount0 + fee0 + fee1);
        

    }

    function aaveV3Swap(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountOutMin,
        uint256 deadline,
        address caller
    ) public {
        aaveV3Repay(address(fromAsset), amount, caller);
        console.log("repay done");
        aaveV3Borrow(address(toAsset), amount, caller);
        console.log("borrow done");
        swapToken(address(toAsset), address(fromAsset), amount, amountOutMin, deadline);
        console.log("swap done");
    }

    function swapToken(
        address inputToken,
        address outputToken,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline
    ) public {
        // IERC20(inputToken).safeTransferFrom(caller, address(this), amountIn);
        IERC20 token = IERC20(inputToken);
        console.log("inputTokenBorrowedOnThisContract=",token.balanceOf(address(this)));
        IERC20(inputToken).approve(address(aerodromeRouter), amountIn);

        IRouter.Route[] memory routes = new IRouter.Route[](1);
        routes[0] = IRouter.Route({
            from: inputToken,
            to: outputToken,
            stable: true,
            factory: address(aerodromeFactoryAddress)
        });

        aerodromeRouter.swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            routes,
            address(this),
            deadline
        );
    }


    function aaveV3Supply(address asset, uint256 amount, address caller) public {
        IERC20(asset).safeTransferFrom(caller, address(this), amount);
        IERC20(asset).approve(address(aaveV3Pool), amount);
        aaveV3Pool.supply(asset, amount, caller, 0);
    }

    function aaveV3Withdraw(address asset, uint amount, address caller) public {
        aaveV3Pool.withdraw(asset, amount, caller);
    }

    function aaveV3Repay(address asset, uint256 amount, address caller) public returns (uint256) {
        IERC20(asset).approve(address(aaveV3Pool), amount);
        return aaveV3Pool.repay(asset, amount, 2, caller);
    }

    function aaveV3Borrow(address asset, uint256 amount, address caller) public {
        aaveV3Pool.borrow(asset, amount, 2, 0, caller);
    }


    // callback function we need to implement for aave v3 flashloan
    // function executeOperation(
    //     address asset,
    //     uint256 amount,
    //     uint256 premium,
    //     address initiator,
    //     bytes calldata params
    // ) external returns (bool) {
    //     address debtTokenAddress = abi.decode(params, (address));

    //     uint256 testSupplyAmount = 1;
    //     uint256 amountOwing = amount + premium + testSupplyAmount;
    //     // Repay the loan + premium (the fee charged by Aave for flash loan)
    //     IERC20(asset).approve(address(aaveV3Pool), amountOwing);

    //     // write our own logic to use flashloan
    //     aaveV3Pool.supply(asset, testSupplyAmount, initiator, 0);

    //     return true;
    // }
}
