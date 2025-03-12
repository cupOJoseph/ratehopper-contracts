// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/**
 * @title SimpleStorage
 * @dev A simple storage contract that demonstrates the UUPS proxy pattern with TimelockController
 * @custom:oz-upgrades-from SimpleStorage
 */
contract SimpleStorage is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    uint256 private _value;
    address public timelock;
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @dev Initializes the contract setting the timelock controller as the admin
     * @param timelockAddress The address of the TimelockController
     */
    function initialize(address timelockAddress) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        
        // Store the timelock address
        timelock = timelockAddress;
        
        // Grant the timelock the upgrader role
        _grantRole(UPGRADER_ROLE, timelockAddress);
        
        // Grant the timelock the admin role
        _grantRole(DEFAULT_ADMIN_ROLE, timelockAddress);
    }
    
    /**
     * @dev Store a new value
     * @param newValue The value to store
     */
    function store(uint256 newValue) public {
        _value = newValue;
    }
    
    /**
     * @dev Retrieve the stored value
     * @return The stored value
     */
    function retrieve() public view returns (uint256) {
        return _value;
    }
    
    /**
     * @dev Function that should revert when `msg.sender` is not authorized to upgrade the contract.
     * Called by {upgradeTo} and {upgradeToAndCall}.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
