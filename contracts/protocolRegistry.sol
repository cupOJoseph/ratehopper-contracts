pragma solidity =0.8.27;

contract ProtocolRegistry {
    enum Protocol {
        COMPOUND,
        AAVE_V3,
        FLUID
    }

    mapping(Protocol => address) private protocolHandlers;

    constructor(
        address compoundHandler,
        address aaveV3Handler,
        address fluidHandler
    ) {
        protocolHandlers[Protocol.COMPOUND] = compoundHandler;
        protocolHandlers[Protocol.AAVE_V3] = aaveV3Handler;
        protocolHandlers[Protocol.FLUID] = fluidHandler;
    }

    // TODO: add setProtocol()

    function getHandler(Protocol protocol) external view returns (address) {
        return protocolHandlers[protocol];
    }
}
