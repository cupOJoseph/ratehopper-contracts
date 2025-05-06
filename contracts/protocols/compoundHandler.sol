// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IProtocolHandler} from "../interfaces/IProtocolHandler.sol";
import {IComet} from "../interfaces/compound/IComet.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import {ProtocolRegistry} from "../ProtocolRegistry.sol";
import {CollateralAsset} from "../Types.sol";

contract CompoundHandler is IProtocolHandler {
    ProtocolRegistry public immutable REGISTRY;

    constructor(address _registry) {
        REGISTRY = ProtocolRegistry(_registry);
    }

    function getCContract(address token) internal view returns (address) {
        return REGISTRY.getCContract(token);
    }

    function getDebtAmount(
        address asset,
        address onBehalfOf,
        bytes calldata /* extraData */
    ) public view returns (uint256) {
        address cContract = getCContract(asset);
        require(cContract != address(0), "Token not registered");

        IComet comet = IComet(cContract);
        return comet.borrowBalanceOf(onBehalfOf);
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
        bytes calldata /* extraData */
    ) public override {
        address cContract = getCContract(fromAsset);
        require(cContract != address(0), "Token not registered");

        IComet fromComet = IComet(cContract);

        IERC20(fromAsset).approve(address(cContract), type(uint256).max);
        fromComet.supplyTo(onBehalfOf, fromAsset, amount);

        // withdraw collateral
        for (uint256 i = 0; i < collateralAssets.length; i++) {
            require(collateralAssets[i].amount > 0, "Invalid collateral amount");
            fromComet.withdrawFrom(onBehalfOf, address(this), collateralAssets[i].asset, collateralAssets[i].amount);
        }
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata /* extraData */
    ) public override {
        address cContract = getCContract(toAsset);
        require(cContract != address(0), "Token not registered");

        IComet toComet = IComet(cContract);
        for (uint256 i = 0; i < collateralAssets.length; i++) {
            uint256 currentBalance = IERC20(collateralAssets[i].asset).balanceOf(address(this));
            IERC20(collateralAssets[i].asset).approve(address(cContract), currentBalance);

            // supply collateral
            toComet.supplyTo(onBehalfOf, collateralAssets[i].asset, currentBalance);
        }

        // borrow
        toComet.withdrawFrom(onBehalfOf, address(this), toAsset, amount);
    }

    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata /* extraData */
    ) external override {
        address cContract = getCContract(asset);
        require(cContract != address(0), "Token not registered");

        IERC20(asset).approve(address(cContract), amount);
        // supply collateral
        IComet(cContract).supplyTo(onBehalfOf, asset, amount);
    }

    function borrow(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata /* extraData */
    ) external override {
        address cContract = getCContract(asset);
        require(cContract != address(0), "Token not registered");

        IComet comet = IComet(cContract);
        comet.withdrawFrom(onBehalfOf, address(this), asset, amount);
    }

    function repay(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata /* extraData */
    ) external override {
        address cContract = getCContract(asset);
        require(cContract != address(0), "Token not registered");

        IERC20(asset).approve(address(cContract), amount);
        IComet toComet = IComet(cContract);
        toComet.supplyTo(onBehalfOf, asset, amount);
    }
}
