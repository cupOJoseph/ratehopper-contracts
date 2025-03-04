// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import "../interfaces/IProtocolHandler.sol";
import "../interfaces/safe/ISafe.sol";
import "../interfaces/moonwell/IMToken.sol";
import "../interfaces/moonwell/Comptroller.sol";
import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import "../Types.sol";
import {IERC20} from "../dependencies/IERC20.sol";

import "hardhat/console.sol";

contract MoonwellHandler is IProtocolHandler {
    using GPv2SafeERC20 for IERC20;

    address public immutable comptroller;

    constructor(address _comptroller) {
        comptroller = _comptroller;
    }

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
        uint256 amountTotal,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata fromExtraData,
        bytes calldata toExtraData
    ) external override {
        (address fromContract, ) = abi.decode(fromExtraData, (address, address[]));
        (address toContract, ) = abi.decode(toExtraData, (address, address[]));
        IERC20(fromAsset).approve(address(fromContract), type(uint256).max);

        IMToken(fromContract).repayBorrowBehalf(onBehalfOf, amount);

        bytes memory borrowData = abi.encodeCall(IMToken.borrow, (amountTotal));
        bool successBorrow = ISafe(onBehalfOf).execTransactionFromModule(
            toContract,
            0,
            borrowData,
            ISafe.Operation.Call
        );

        require(successBorrow, "Borrow transaction failed");

        bytes memory transferData = abi.encodeCall(IERC20.transfer, (address(this), amountTotal));
        bool successTransfer = ISafe(onBehalfOf).execTransactionFromModule(
            toAsset,
            0,
            transferData,
            ISafe.Operation.Call
        );
        require(successTransfer, "Transfer failed");
    }

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override {
        (address fromContract, address[] memory mTokens) = abi.decode(extraData, (address, address[]));
        IERC20(fromAsset).approve(address(fromContract), type(uint256).max);
        IMToken(fromContract).repayBorrowBehalf(onBehalfOf, amount);

        for (uint256 i = 0; i < collateralAssets.length; i++) {
            bool successWithdraw = ISafe(onBehalfOf).execTransactionFromModule(
                mTokens[i],
                0,
                abi.encodeCall(IMToken.redeemUnderlying, (collateralAssets[i].amount)),
                ISafe.Operation.Call
            );

            require(successWithdraw, "Moonwell Withdraw failed");

            bool successTransfer = ISafe(onBehalfOf).execTransactionFromModule(
                collateralAssets[i].asset,
                0,
                abi.encodeCall(IERC20.transfer, (address(this), collateralAssets[i].amount)),
                ISafe.Operation.Call
            );

            require(successTransfer, "Moonwell transfer failed");
        }
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override {
        (address toContract, address[] memory mTokens) = abi.decode(extraData, (address, address[]));

        for (uint256 i = 0; i < collateralAssets.length; i++) {
            // use balanceOf() because collateral amount is slightly decreased when switching from Fluid
            uint256 currentBalance = IERC20(collateralAssets[i].asset).balanceOf(address(this));

            IERC20(collateralAssets[i].asset).transfer(onBehalfOf, currentBalance);

            bool successApprove = ISafe(onBehalfOf).execTransactionFromModule(
                collateralAssets[i].asset,
                0,
                abi.encodeCall(IERC20.approve, (mTokens[i], currentBalance)),
                ISafe.Operation.Call
            );

            require(successApprove, "moonwell approve failed");

            bool successMint = ISafe(onBehalfOf).execTransactionFromModule(
                mTokens[i],
                0,
                abi.encodeCall(IMToken.mint, (currentBalance)),
                ISafe.Operation.Call
            );
            require(successMint, "moonwell mint failed");

            address[] memory collateralContracts = new address[](1);
            collateralContracts[0] = mTokens[i];

            bool successEnterMarkets = ISafe(onBehalfOf).execTransactionFromModule(
                comptroller,
                0,
                abi.encodeCall(IComptroller.enterMarkets, (collateralContracts)),
                ISafe.Operation.Call
            );

            require(successEnterMarkets, "moonwell enter markets failed");
        }

        bool successBorrow = ISafe(onBehalfOf).execTransactionFromModule(
            toContract,
            0,
            abi.encodeCall(IMToken.borrow, (amount)),
            ISafe.Operation.Call
        );

        require(successBorrow, "moonwell borrow failed");

        bool successTransfer = ISafe(onBehalfOf).execTransactionFromModule(
            toAsset,
            0,
            abi.encodeCall(IERC20.transfer, (address(this), amount)),
            ISafe.Operation.Call
        );

        require(successTransfer, "moonwell transfer failed");
    }

    function supply(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external {
        (address toContract, address collateralContract, uint256 collateralAmount) = abi.decode(
            extraData,
            (address, address, uint256)
        );

        bool successApprove = ISafe(onBehalfOf).execTransactionFromModule(
            collateralContract,
            0,
            abi.encodeCall(IERC20.approve, (collateralContract, collateralAmount)),
            ISafe.Operation.Call
        );

        bool successMint = ISafe(onBehalfOf).execTransactionFromModule(
            collateralContract,
            0,
            abi.encodeCall(IMToken.mint, (collateralAmount)),
            ISafe.Operation.Call
        );
    }

    function borrow(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external {
        (address toContract, address collateralContract, uint256 collateralAmount) = abi.decode(
            extraData,
            (address, address, uint256)
        );

        bool successBorrow = ISafe(onBehalfOf).execTransactionFromModule(
            toContract,
            0,
            abi.encodeCall(IMToken.borrow, (amount)),
            ISafe.Operation.Call
        );
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
