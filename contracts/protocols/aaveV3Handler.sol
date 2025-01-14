pragma solidity =0.8.27;

import "../interfaces/IProtocolHandler.sol";
import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import {IPoolV3} from "../interfaces/aaveV3/IPoolV3.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import "hardhat/console.sol";

contract AaveV3Handler is IProtocolHandler {
    using GPv2SafeERC20 for IERC20;

    IPoolV3 public immutable aaveV3Pool;

    constructor(address _AAVE_V3_POOL_ADDRESS) {
        aaveV3Pool = IPoolV3(_AAVE_V3_POOL_ADDRESS);
    }

    function switchIn(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountInMaximum,
        uint256 totalFee,
        address onBehalfOf,
        bytes calldata extraData // Not used for AAVE V3, but kept for compatibility
    ) external override {
        aaveV3Repay(address(fromAsset), amount, onBehalfOf);
        aaveV3Pool.borrow(
            address(toAsset),
            amountInMaximum + totalFee,
            2,
            0,
            onBehalfOf
        );
    }

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external override {
        (
            address aToken,
            address collateralAsset,
            uint256 collateralAmount
        ) = abi.decode(extraData, (address, address, uint256));

        aaveV3Repay(address(fromAsset), amount, onBehalfOf);
        console.log("repay done");
        // TODO: get aToken address
        IERC20(aToken).safeTransferFrom(
            onBehalfOf,
            address(this),
            collateralAmount
        );
        aaveV3Pool.withdraw(collateralAsset, collateralAmount, address(this));
        console.log("withdraw done");
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external override {
        (address collateralAsset, uint256 collateralAmount) = abi.decode(
            extraData,
            (address, uint256)
        );

        uint256 collateralTokenBalance = IERC20(collateralAsset).balanceOf(
            address(this)
        );

        IERC20(collateralAsset).approve(address(aaveV3Pool), collateralAmount);
        aaveV3Pool.supply(collateralAsset, collateralAmount, onBehalfOf, 0);

        console.log("aave v3 supply done");

        aaveV3Pool.borrow(toAsset, amount, 2, 0, onBehalfOf);
        console.log("aave v3 borrow done");
    }

    function repayRemainingBalance(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external {
        aaveV3Repay(asset, amount, onBehalfOf);
    }

    function aaveV3Repay(
        address asset,
        uint256 amount,
        address onBehalfOf
    ) internal returns (uint256) {
        IERC20(asset).approve(address(aaveV3Pool), amount);
        return aaveV3Pool.repay(asset, amount, 2, onBehalfOf);
    }
}
