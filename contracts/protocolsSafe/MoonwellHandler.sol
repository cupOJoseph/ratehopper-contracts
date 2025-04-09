// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import "../interfaces/IProtocolHandler.sol";
import "../interfaces/safe/ISafe.sol";
import "../interfaces/moonwell/IMToken.sol";
import "../interfaces/moonwell/Comptroller.sol";
import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import "../Types.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

contract MoonwellHandler is IProtocolHandler, Ownable {
    using GPv2SafeERC20 for IERC20;

    address public immutable comptroller;

    // Mapping from underlying token address to corresponding Moonwell mToken contract address
    mapping(address => address) public tokenToMContract;

    constructor(address _comptroller) Ownable(msg.sender) {
        comptroller = _comptroller;
    }

    error ZeroAddress();
    error TokenNotRegistered();
    error TransferFailed();
    error BorrowFailed();

    function setTokenMContract(address token, address mContract) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (mContract == address(0)) revert ZeroAddress();
        tokenToMContract[token] = mContract;
    }
    
    // Internal function to get the mContract address for a token
    // This helps handle potential address format inconsistencies
    function getMContract(address token) internal view returns (address) {
        address mContract = tokenToMContract[token];
        return mContract;
    }

    function getDebtAmount(
        address asset,
        address onBehalfOf,
        bytes calldata extraData
    ) external view returns (uint256) {
        address mContract = getMContract(asset);
        if (mContract == address(0)) revert TokenNotRegistered();

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
        address fromContract = getMContract(fromAsset);
        address toContract = getMContract(toAsset);

        if (fromContract == address(0)) revert TokenNotRegistered();
        if (toContract == address(0)) revert TokenNotRegistered();
        IERC20(fromAsset).approve(address(fromContract), amount);

        IMToken(fromContract).repayBorrowBehalf(onBehalfOf, amount);

        bytes memory borrowData = abi.encodeCall(IMToken.borrow, (amountTotal));
        bool successBorrow = ISafe(onBehalfOf).execTransactionFromModule(
            toContract,
            0,
            borrowData,
            ISafe.Operation.Call
        );

        if (!successBorrow) revert BorrowFailed();

        bytes memory transferData = abi.encodeCall(IERC20.transfer, (address(this), amountTotal));
        bool successTransfer = ISafe(onBehalfOf).execTransactionFromModule(
            toAsset,
            0,
            transferData,
            ISafe.Operation.Call
        );
        if (!successTransfer) revert TransferFailed();
    }

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override {
        console.log("fromAsset:", fromAsset);
        address fromContract = getMContract(fromAsset);
        console.log("fromContract:", fromContract);
        if (fromContract == address(0)) revert TokenNotRegistered();

        IERC20(fromAsset).approve(address(fromContract), amount);
        IMToken(fromContract).repayBorrowBehalf(onBehalfOf, amount);

        for (uint256 i = 0; i < collateralAssets.length; i++) {
            address mTokenAddress = getMContract(collateralAssets[i].asset);
            if (mTokenAddress == address(0)) revert TokenNotRegistered();
            
            bool successWithdraw = ISafe(onBehalfOf).execTransactionFromModule(
                mTokenAddress,
                0,
                abi.encodeCall(IMToken.redeemUnderlying, (collateralAssets[i].amount)),
                ISafe.Operation.Call
            );

            if (!successWithdraw) revert("Withdraw failed");

            bool successTransfer = ISafe(onBehalfOf).execTransactionFromModule(
                collateralAssets[i].asset,
                0,
                abi.encodeCall(IERC20.transfer, (address(this), collateralAssets[i].amount)),
                ISafe.Operation.Call
            );

            if (!successTransfer) revert TransferFailed();
        }
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override {
        address toContract = getMContract(toAsset);
        if (toContract == address(0)) revert TokenNotRegistered();

        for (uint256 i = 0; i < collateralAssets.length; i++) {
            address collateralContract = getMContract(collateralAssets[i].asset);
            // use balanceOf() because collateral amount is slightly decreased when switching from Fluid
            uint256 currentBalance = IERC20(collateralAssets[i].asset).balanceOf(address(this));

            IERC20(collateralAssets[i].asset).transfer(onBehalfOf, currentBalance);

            bool successApprove = ISafe(onBehalfOf).execTransactionFromModule(
                collateralAssets[i].asset,
                0,
                abi.encodeCall(IERC20.approve, (collateralContract, currentBalance)),
                ISafe.Operation.Call
            );

            if (!successApprove) revert("Approve transaction failed");

            bool successMint = ISafe(onBehalfOf).execTransactionFromModule(
                collateralContract,
                0,
                abi.encodeCall(IMToken.mint, (currentBalance)),
                ISafe.Operation.Call
            );
            if (!successMint) revert("Mint transaction failed");

            address[] memory collateralContracts = new address[](1);
            collateralContracts[0] = collateralContract;

            bool successEnterMarkets = ISafe(onBehalfOf).execTransactionFromModule(
                comptroller,
                0,
                abi.encodeCall(IComptroller.enterMarkets, (collateralContracts)),
                ISafe.Operation.Call
            );

            if (!successEnterMarkets) revert("Enter markets transaction failed");
        }

        bool successBorrow = ISafe(onBehalfOf).execTransactionFromModule(
            toContract,
            0,
            abi.encodeCall(IMToken.borrow, (amount)),
            ISafe.Operation.Call
        );

        if (!successBorrow) revert BorrowFailed();

        bool successTransfer = ISafe(onBehalfOf).execTransactionFromModule(
            toAsset,
            0,
            abi.encodeCall(IERC20.transfer, (address(this), amount)),
            ISafe.Operation.Call
        );

        if (!successTransfer) revert TransferFailed();
    }

    function supply(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external {
        address mContract = getMContract(asset);
        if (mContract == address(0)) revert TokenNotRegistered();

        IERC20(asset).transfer(onBehalfOf, amount);

        bool successApprove = ISafe(onBehalfOf).execTransactionFromModule(
            asset,
            0,
            abi.encodeCall(IERC20.approve, (mContract, amount)),
            ISafe.Operation.Call
        );

        require(successApprove, "moonwell approve failed");

        bool successMint = ISafe(onBehalfOf).execTransactionFromModule(
            mContract,
            0,
            abi.encodeCall(IMToken.mint, (amount)),
            ISafe.Operation.Call
        );

        require(successMint, "moonwell mint failed");

        address[] memory collateralContracts = new address[](1);
        collateralContracts[0] = mContract;

        bool successEnterMarkets = ISafe(onBehalfOf).execTransactionFromModule(
            comptroller,
            0,
            abi.encodeCall(IComptroller.enterMarkets, (collateralContracts)),
            ISafe.Operation.Call
        );

        require(successEnterMarkets, "moonwell enter markets failed");
    }

    function borrow(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external {
        address mContract = tokenToMContract[asset];
        require(mContract != address(0), "Token not registered");

        bool successBorrow = ISafe(onBehalfOf).execTransactionFromModule(
            mContract,
            0,
            abi.encodeCall(IMToken.borrow, (amount)),
            ISafe.Operation.Call
        );

        require(successBorrow, "Borrow transaction failed");

        bool successTransfer = ISafe(onBehalfOf).execTransactionFromModule(
            asset,
            0,
            abi.encodeCall(IERC20.transfer, (address(this), amount)),
            ISafe.Operation.Call
        );

        require(successTransfer, "Transfer transaction failed");
    }

    function repay(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) public override {
        address mContract = tokenToMContract[asset];
        require(mContract != address(0), "Token not registered");

        IERC20(asset).approve(address(mContract), amount);
        IMToken(mContract).repayBorrowBehalf(onBehalfOf, amount);
    }
}
