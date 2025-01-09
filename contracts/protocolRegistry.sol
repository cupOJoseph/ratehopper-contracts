pragma solidity =0.8.27;

contract ProtocolRegistry {
    enum Protocol {
        COMPOUND,
        AAVE_V3
    }

    mapping(Protocol => address) private protocolHandlers;

    constructor(address compoundHandler, address aaveV3Handler) {
        protocolHandlers[Protocol.COMPOUND] = compoundHandler;
        protocolHandlers[Protocol.AAVE_V3] = aaveV3Handler;
    }

    // TODO: add setProtocol()

    function getHandler(Protocol protocol) external view returns (address) {
        return protocolHandlers[protocol];
    }
}
