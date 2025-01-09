pragma solidity =0.8.27;

import "../interfaces/IProtocolHandler.sol";
import {IComet} from "../interfaces/compound/IComet.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import "hardhat/console.sol";

contract CompoundHandler is IProtocolHandler {
    function debtSwap(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountInMaximum,
        uint256 totalFee,
        address onBehalfOf,
        bytes calldata extraData
    ) external override {
        (
            address fromCContract,
            address toCContract,
            address collateralAsset,
            uint256 collateralAmount
        ) = abi.decode(extraData, (address, address, address, uint256));

        IComet fromComet = IComet(fromCContract);
        IComet toComet = IComet(toCContract);

        // repay
        fromComet.supplyFrom(onBehalfOf, onBehalfOf, fromAsset, amount);
        console.log("repay done");

        // withdraw collateral
        fromComet.withdrawFrom(
            onBehalfOf,
            onBehalfOf,
            collateralAsset,
            collateralAmount
        );
        console.log("withdraw collateral done");

        // // supply collateral
        toComet.supplyFrom(
            onBehalfOf,
            onBehalfOf,
            collateralAsset,
            collateralAmount
        );
        console.log("supply done");

        // new borrow
        toComet.withdrawFrom(
            onBehalfOf,
            address(this),
            toAsset,
            amountInMaximum + totalFee
        );
        console.log("borrow done");
    }

    function repayRemainingBalance(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external override {
        (, address toCContract, , ) = abi.decode(
            extraData,
            (address, address, address, uint256)
        );

        IERC20(asset).approve(address(toCContract), amount);
        IComet toComet = IComet(toCContract);
        toComet.supply(asset, amount);
    }
}
