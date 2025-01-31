// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

import "hardhat/console.sol";

contract TargetContract {
    // event ActionPerformed(address caller, uint256 value);

    function performAction() external {
        console.log("Performing action with sender:", msg.sender);
        // emit ActionPerformed(msg.sender, value);
    }
}
