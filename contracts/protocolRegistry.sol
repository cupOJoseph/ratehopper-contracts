// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import "./Types.sol";

contract ProtocolRegistry {
    mapping(Protocol => address) private protocolHandlers;

    constructor(Protocol[] memory protocols, address[] memory handlers) {
        require(protocols.length == handlers.length, "Protocols and handlers length mismatch");

        for (uint256 i = 0; i < protocols.length; i++) {
            require(handlers[i] != address(0), "Invalid handler address");
            protocolHandlers[protocols[i]] = handlers[i];
        }
    }

    function getHandler(Protocol protocol) public view returns (address) {
        return protocolHandlers[protocol];
    }
}
