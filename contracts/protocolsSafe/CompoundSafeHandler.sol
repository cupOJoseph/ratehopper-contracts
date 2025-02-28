// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import "../interfaces/safe/ISafe.sol";
import "../interfaces/IProtocolHandler.sol";
import {IComet} from "../interfaces/compound/IComet.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import "hardhat/console.sol";

contract CompoundSafeHandler is IProtocolHandler {
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
        address cContract = abi.decode(extraData, (address));

        IERC20(fromAsset).transfer(onBehalfOf, amount);

        bool successApprove = ISafe(onBehalfOf).execTransactionFromModule(
            fromAsset,
            0,
            abi.encodeCall(IERC20.approve, (cContract, type(uint256).max)),
            ISafe.Operation.Call
        );

        require(successApprove, "Compound approve failed");

        bool successRepay = ISafe(onBehalfOf).execTransactionFromModule(
            cContract,
            0,
            abi.encodeCall(IComet.supply, (fromAsset, amount)),
            ISafe.Operation.Call
        );

        require(successRepay, "Compound repay failed");

        // withdraw collateral
        for (uint256 i = 0; i < collateralAssets.length; i++) {
            require(collateralAssets[i].amount > 0, "Invalid collateral amount");
            bool successWithdraw = ISafe(onBehalfOf).execTransactionFromModule(
                cContract,
                0,
                abi.encodeCall(
                    IComet.withdrawFrom,
                    (onBehalfOf, onBehalfOf, collateralAssets[i].asset, collateralAssets[i].amount)
                ),
                ISafe.Operation.Call
            );

            require(successWithdraw, "Compound withdraw failed");
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
            IERC20(collateralAssets[i].asset).approve(address(cContract), collateralAssets[i].amount);

            // supply collateral
            toComet.supplyTo(onBehalfOf, collateralAssets[i].asset, collateralAssets[i].amount);
        }

        // borrow
        toComet.withdrawFrom(onBehalfOf, address(this), toAsset, amount);
    }

    function supply(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external override {
        address cContract = abi.decode(extraData, (address));
        IERC20(asset).approve(address(cContract), amount);
        // supply collateral
        IComet(cContract).supplyTo(onBehalfOf, asset, amount);
    }

    function borrow(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external override {
        address cContract = abi.decode(extraData, (address));

        IComet comet = IComet(cContract);
        comet.withdrawFrom(onBehalfOf, address(this), asset, amount);
    }

    function repay(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external override {
        address cContract = abi.decode(extraData, (address));

        IERC20(asset).approve(address(cContract), amount);
        IComet toComet = IComet(cContract);
        toComet.supplyTo(onBehalfOf, asset, amount);
    }
}
