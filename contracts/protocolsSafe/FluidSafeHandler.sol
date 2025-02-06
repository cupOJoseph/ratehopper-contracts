// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

import "../interfaces/safe/ISafe.sol";
import "../Types.sol";
import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import {IPoolV3} from "../interfaces/aaveV3/IPoolV3.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import {DataTypes} from "../interfaces/aaveV3/DataTypes.sol";
import "../interfaces/fluid/IFluidVault.sol";
import "../interfaces/fluid/IFluidVaultResolver.sol";
import "../interfaces/IProtocolHandler.sol";

import "hardhat/console.sol";

contract FluidSafeHandler is IProtocolHandler {
    using GPv2SafeERC20 for IERC20;

    address public constant FLUID_VAULT_RESOLVER = 0x79B3102173EB84E6BCa182C7440AfCa5A41aBcF8;

    function getDebtAmount(
        address asset,
        address onBehalfOf,
        bytes calldata fromExtraData
    ) external view returns (uint256) {
        IFluidVaultResolver resolver = IFluidVaultResolver(FLUID_VAULT_RESOLVER);
        // TODO fis this
        (address[][] memory vaults, uint256[][] memory positions) = resolver.positionsByUser(onBehalfOf);
        for (uint256 i = 0; i < vaults[1].length; i++) {
            if (vaults[1][i] == onBehalfOf) {
                uint256 debtAmount = positions[i][10];
                return debtAmount;
            }
        }
        revert("Vault not found");
    }

    function switchIn(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountInMax,
        uint256 totalFee,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata fromExtraData,
        bytes calldata toExtraData
    ) external override {
        // no case for fluid at the moment
    }

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override {
        (address vaultAddress, uint256 nftId) = abi.decode(extraData, (address, uint256));

        IERC20(fromAsset).approve(address(vaultAddress), type(uint256).max);
        bool successRepay = ISafe(onBehalfOf).execTransactionFromModule(
            vaultAddress,
            0,
            abi.encodeCall(IFluidVault.operate, (nftId, 0, -int256(amount), onBehalfOf)),
            ISafe.Operation.Call
        );
        console.log("successRepay:", successRepay);

        bool successWithdraw = ISafe(onBehalfOf).execTransactionFromModule(
            vaultAddress,
            0,
            abi.encodeCall(IFluidVault.operate, (nftId, -int256(collateralAssets[0].amount), 0, address(this))),
            ISafe.Operation.Call
        );
        console.log("successWithdraw:", successWithdraw);
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override {
        (address vaultAddress, ) = abi.decode(extraData, (address, uint256));

        bool successApprove = ISafe(onBehalfOf).execTransactionFromModule(
            collateralAssets[0].asset,
            0,
            abi.encodeCall(IERC20.approve, (address(vaultAddress), type(uint256).max)),
            ISafe.Operation.Call
        );
        console.log("successApprove:", successApprove);

        (bool successSupply, bytes memory returnData) = ISafe(onBehalfOf).execTransactionFromModuleReturnData(
            vaultAddress,
            0,
            abi.encodeCall(IFluidVault.operate, (0, int256(collateralAssets[0].amount), 0, onBehalfOf)),
            ISafe.Operation.Call
        );
        console.log("successSupply:", successSupply);

        (uint256 nftId, int256 colAmount_, int256 debtAmount_) = abi.decode(returnData, (uint256, int256, int256));
        console.log("nftId_:", nftId);

        bool successBorrow = ISafe(onBehalfOf).execTransactionFromModule(
            vaultAddress,
            0,
            abi.encodeCall(IFluidVault.operate, (nftId, 0, int256(amount), address(this))),
            ISafe.Operation.Call
        );
        console.log("successBorrow:", successBorrow);
    }

    function repay(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) public override {
        (address vaultAddress, uint256 nftId) = abi.decode(extraData, (address, uint256));

        IERC20(asset).transfer(onBehalfOf, amount);

        bool successApprove = ISafe(onBehalfOf).execTransactionFromModule(
            asset,
            0,
            abi.encodeCall(IERC20.approve, (address(vaultAddress), type(uint256).max)),
            ISafe.Operation.Call
        );
        console.log("successApprove:", successApprove);

        bool successRepay = ISafe(onBehalfOf).execTransactionFromModule(
            vaultAddress,
            0,
            // TODO get nftId dynamicly
            abi.encodeCall(IFluidVault.operate, (nftId, 0, -int256(amount), onBehalfOf)),
            // abi.encodeCall(IFluidVault.operate, (4958, 0, -int256(amount), onBehalfOf)),
            ISafe.Operation.Call
        );

        require(successRepay);
    }

    function supply(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external {
        (address vaultAddress, uint256 nftId) = abi.decode(extraData, (address, uint256));
        IERC20(asset).safeTransferFrom(onBehalfOf, address(this), uint256(amount));
        IERC20(asset).approve(address(vaultAddress), uint256(amount));
        IFluidVault vault = IFluidVault(vaultAddress);

        vault.operate(0, int256(amount), 0, onBehalfOf);
    }

    function borrow(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external {
        (address vaultAddress, uint256 nftId) = abi.decode(extraData, (address, uint256));
        IFluidVault vault = IFluidVault(vaultAddress);
        vault.operate(nftId, 0, int256(amount), onBehalfOf);
    }
}
