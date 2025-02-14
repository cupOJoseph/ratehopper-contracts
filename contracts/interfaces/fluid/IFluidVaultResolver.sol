// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {Structs} from "../../dependencies/fluid/structs.sol";

interface IFluidVaultResolver {
    function positionsByUser(
        address user
    )
        external
        view
        returns (Structs.UserPosition[] memory userPositions_, Structs.VaultEntireData[] memory vaultsData_);
}
