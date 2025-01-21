// pragma solidity =0.8.27;

// import "../interfaces/IProtocolHandler.sol";
// import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
// import {IERC20} from "../dependencies/IERC20.sol";
// import "../interfaces/fluid/IFluidVault.sol";
// import "hardhat/console.sol";

// contract FluidHandler is IProtocolHandler {
//     using GPv2SafeERC20 for IERC20;

//     function getDebtAmount(
//         address asset,
//         address onBehalfOf,
//         bytes calldata fromExtraData
//     ) public view returns (uint256) {}

//     function switchIn(
//         address fromAsset,
//         address toAsset,
//         uint256 amount,
//         uint256 amountInMaximum,
//         uint256 totalFee,
//         address onBehalfOf,
//         bytes calldata fromExtraData,
//         bytes calldata toExtraData
//     ) external override {
//         // Implement logic for switching in assets
//     }

//     function switchFrom(
//         address fromAsset,
//         uint256 amount,
//         address onBehalfOf,
//         bytes calldata extraData
//     ) external override {
//         // Implement logic for switching from assets
//     }

//     function switchTo(
//         address toAsset,
//         uint256 amount,
//         address onBehalfOf,
//         bytes calldata extraData
//     ) external override {
//         // Implement logic for switching to assets
//     }

//     function repay(
//         address asset,
//         uint256 amount,
//         address onBehalfOf,
//         bytes calldata extraData
//     ) external override {
//         // Implement logic for repaying assets
//     }

//     function supply(
//         address asset,
//         address vaultAddress,
//         int256 amount,
//         address onBehalfOf
//     ) public {
//         IERC20(asset).safeTransferFrom(
//             onBehalfOf,
//             address(this),
//             uint256(amount)
//         );
//         IERC20(asset).approve(address(vaultAddress), uint256(amount));
//         IFluidVault vault = IFluidVault(vaultAddress);
//         vault.operate(0, amount, 0, onBehalfOf);
//     }

//     function borrow(
//         uint256 nftId,
//         address vaultAddress,
//         int256 amount,
//         address onBehalfOf
//     ) public {
//         IFluidVault vault = IFluidVault(vaultAddress);
//         vault.operate(nftId, 0, amount, onBehalfOf);
//     }
// }
