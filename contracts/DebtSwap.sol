// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

import {IERC20} from "./dependencies/IERC20.sol";
import {GPv2SafeERC20} from "./dependencies/GPv2SafeERC20.sol";
import {IFlashLoanSimpleReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";
import {IPoolV3} from "./interfaces/aaveV3/IPoolV3.sol";
import {IDebtToken} from "./interfaces/aaveV3/IDebtToken.sol";
import {IAaveProtocolDataProvider} from "./interfaces/aaveV3/IAaveProtocolDataProvider.sol";
import {IRouter} from "./interfaces/aerodrome/IRouter.sol";

import "hardhat/console.sol";

contract DebtSwap {
    using GPv2SafeERC20 for IERC20;

    address internal constant aerodromeFactoryAddress = 0x420DD381b31aEf6683db6B902084cB0FFECe40Da;
    address internal constant aerodromeRouterAddress = 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43;

    IPoolV3 public aaveV3Pool;
    IAaveProtocolDataProvider public aaveV3ProtocolDataProvider;
    IRouter public aerodromeRouter;

    constructor(address _aaveV3PoolAddress) {
        aaveV3Pool = IPoolV3(_aaveV3PoolAddress);
        aerodromeRouter = IRouter(aerodromeRouterAddress);
    }

    function aaveV3Swap(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountOutMin,
        uint256 deadline
    ) public {
        // TODO: implement flashloan

        aaveV3Repay(address(fromAsset), amount);
        aaveV3Borrow(address(toAsset), amount);
        swapToken(address(fromAsset), address(toAsset), amount, amountOutMin, deadline);
    }

    function swapToken(
        address inputToken,
        address outputToken,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline
    ) public {
        IERC20(inputToken).safeTransferFrom(msg.sender, address(this), amountIn);
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
            msg.sender,
            deadline
        );
    }

    function aaveV3Supply(address asset, uint256 amount) public {
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(asset).approve(address(aaveV3Pool), amount);
        aaveV3Pool.supply(asset, amount, msg.sender, 0);
    }

    function aaveV3Withdraw(address asset, uint amount) public {
        aaveV3Pool.withdraw(asset, amount, msg.sender);
    }

    function aaveV3Repay(address asset, uint256 amount) public returns (uint256) {
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(asset).approve(address(aaveV3Pool), amount);
        return aaveV3Pool.repay(asset, amount, 2, msg.sender);
    }

    function aaveV3Borrow(address asset, uint256 amount) public {
        aaveV3Pool.borrow(asset, amount, 2, 0, msg.sender);
        IERC20(asset).safeTransfer(msg.sender, amount);
    }

    // callback function we need to implement for aave v3 flashloan
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        address debtTokenAddress = abi.decode(params, (address));

        uint256 testSupplyAmount = 1;
        uint256 amountOwing = amount + premium + testSupplyAmount;
        // Repay the loan + premium (the fee charged by Aave for flash loan)
        IERC20(asset).approve(address(aaveV3Pool), amountOwing);

        // write our own logic to use flashloan
        aaveV3Pool.supply(asset, testSupplyAmount, initiator, 0);

        return true;
    }
}
