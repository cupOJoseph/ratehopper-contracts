// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

import "../interfaces/IProtocolHandler.sol";
import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import "hardhat/console.sol";
import {DataTypes} from "../interfaces/aaveV3/DataTypes.sol";
import "../interfaces/morpho/IMorpho.sol";
import {MarketParamsLib} from "../dependencies/morpho/MarketParamsLib.sol";

contract MorphoHandler is IProtocolHandler {
    using MarketParamsLib for MarketParams;

    using GPv2SafeERC20 for IERC20;
    IMorpho public immutable morpho;

    constructor(address _MORPHO_ADDRESS) {
        morpho = IMorpho(_MORPHO_ADDRESS);
    }

    function getDebtAmount(
        address asset,
        address onBehalfOf,
        bytes calldata fromExtraData
    ) public view returns (uint256) {
        (
            uint256 collateralAmount,
            address loanToken,
            address collateralToken,
            address oracle,
            address irm,
            uint256 lltv,
            uint256 borrowShares
        ) = abi.decode(
                fromExtraData,
                (uint256, address, address, address, address, uint256, uint256)
            );
        MarketParams memory marketParams = MarketParams({
            loanToken: loanToken,
            collateralToken: collateralToken,
            oracle: oracle,
            irm: irm,
            lltv: lltv
        });

        Id marketId = marketParams.id();

        Position memory p = morpho.position(marketId, onBehalfOf);
        Market memory m = morpho.market(marketId);
        uint256 totalBorrowAssets = m.totalBorrowAssets + 1;
        uint256 totalBorrowShares = m.totalBorrowShares + 1000000;

        uint256 result1 = p.borrowShares * totalBorrowAssets;
        uint256 result2 = totalBorrowShares - 1;

        return (result1 / result2) + 1;
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

        IERC20(fromAsset).approve(address(morpho), type(uint256).max);

        morpho.repay(marketParams, 0, borrowShares, onBehalfOf, "");

        morpho.withdrawCollateral(
            marketParams,
            collateralAmount,
            onBehalfOf,
            address(this)
        );
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

        morpho.borrow(marketParams, amount, 0, onBehalfOf, address(this));
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
