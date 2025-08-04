import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import hre from "hardhat";
import { ethers } from "hardhat";
import { PARASWAP_V6_CONTRACT_ADDRESS, UNISWAP_V3_FACTORY_ADRESS } from "./constants";

const PROTOCOLS = [0, 1, 2, 3, 4];
const HANDLERS = [
    "0x7f1be446C938c9046206eCbf803405A0B7741D3f", // AaveV3Handler
    "0x62AC021A02A631824B5665C6A8657B9c6e0587e6", // CompoundHandler
    "0xb03B40507829d4Ec4b5681d566eA64CE0264Bf48", // MorphoHandler
    "0x4DAF0278E9c8933685d10d159b80F13a841C8a50", // FluidHandler
    "0xaF141AB1eD50144Ff527cF0Ee5595e7D27dAb935", // MoonwellHandler
];

const LeveragedPositionModule = buildModule("LeveragedPosition", (m) => {
    const leveragedPosition = m.contract("LeveragedPosition", [UNISWAP_V3_FACTORY_ADRESS, PROTOCOLS, HANDLERS]);
    return { leveragedPosition };
});

export default LeveragedPositionModule;

async function main() {
    try {
        console.log("Deploying LeveragedPosition contract using Ignition...");
        const { leveragedPosition } = await hre.ignition.deploy(LeveragedPositionModule);
        const address = await leveragedPosition.getAddress();
        console.log(`LeveragedPosition deployed to: ${address}`);
        await leveragedPosition.setParaswapAddresses(PARASWAP_V6_CONTRACT_ADDRESS, PARASWAP_V6_CONTRACT_ADDRESS);
        console.log("Paraswap addresses set");
    } catch (error) {
        console.error("Deployment error:", error);
        process.exit(1);
    }
}

main().catch(console.error);
