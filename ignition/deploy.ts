import { DebtSwap } from "../typechain-types/contracts/DebtSwap";
import hre from "hardhat";
import DebtSwapModule from "./modules/debtSwap";
import ProtocolRegistryModule from "./modules/protocolRegistry";
import { AaveV3Module, CompoundModule, MorphoModule } from "./modules/handlers";
import { Protocols } from "../test/constants";

async function main() {
    // const { aaveV3Handler } = await hre.ignition.deploy(AaveV3Module);
    // console.log(`AaveV3Handler deployed to: ${await aaveV3Handler.getAddress()}`);

    // const { compoundHandler } = await hre.ignition.deploy(CompoundModule);
    // console.log(`CompoundHandler deployed to: ${await compoundHandler.getAddress()}`);

    // const { morphoHandler } = await hre.ignition.deploy(MorphoModule);
    // console.log(`MorphoHandler deployed to: ${await morphoHandler.getAddress()}`);

    // const { protocolRegistry } = await hre.ignition.deploy(ProtocolRegistryModule);
    // console.log(`ProtocolRegistry deployed to: ${await protocolRegistry.getAddress()}`);

    const { debtSwap } = await hre.ignition.deploy(DebtSwapModule);
    console.log(`DebtSwap deployed to: ${await debtSwap.getAddress()}`);

    // await new Promise((resolve) => setTimeout(resolve, 15000));

    // await protocolRegistry.setHandler(Protocols.AAVE_V3, await aaveV3Handler.getAddress());
    // await protocolRegistry.setHandler(Protocols.COMPOUND, await compoundHandler.getAddress());
    // await protocolRegistry.setHandler(Protocols.MORPHO, await morphoHandler.getAddress());
    // await debtSwap.setRegistry("0x6BFDA05cD4438dF03dC3388c0CfD7EFD27Bc665C");
}

main().catch(console.error);
