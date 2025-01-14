pragma solidity =0.8.27;

import "../interfaces/IProtocolHandler.sol";
import {IComet} from "../interfaces/compound/IComet.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import "hardhat/console.sol";

contract CompoundHandler is IProtocolHandler {
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

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) public override {
        (
            address fromCContract,
            ,
            address collateralAsset,
            uint256 collateralAmount
        ) = abi.decode(extraData, (address, address, address, uint256));

        IComet fromComet = IComet(fromCContract);

        IERC20(fromAsset).approve(address(fromCContract), amount);
        fromComet.supplyTo(onBehalfOf, fromAsset, amount);
        console.log("compound repay done");

        // withdraw collateral
        fromComet.withdrawFrom(
            onBehalfOf,
            address(this),
            collateralAsset,
            collateralAmount
        );
        console.log("compound withdraw collateral done");
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) public override {
        (
            ,
            address toCContract,
            address collateralAsset,
            uint256 collateralAmount
        ) = abi.decode(extraData, (address, address, address, uint256));

        IComet toComet = IComet(toCContract);

        IERC20(collateralAsset).approve(address(toCContract), collateralAmount);

        // supply collateral
        toComet.supplyFrom(
            address(this),
            onBehalfOf,
            collateralAsset,
            collateralAmount
        );
        console.log("compound supply done");

        // borrow
        toComet.withdrawFrom(onBehalfOf, address(this), toAsset, amount);
        console.log("compound borrow done");
    }

    function repayRemainingBalance(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external override {
        (address toCContract, , ) = abi.decode(
            extraData,
            (address, address, uint256)
        );

        IERC20(asset).approve(address(toCContract), amount);
        IComet toComet = IComet(toCContract);
        toComet.supplyFrom(address(this), onBehalfOf, asset, amount);
    }
}
