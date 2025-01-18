// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

import "../interfaces/IProtocolHandler.sol";
import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import "hardhat/console.sol";
import {DataTypes} from "../interfaces/aaveV3/DataTypes.sol";
import "../interfaces/morpho/IMorpho.sol";

contract MorphoHandler is IProtocolHandler {
    using GPv2SafeERC20 for IERC20;
    IMorphoBase public morpho;

    constructor(address _MORPHO_ADDRESS) {
        morpho = IMorpho(_MORPHO_ADDRESS);
    }

    function switchIn(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountInMaximum,
        uint256 totalFee,
        address onBehalfOf,
        bytes calldata extraData
    ) external override {
        switchFrom(fromAsset, amount, onBehalfOf, extraData);
        switchTo(toAsset, amountInMaximum + totalFee, onBehalfOf, extraData);
    }

    function supply(
        MarketParams calldata marketParams,
        address fromAsset,
        uint256 amount,
        address onBehalfOf
    ) public {}

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) public override {
        (
            uint256 collateralAmount,
            address loanToken,
            address collateralToken,
            address oracle,
            address irm,
            uint256 lltv
        ) = abi.decode(
                extraData,
                (uint256, address, address, address, address, uint256)
            );
        console.log("collateralAmount", collateralAmount);
        console.log("loanToken", loanToken);
        console.log("collateralToken", collateralToken);
        console.log("oracle", oracle);
        console.log("irm", irm);
        console.log("lltv", lltv);

        MarketParams memory marketParams = MarketParams(
            loanToken,
            collateralToken,
            oracle,
            irm,
            lltv
        );

        IERC20(fromAsset).safeTransferFrom(onBehalfOf, address(this), amount);
        IERC20(fromAsset).approve(address(morpho), amount);
        morpho.repay(marketParams, amount, 0, onBehalfOf, "");

        morpho.withdrawCollateral(
            marketParams,
            collateralAmount,
            onBehalfOf,
            onBehalfOf
        );
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) public override {
        (
            address collateralAsset,
            uint256 collateralAmount,
            MarketParams memory marketParams
        ) = abi.decode(extraData, (address, uint256, MarketParams));

        IERC20(toAsset).safeTransferFrom(onBehalfOf, address(this), amount);
        IERC20(toAsset).approve(address(morpho), amount);
        morpho.supplyCollateral(marketParams, amount, onBehalfOf, "");
        morpho.borrow(
            marketParams,
            collateralAmount,
            0,
            onBehalfOf,
            onBehalfOf
        );
    }

    function repay(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) public {
        (
            address collateralAsset,
            uint256 collateralAmount,
            MarketParams memory marketParams
        ) = abi.decode(extraData, (address, uint256, MarketParams));

        IERC20(asset).safeTransferFrom(onBehalfOf, address(this), amount);
        IERC20(asset).approve(address(morpho), amount);
        morpho.repay(marketParams, amount, 0, onBehalfOf, "");
    }
}
