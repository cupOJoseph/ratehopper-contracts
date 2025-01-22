pragma solidity =0.8.27;

import "../interfaces/IProtocolHandler.sol";
import {IComet} from "../interfaces/compound/IComet.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import "hardhat/console.sol";

contract CompoundHandler is IProtocolHandler {
    function getDebtAmount(
        address asset,
        address onBehalfOf,
        bytes calldata fromExtraData
    ) public view returns (uint256) {
        address cContract = abi.decode(fromExtraData, (address));
        IComet comet = IComet(cContract);
        return comet.borrowBalanceOf(onBehalfOf);
    }

    function switchIn(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountInMaximum,
        uint256 totalFee,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata fromExtraData,
        bytes calldata toExtraData
    ) external override {
        switchFrom(
            fromAsset,
            amount,
            onBehalfOf,
            collateralAssets,
            fromExtraData
        );
        switchTo(
            toAsset,
            amountInMaximum + totalFee,
            onBehalfOf,
            collateralAssets,
            toExtraData
        );
    }

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) public override {
        address cContract = abi.decode(extraData, (address));

        IComet fromComet = IComet(cContract);

        IERC20(fromAsset).approve(address(cContract), type(uint256).max);
        fromComet.supplyTo(onBehalfOf, fromAsset, amount);

        // withdraw collateral
        for (uint256 i = 0; i < collateralAssets.length; i++) {
            fromComet.withdrawFrom(
                onBehalfOf,
                address(this),
                collateralAssets[i].asset,
                collateralAssets[i].amount
            );
        }
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) public override {
        address cContract = abi.decode(extraData, (address));

        IComet toComet = IComet(cContract);
        for (uint256 i = 0; i < collateralAssets.length; i++) {
            IERC20(collateralAssets[i].asset).approve(
                address(cContract),
                collateralAssets[i].amount
            );
            // supply collateral
            toComet.supplyTo(
                onBehalfOf,
                collateralAssets[i].asset,
                collateralAssets[i].amount
            );
            console.log(
                "supply collateral",
                collateralAssets[i].asset,
                ":",
                collateralAssets[i].amount
            );
        }

        // borrow
        toComet.withdrawFrom(onBehalfOf, address(this), toAsset, amount);
    }

    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external override {
        address cContract = abi.decode(extraData, (address));
        IERC20(asset).approve(address(cContract), amount);
        // supply collateral
        IComet(cContract).supplyTo(onBehalfOf, asset, amount);
    }

    function borrow(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external override {
        address cContract = abi.decode(extraData, (address));

        IComet comet = IComet(cContract);
        comet.withdrawFrom(onBehalfOf, address(this), asset, amount);
    }

    function repay(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external override {
        address cContract = abi.decode(extraData, (address));

        IERC20(asset).approve(address(cContract), amount);
        IComet toComet = IComet(cContract);
        toComet.supplyTo(onBehalfOf, asset, amount);
    }
}
