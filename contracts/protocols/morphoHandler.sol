// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IProtocolHandler.sol";
import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import {DataTypes} from "../interfaces/aaveV3/DataTypes.sol";
import "../interfaces/morpho/IMorpho.sol";
import {MarketParamsLib} from "../dependencies/morpho/MarketParamsLib.sol";
import "../dependencies/TransferHelper.sol";

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
        (MarketParams memory marketParams, ) = abi.decode(fromExtraData, (MarketParams, uint256));

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
        uint256 amountTotal,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata fromExtraData,
        bytes calldata toExtraData
    ) external override {
        switchFrom(fromAsset, amount, onBehalfOf, collateralAssets, fromExtraData);
        switchTo(toAsset, amountTotal, onBehalfOf, collateralAssets, toExtraData);
    }

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) public override {
        // only one collateral asset is supported on Morpho
        require(collateralAssets[0].amount > 0, "Invalid collateral amount");

        (MarketParams memory marketParams, uint256 borrowShares) = abi.decode(extraData, (MarketParams, uint256));
        require(marketParams.loanToken == fromAsset, "fromAsset mismatch with marketParams in extraData");

        TransferHelper.safeApprove(fromAsset, address(morpho), amount);
        morpho.repay(marketParams, 0, borrowShares, onBehalfOf, "");
        morpho.withdrawCollateral(marketParams, collateralAssets[0].amount, onBehalfOf, address(this));
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) public override {
        (MarketParams memory marketParams, ) = abi.decode(extraData, (MarketParams, uint256));
        require(marketParams.loanToken == toAsset, "toAsset mismatch with marketParams in extraData");

        // only one collateral asset is supported on Morpho
        uint256 currentBalance = IERC20(collateralAssets[0].asset).balanceOf(address(this));

        TransferHelper.safeApprove(marketParams.collateralToken, address(morpho), currentBalance);
        morpho.supplyCollateral(marketParams, currentBalance, onBehalfOf, "");

        morpho.borrow(marketParams, amount, 0, onBehalfOf, address(this));
    }

    function supply(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external override {
        (MarketParams memory marketParams, ) = abi.decode(extraData, (MarketParams, uint256));

        TransferHelper.safeApprove(asset, address(morpho), amount);
        morpho.supplyCollateral(marketParams, amount, onBehalfOf, "");
    }

    function borrow(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external override {
        (MarketParams memory marketParams, ) = abi.decode(extraData, (MarketParams, uint256));

        morpho.borrow(marketParams, amount, 0, onBehalfOf, address(this));
    }

    function repay(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) public {
        (MarketParams memory marketParams, ) = abi.decode(extraData, (MarketParams, uint256));

        TransferHelper.safeApprove(asset, address(morpho), amount);
        morpho.repay(marketParams, amount, 0, onBehalfOf, "");
    }
}
