// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

interface IFluidVaultResolver {
    function positionsByUser(address user) external view returns (address[][] memory, uint256[][] memory);
}
