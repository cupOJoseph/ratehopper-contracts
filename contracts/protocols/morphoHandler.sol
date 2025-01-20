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
    IMorpho public immutable morpho;

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
        bytes calldata fromExtraData,
        bytes calldata toExtraData
    ) external override {
        switchFrom(fromAsset, amount, onBehalfOf, fromExtraData);
        switchTo(toAsset, amountInMaximum + totalFee, onBehalfOf, toExtraData);
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
            uint256 lltv,
            uint256 borrowShares
        ) = abi.decode(
                extraData,
                (uint256, address, address, address, address, uint256, uint256)
            );

        MarketParams memory marketParams = MarketParams({
            loanToken: loanToken,
            collateralToken: collateralToken,
            oracle: oracle,
            irm: irm,
            lltv: lltv
        });

        IERC20(fromAsset).approve(address(morpho), amount);

        morpho.repay(marketParams, 0, borrowShares, onBehalfOf, "");
        console.log("repay done");

        morpho.withdrawCollateral(
            marketParams,
            collateralAmount,
            onBehalfOf,
            address(this)
        );
        console.log("withdrawCollateral done");
    }

    function switchTo(
        address toAsset,
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

        MarketParams memory marketParams = MarketParams({
            loanToken: loanToken,
            collateralToken: collateralToken,
            oracle: oracle,
            irm: irm,
            lltv: lltv
        });

        IERC20(collateralToken).approve(address(morpho), collateralAmount);
        morpho.supplyCollateral(marketParams, collateralAmount, onBehalfOf, "");
        console.log("supplyCollateral done");
        morpho.borrow(marketParams, amount, 0, onBehalfOf, address(this));
        console.log("borrow done");
    }

    function repay(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) public {
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

        MarketParams memory marketParams = MarketParams({
            loanToken: loanToken,
            collateralToken: collateralToken,
            oracle: oracle,
            irm: irm,
            lltv: lltv
        });

        IERC20(asset).approve(address(morpho), amount);
        morpho.repay(marketParams, amount, 0, onBehalfOf, "");
    }
}
