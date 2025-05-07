// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ProtocolRegistry
 * @dev Contract to store mappings between tokens and their corresponding protocol-specific contracts
 * This registry allows protocol handlers to access mappings even when called via delegatecall
 */
contract ProtocolRegistry is Ownable {
    constructor() Ownable(msg.sender) {}

    // Mapping from underlying token address to corresponding Moonwell mToken contract address
    mapping(address => address) public tokenToMContract;

    // Mapping from underlying token address to corresponding Compound cToken contract address
    mapping(address => address) public tokenToCContract;

    error ZeroAddress();
    error ArrayLengthMismatch();

    function setTokenMContract(address token, address mContract) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (mContract == address(0)) revert ZeroAddress();
        tokenToMContract[token] = mContract;
    }

    function getMContract(address token) external view returns (address) {
        return tokenToMContract[token];
    }

    function setTokenCContract(address token, address cContract) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (cContract == address(0)) revert ZeroAddress();
        tokenToCContract[token] = cContract;
    }

    function getCContract(address token) external view returns (address) {
        return tokenToCContract[token];
    }

    function batchSetTokenMContracts(address[] calldata tokens, address[] calldata mContracts) external onlyOwner {
        if (tokens.length != mContracts.length) revert ArrayLengthMismatch();

        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0)) revert ZeroAddress();
            if (mContracts[i] == address(0)) revert ZeroAddress();
            tokenToMContract[tokens[i]] = mContracts[i];
        }
    }

    function batchSetTokenCContracts(address[] calldata tokens, address[] calldata cContracts) external onlyOwner {
        if (tokens.length != cContracts.length) revert ArrayLengthMismatch();

        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0)) revert ZeroAddress();
            if (cContracts[i] == address(0)) revert ZeroAddress();
            tokenToCContract[tokens[i]] = cContracts[i];
        }
    }
}
