import hre from "hardhat";
import { ethers } from "hardhat";
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { getCTokenMappingArrays, getMTokenMappingArrays } from "../contractAddresses";
import { PARASWAP_V6_CONTRACT_ADDRESS, UNISWAP_V3_FACTORY_ADRESS } from "./constants";

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

async function main() {
    try {
        // console.log("Deploying ProtocolRegistry and setting token mappings...");
        // const { protocolRegistry } = await hre.ignition.deploy(ProtocolRegistryModule);
        // const registryAddress = await protocolRegistry.getAddress();
        // console.log(`ProtocolRegistry deployed to: ${registryAddress}`);

        // const registry = await ethers.getContractAt("ProtocolRegistry", registryAddress);

        // const [mTokens, mContracts] = getMTokenMappingArrays();
        // await registry.batchSetTokenMContracts(mTokens, mContracts);
        // console.log("Moonwell token mappings set in ProtocolRegistry");

        // const [cTokens, cContracts] = getCTokenMappingArrays();
        // await registry.batchSetTokenCContracts(cTokens, cContracts);
        // console.log("Compound token mappings set in ProtocolRegistry");

        // const CompoundHandlerFactory = await ethers.getContractFactory("CompoundHandler");
        // const compoundHandler = await CompoundHandlerFactory.deploy(registryAddress);
        // await compoundHandler.waitForDeployment();
        // const compoundHandlerAddress = await compoundHandler.getAddress();
        // console.log(`CompoundHandler deployed to: ${compoundHandlerAddress}`);

        // Deploy FluidSafeHandler directly with ethers instead of Ignition to avoid reconciliation errors
        const registryAddress = "0xc2b45C4FCaEAE99e609Dd2aAB1684ffBbb95fDEa";
        console.log("Deploying FluidSafeHandler...");
        const FluidSafeHandlerFactory = await ethers.getContractFactory("FluidSafeHandler");
        const fluidSafeHandler = await FluidSafeHandlerFactory.deploy(
            FLUID_VAULT_RESOLVER,
            UNISWAP_V3_FACTORY_ADRESS,
            registryAddress,
        );
        await fluidSafeHandler.waitForDeployment();
        const fluidSafeHandlerAddress = await fluidSafeHandler.getAddress();
        console.log(`FluidSafeHandler deployed to: ${fluidSafeHandlerAddress}`);

        const MoonwellHandlerFactory = await ethers.getContractFactory("MoonwellHandler");
        const moonwellHandler = await MoonwellHandlerFactory.deploy(
            COMPTROLLER_ADDRESS,
            UNISWAP_V3_FACTORY_ADRESS,
            registryAddress,
        );
        await moonwellHandler.waitForDeployment();
        const moonwellHandlerAddress = await moonwellHandler.getAddress();
        console.log(`MoonwellHandler deployed to: ${moonwellHandlerAddress}`);

        console.log("Deploying SafeModuleDebtSwap...");

        const SafeModuleDebtSwapFactory = await ethers.getContractFactory("SafeModuleDebtSwap");

        const protocols = [Protocol.AAVE_V3, Protocol.COMPOUND, Protocol.MORPHO, Protocol.FLUID, Protocol.MOONWELL];
        const handlers = [
            "0x7f1be446C938c9046206eCbf803405A0B7741D3f",
            "0xAc7DE99B36a0Eedac192a94d9da5A295439A3a5d",
            "0xb03B40507829d4Ec4b5681d566eA64CE0264Bf48",
            fluidSafeHandlerAddress,
            moonwellHandlerAddress,
        ];

        const safeModuleDebtSwap = await SafeModuleDebtSwapFactory.deploy(
            UNISWAP_V3_FACTORY_ADRESS,
            protocols,
            handlers,
            PAUSER_ADDRESS,
        );
        await safeModuleDebtSwap.waitForDeployment();
        console.log(`SafeModuleDebtSwap deployed to: ${await safeModuleDebtSwap.getAddress()}`);

        safeModuleDebtSwap.setParaswapAddresses(PARASWAP_V6_CONTRACT_ADDRESS, PARASWAP_V6_CONTRACT_ADDRESS);
    } catch (error) {
        console.error("Deployment error:", error);
    }
}

main().catch(console.error);
