import hre from "hardhat";
import { ethers } from "hardhat";
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Define constants directly in this file to avoid importing from test files
const AAVE_V3_POOL_ADDRESS = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const AAVE_V3_DATA_PROVIDER_ADDRESS = "0xd82a47fdebB5bf5329b09441C3DaB4b5df2153Ad";
const MORPHO_ADDRESS = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

// Define Protocol enum directly
enum Protocol {
    AAVE_V3,
    COMPOUND,
    MORPHO,
    FLUID,
    MOONWELL,
}

// Define handler modules directly
const AaveV3Module = buildModule("AaveV3Handler", (m) => {
    const aaveV3Handler = m.contract("AaveV3Handler", [AAVE_V3_POOL_ADDRESS, AAVE_V3_DATA_PROVIDER_ADDRESS]);
    return { aaveV3Handler };
});

const CompoundModule = buildModule("CompoundHandler", (m) => {
    const compoundHandler = m.contract("CompoundHandler", []);
    return { compoundHandler };
});

const MorphoModule = buildModule("MorphoHandler", (m) => {
    const morphoHandler = m.contract("MorphoHandler", [MORPHO_ADDRESS]);
    return { morphoHandler };
});

async function main() {
    try {
        // Deploy all handlers first
        // console.log("Deploying AaveV3Handler...");
        // const { aaveV3Handler } = await hre.ignition.deploy(AaveV3Module);
        // const aaveV3HandlerAddress = await aaveV3Handler.getAddress();
        // console.log(`AaveV3Handler deployed to: ${aaveV3HandlerAddress}`);

        // console.log("Deploying CompoundHandler...");
        // const { compoundHandler } = await hre.ignition.deploy(CompoundModule);
        // const compoundHandlerAddress = await compoundHandler.getAddress();
        // console.log(`CompoundHandler deployed to: ${compoundHandlerAddress}`);

        // console.log("Deploying MorphoHandler...");
        // const { morphoHandler } = await hre.ignition.deploy(MorphoModule);
        // const morphoHandlerAddress = await morphoHandler.getAddress();
        // console.log(`MorphoHandler deployed to: ${morphoHandlerAddress}`);

        // Deploy DebtSwap directly using ethers
        console.log("Deploying DebtSwap directly...");
        const DebtSwapFactory = await ethers.getContractFactory("DebtSwap");

        // Prepare constructor arguments
        const protocols = [Protocol.AAVE_V3, Protocol.COMPOUND, Protocol.MORPHO];
        // const handlers = [aaveV3HandlerAddress, compoundHandlerAddress, morphoHandlerAddress];
        const handlers = [
            "0x3ea412D1d7D7414693f2355D107dbF40440Ff040",
            "0x7410abF1e92187A1ded8d615A866541cF92dE74B",
            "0x18c2fB450f34e3089a6E5a9E501aA2692cE5d63e",
        ];

        const debtSwap = await DebtSwapFactory.deploy(protocols, handlers);
        await debtSwap.waitForDeployment();

        console.log(`DebtSwap deployed to: ${await debtSwap.getAddress()}`);
    } catch (error) {
        console.error("Deployment error:", error);
    }
}

main().catch(console.error);
