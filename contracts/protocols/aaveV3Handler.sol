// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import "../interfaces/IProtocolHandler.sol";
import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import {IPoolV3} from "../interfaces/aaveV3/IPoolV3.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import "hardhat/console.sol";
import {DataTypes} from "../interfaces/aaveV3/DataTypes.sol";
import {IAaveProtocolDataProvider} from "../interfaces/aaveV3/IAaveProtocolDataProvider.sol";

contract AaveV3Handler is IProtocolHandler {
    using GPv2SafeERC20 for IERC20;

    IPoolV3 public immutable aaveV3Pool;
    IAaveProtocolDataProvider public immutable dataProvider;

    constructor(address _AAVE_V3_POOL_ADDRESS, address _AAVE_V3_DATA_PROVIDER_ADDRESS) {
        aaveV3Pool = IPoolV3(_AAVE_V3_POOL_ADDRESS);
        dataProvider = IAaveProtocolDataProvider(_AAVE_V3_DATA_PROVIDER_ADDRESS);
    }

    function getDebtAmount(
        address asset,
        address onBehalfOf,
        bytes calldata fromExtraData
    ) public view returns (uint256) {
        (, , uint256 currentVariableDebt, , , , , , ) = dataProvider.getUserReserveData(asset, onBehalfOf);
        return currentVariableDebt;
    }

    function switchIn(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountTotal,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata fromExtraData,
        bytes calldata toExtraData
    ) external override {
        repay(address(fromAsset), amount, onBehalfOf, fromExtraData);
        aaveV3Pool.borrow(address(toAsset), amountTotal, 2, 0, onBehalfOf);
    }

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override {
        repay(address(fromAsset), amount, onBehalfOf, extraData);

        for (uint256 i = 0; i < collateralAssets.length; i++) {
            require(collateralAssets[i].amount > 0, "Invalid collateral amount");

            DataTypes.ReserveData memory reserveData = aaveV3Pool.getReserveData(collateralAssets[i].asset);

            IERC20(reserveData.aTokenAddress).safeTransferFrom(onBehalfOf, address(this), collateralAssets[i].amount);

            aaveV3Pool.withdraw(collateralAssets[i].asset, collateralAssets[i].amount, address(this));
        }
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override {
        for (uint256 i = 0; i < collateralAssets.length; i++) {
            uint256 currentBalance = IERC20(collateralAssets[i].asset).balanceOf(address(this));

            IERC20(collateralAssets[i].asset).approve(address(aaveV3Pool), currentBalance);
            aaveV3Pool.supply(collateralAssets[i].asset, currentBalance, onBehalfOf, 0);
        }
        aaveV3Pool.borrow(toAsset, amount, 2, 0, onBehalfOf);
    }

    function supply(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external override {
        IERC20(asset).approve(address(aaveV3Pool), amount);
        aaveV3Pool.supply(asset, amount, onBehalfOf, 0);
    }

    function borrow(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external override {
        aaveV3Pool.borrow(asset, amount, 2, 0, onBehalfOf);
    }

    function repay(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) public {
        IERC20(asset).approve(address(aaveV3Pool), amount);
        aaveV3Pool.repay(asset, amount, 2, onBehalfOf);
    }
}
