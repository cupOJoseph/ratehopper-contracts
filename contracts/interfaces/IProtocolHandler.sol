// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

interface IProtocolHandler {
    function getDebtAmount(
        address asset,
        address onBehalfOf,
        bytes calldata extraData
    ) external view returns (uint256);

    function switchIn(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountInMaximum,
        uint256 totalFee,
        address onBehalfOf,
        bytes calldata fromExtraData,
        bytes calldata toExtraData
    ) external;

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external;

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external;

    function repay(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external;
}
