import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import hre from "hardhat";
import { ethers } from "hardhat";

const PROTOCOLS = [0, 1, 2, 3, 4];
const HANDLERS = [
    "0x3ea412D1d7D7414693f2355D107dbF40440Ff040", // AaveV3Handler
    "0x7410abF1e92187A1ded8d615A866541cF92dE74B", // CompoundHandler
    "0x18c2fB450f34e3089a6E5a9E501aA2692cE5d63e", // MorphoHandler
    "0xB6e7cDF6Cc57308a1a996704D85C351aBc317f1A", // FluidHandler
    "0xCAaC42dCab2F28095D02F07A4fF9Db7b508F93fB", // MoonwellHandler
];

const LeveragedPositionModule = buildModule("LeveragedPosition", (m) => {
    const leveragedPosition = m.contract("LeveragedPosition", [PROTOCOLS, HANDLERS]);
    return { leveragedPosition };
});

export default LeveragedPositionModule;

async function main() {
    try {
        console.log("Deploying LeveragedPosition contract using Ignition...");
        const { leveragedPosition } = await hre.ignition.deploy(LeveragedPositionModule);
        const address = await leveragedPosition.getAddress();
        console.log(`LeveragedPosition deployed to: ${address}`);
    } catch (error) {
        console.error("Deployment error:", error);
        process.exit(1);
    }
}

main().catch(console.error);
