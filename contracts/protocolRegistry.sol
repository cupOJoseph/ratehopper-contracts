pragma solidity =0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Types.sol";

contract ProtocolRegistry is Ownable {
    mapping(Protocol => address) private protocolHandlers;

    function setHandler(Protocol protocol, address handler) public onlyOwner {
        require(handler != address(0), "Invalid handler address");
        protocolHandlers[protocol] = handler;
    }

    function getHandler(Protocol protocol) public view returns (address) {
        return protocolHandlers[protocol];
    }
}
