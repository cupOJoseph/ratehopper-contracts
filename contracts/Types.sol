// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

enum Protocol {
    AAVE_V3,
    COMPOUND,
    MORPHO,
    FLUID,
    MOONWELL
}

struct CollateralAsset {
    address asset;
    uint256 amount;
}

struct ParaswapParams {
    uint256 srcAmount;
    bytes swapData;
}