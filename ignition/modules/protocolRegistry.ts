import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ProtocolRegistryModule = buildModule("ProtocolRegistry", (m) => {
    const protocolRegistry = m.contract("ProtocolRegistry", [], {});

    return { protocolRegistry };
});

export default ProtocolRegistryModule;
