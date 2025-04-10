import hre from "hardhat";
import { ethers } from "hardhat";
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { getCTokenMappingArrays, getMTokenMappingArrays } from "../contractAddresses";

const PAUSER_ADDRESS = "0x9E073c36F63BF1c611026fdA1fF6007A81932231";
const FLUID_VAULT_RESOLVER = "0x79B3102173EB84E6BCa182C7440AfCa5A41aBcF8";
const COMPTROLLER_ADDRESS = "0xfbb21d0380bee3312b33c4353c8936a0f13ef26c";

enum Protocol {
    AAVE_V3,
    COMPOUND,
    MORPHO,
    FLUID,
    MOONWELL,
}

const ProtocolRegistryModule = buildModule("ProtocolRegistry", (m) => {
    const protocolRegistry = m.contract("ProtocolRegistry", []);
    return { protocolRegistry };
});

// FluidSafeHandler is deployed directly with ethers

const MoonwellHandlerModule = buildModule("MoonwellHandler", (m) => {
    return {};
});

const CompoundHandlerModule = buildModule("CompoundHandler", (m) => {
    return {};
});

async function main() {
    try {
        console.log("Deploying ProtocolRegistry and setting token mappings...");
        const { protocolRegistry } = await hre.ignition.deploy(ProtocolRegistryModule);
        const registryAddress = await protocolRegistry.getAddress();
        console.log(`ProtocolRegistry deployed to: ${registryAddress}`);

        const registry = await ethers.getContractAt("ProtocolRegistry", registryAddress);

        const [mTokens, mContracts] = getMTokenMappingArrays();
        await registry.batchSetTokenMContracts(mTokens, mContracts);
        console.log("Moonwell token mappings set in ProtocolRegistry");

        const [cTokens, cContracts] = getCTokenMappingArrays();
        await registry.batchSetTokenCContracts(cTokens, cContracts);
        console.log("Compound token mappings set in ProtocolRegistry");

        // Deploy FluidSafeHandler directly with ethers instead of Ignition to avoid reconciliation errors
        console.log("Deploying FluidSafeHandler...");
        const FluidSafeHandlerFactory = await ethers.getContractFactory("FluidSafeHandler");
        const fluidSafeHandler = await FluidSafeHandlerFactory.deploy(FLUID_VAULT_RESOLVER);
        await fluidSafeHandler.waitForDeployment();
        const fluidSafeHandlerAddress = await fluidSafeHandler.getAddress();
        console.log(`FluidSafeHandler deployed to: ${fluidSafeHandlerAddress}`);

        const MoonwellHandlerFactory = await ethers.getContractFactory("MoonwellHandler");
        const moonwellHandler = await MoonwellHandlerFactory.deploy(COMPTROLLER_ADDRESS, registryAddress);
        await moonwellHandler.waitForDeployment();
        const moonwellHandlerAddress = await moonwellHandler.getAddress();
        console.log(`MoonwellHandler deployed to: ${moonwellHandlerAddress}`);

        const CompoundHandlerFactory = await ethers.getContractFactory("CompoundHandler");
        const compoundHandler = await CompoundHandlerFactory.deploy(registryAddress);
        await compoundHandler.waitForDeployment();
        const compoundHandlerAddress = await compoundHandler.getAddress();
        console.log(`CompoundHandler deployed to: ${compoundHandlerAddress}`);

        console.log("Deploying SafeModuleDebtSwap...");

        const SafeModuleDebtSwapFactory = await ethers.getContractFactory("SafeModuleDebtSwap");

        const protocols = [Protocol.AAVE_V3, Protocol.COMPOUND, Protocol.MORPHO, Protocol.FLUID, Protocol.MOONWELL];
        const handlers = [
            "0x3ea412D1d7D7414693f2355D107dbF40440Ff040",
            compoundHandlerAddress,
            "0x18c2fB450f34e3089a6E5a9E501aA2692cE5d63e",
            fluidSafeHandlerAddress,
            moonwellHandlerAddress,
        ];

        const safeModuleDebtSwap = await SafeModuleDebtSwapFactory.deploy(protocols, handlers, PAUSER_ADDRESS);
        await safeModuleDebtSwap.waitForDeployment();
        console.log(`SafeModuleDebtSwap deployed to: ${await safeModuleDebtSwap.getAddress()}`);
    } catch (error) {
        console.error("Deployment error:", error);
    }
}

main().catch(console.error);
