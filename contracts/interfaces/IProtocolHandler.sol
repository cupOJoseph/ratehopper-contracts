// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

interface IProtocolHandler {
    function debtSwap(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountInMaximum,
        uint256 totalFee,
        address onBehalfOf,
        bytes calldata extraData
    ) external;
}
