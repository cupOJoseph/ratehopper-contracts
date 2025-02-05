// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IProtocolHandler.sol";
import "../interfaces/safe/ISafe.sol";
import "../interfaces/moonwell/IMToken.sol";
import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import "../Types.sol";
import {IERC20} from "../dependencies/IERC20.sol";

import "hardhat/console.sol";

contract MoonwellHandler is IProtocolHandler {
    using GPv2SafeERC20 for IERC20;

    function getDebtAmount(
        address asset,
        address onBehalfOf,
        bytes calldata extraData
    ) external view returns (uint256) {
        address mContract = abi.decode(extraData, (address));

        return IMToken(mContract).borrowBalanceStored(onBehalfOf);
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
        address fromContract = abi.decode(fromExtraData, (address));
        address toContract = abi.decode(toExtraData, (address));
        IERC20(fromAsset).approve(address(fromContract), type(uint256).max);

        IMToken(fromContract).repayBorrowBehalf(onBehalfOf, amount);

        console.log("repay done");

        uint borrowAmount = amountInMaximum + totalFee;

        bytes memory borrowData = abi.encodeCall(IMToken.borrow, (borrowAmount));
        bool successBorrow = ISafe(onBehalfOf).execTransactionFromModule(
            toContract,
            0,
            borrowData,
            ISafe.Operation.Call
        );

        console.log("successBorrow: ", successBorrow);

        bytes memory transferData = abi.encodeCall(IERC20.transfer, (address(this), borrowAmount));
        bool successTransfer = ISafe(onBehalfOf).execTransactionFromModule(
            toAsset,
            0,
            transferData,
            ISafe.Operation.Call
        );
        console.log("successTransfer: ", successTransfer);
    }

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override {
        (address fromContract, address collateralContract, uint256 collateralAmount) = abi.decode(
            extraData,
            (address, address, uint256)
        );
        IERC20(fromAsset).approve(address(fromContract), type(uint256).max);
        IMToken(fromContract).repayBorrowBehalf(onBehalfOf, amount);
        console.log("repay done");
        // for (uint256 i = 0; i < collateralAssets.length; i++) {
        //     bytes memory withdrawData = abi.encodeCall(IMToken.redeemUnderlying, (collateralAssets[i].amount));
        //     bool successWithdraw = ISafe(onBehalfOf).execTransactionFromModule(
        //         collateralAssets[i].asset,
        //         0,
        //         withdrawData,
        //         ISafe.Operation.Call
        //     );
        //     console.log("successWithdraw: ", successWithdraw);
        // }

        bytes memory withdrawData = abi.encodeCall(IMToken.redeemUnderlying, (collateralAmount));
        bool successWithdraw = ISafe(onBehalfOf).execTransactionFromModule(
            collateralContract,
            0,
            withdrawData,
            ISafe.Operation.Call
        );
        console.log("successWithdraw: ", successWithdraw);

        console.log("collateralAmount on safe: ", IERC20(collateralAssets[0].asset).balanceOf(onBehalfOf));
        // console.log("collateralAmount on this: ", IERC20(collateralContract).balanceOf(address(this)));
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override {
        (address toContract, address collateralContract, uint256 collateralAmount) = abi.decode(
            extraData,
            (address, address, uint256)
        );

        for (uint256 i = 0; i < collateralAssets.length; i++) {
            // IERC20(toAsset).approve(address(toContract), type(uint256).max);
            bytes memory mintData = abi.encodeCall(IMToken.mint, (collateralAssets[i].amount));
            bool successMint = ISafe(onBehalfOf).execTransactionFromModule(
                collateralAssets[i].asset,
                0,
                mintData,
                ISafe.Operation.Call
            );
            console.log("mint done");
        }
        bytes memory borrowData = abi.encodeCall(IMToken.borrow, (amount));
        bool successBorrow = ISafe(onBehalfOf).execTransactionFromModule(
            toContract,
            0,
            borrowData,
            ISafe.Operation.Call
        );
        console.log("borrow done");
    }

    function supply(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external {
        IERC20(asset).approve(address(this), type(uint256).max);
    }

    function borrow(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external {
        IERC20(asset).approve(address(this), type(uint256).max);
    }

    function repay(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) public override {
        (address toContract, address collateralContract, uint256 collateralAmount) = abi.decode(
            extraData,
            (address, address, uint256)
        );
        IERC20(asset).approve(address(toContract), type(uint256).max);
        IMToken(toContract).repayBorrowBehalf(onBehalfOf, amount);
    }
}
