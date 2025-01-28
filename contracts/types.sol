// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

enum Protocol {
    COMPOUND,
    AAVE_V3,
    MORPHO
    // FLUID
}

struct CollateralAsset {
    address asset;
    uint256 amount;
}
