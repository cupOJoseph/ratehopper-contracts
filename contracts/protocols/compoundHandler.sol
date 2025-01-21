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
        (address cContract, , ) = abi.decode(
            fromExtraData,
            (address, address, uint256)
        );
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
        bytes calldata fromExtraData,
        bytes calldata toExtraData
    ) external override {
        switchFrom(fromAsset, amount, onBehalfOf, fromExtraData);
        switchTo(toAsset, amountInMaximum + totalFee, onBehalfOf, toExtraData);
    }

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) public override {
        (
            address cContract,
            address collateralAsset,
            uint256 collateralAmount
        ) = abi.decode(extraData, (address, address, uint256));

        IComet fromComet = IComet(cContract);

        IERC20(fromAsset).approve(address(cContract), type(uint256).max);
        fromComet.supplyTo(onBehalfOf, fromAsset, amount);

        // withdraw collateral
        fromComet.withdrawFrom(
            onBehalfOf,
            address(this),
            collateralAsset,
            collateralAmount
        );
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) public override {
        (
            address cContract,
            address collateralAsset,
            uint256 collateralAmount
        ) = abi.decode(extraData, (address, address, uint256));

        IComet toComet = IComet(cContract);

        IERC20(collateralAsset).approve(address(cContract), collateralAmount);

        // supply collateral
        toComet.supplyFrom(
            address(this),
            onBehalfOf,
            collateralAsset,
            collateralAmount
        );

        // borrow
        toComet.withdrawFrom(onBehalfOf, address(this), toAsset, amount);
    }

    function repay(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external override {
        (
            address cContract,
            address collateralAsset,
            uint256 collateralAmount
        ) = abi.decode(extraData, (address, address, uint256));

        IERC20(asset).approve(address(cContract), amount);
        IComet toComet = IComet(cContract);
        toComet.supplyTo(onBehalfOf, asset, amount);
    }
}
