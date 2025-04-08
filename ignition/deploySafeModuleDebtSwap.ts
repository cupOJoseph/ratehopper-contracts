import hre from "hardhat";
import { ethers } from "hardhat";
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PAUSER_ADDRESS = "0x9E073c36F63BF1c611026fdA1fF6007A81932231"; // Replace with actual pauser address
const FLUID_VAULT_RESOLVER = "0x79B3102173EB84E6BCa182C7440AfCa5A41aBcF8";
const COMPTROLLER_ADDRESS = "0xfbb21d0380bee3312b33c4353c8936a0f13ef26c";

enum Protocol {
    AAVE_V3,
    COMPOUND,
    MORPHO,
    FLUID,
    MOONWELL,
}

const FluidSafeHandlerModule = buildModule("FluidSafeHandler", (m) => {
    const fluidSafeHandler = m.contract("FluidSafeHandler", [FLUID_VAULT_RESOLVER]);
    return { fluidSafeHandler };
});

const MoonwellHandlerModule = buildModule("MoonwellHandler", (m) => {
    const moonwellHandler = m.contract("MoonwellHandler", [COMPTROLLER_ADDRESS]);
    return { moonwellHandler };
});

async function main() {
    try {
        const { fluidSafeHandler } = await hre.ignition.deploy(FluidSafeHandlerModule);
        const fluidSafeHandlerAddress = await fluidSafeHandler.getAddress();
        const { moonwellHandler } = await hre.ignition.deploy(MoonwellHandlerModule);
        const moonwellHandlerAddress = await moonwellHandler.getAddress();

        console.log("Deploying SafeModuleDebtSwap and its dependencies...");

        const SafeModuleDebtSwapFactory = await ethers.getContractFactory("SafeModuleDebtSwap");

        const protocols = [Protocol.AAVE_V3, Protocol.COMPOUND, Protocol.MORPHO, Protocol.FLUID, Protocol.MOONWELL];
        const handlers = [
            "0x3ea412D1d7D7414693f2355D107dbF40440Ff040",
            "0x4D230ab22c49BB5D2C62d62aB7F3F19fa7B3E099",
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
