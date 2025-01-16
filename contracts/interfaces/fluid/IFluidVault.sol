// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

interface IFluidVault {
    function operate(
        uint256 nftId_,
        int256 newCol_,
        int256 newDebt_,
        address to_
    ) external payable returns (uint256, int256, int256);
}
