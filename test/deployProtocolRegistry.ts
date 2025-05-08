import { ethers } from "hardhat";
import { mcbETH, mUSDC, mDAI, COMPTROLLER_ADDRESS } from "./protocols/moonwell";
import { cbETH_ADDRESS, USDC_ADDRESS, DAI_ADDRESS, WETH_ADDRESS, USDbC_ADDRESS, cbBTC_ADDRESS } from "./constants";
import { USDC_COMET_ADDRESS, USDbC_COMET_ADDRESS, WETH_COMET_ADDRESS } from "./protocols/compound";
import { mcbBTC } from "../contractAddresses";

export async function deployProtocolRegistry() {
    const ProtocolRegistry = await ethers.getContractFactory("ProtocolRegistry");
    const protocolRegistry = await ProtocolRegistry.deploy();

    console.log("ProtocolRegistry deployed to:", await protocolRegistry.getAddress());

    const registry = await ethers.getContractAt("ProtocolRegistry", await protocolRegistry.getAddress());

    // Set Moonwell token mappings using batch function
    await registry.batchSetTokenMContracts(
        [cbETH_ADDRESS, cbBTC_ADDRESS, USDC_ADDRESS, DAI_ADDRESS],
        [mcbETH, mcbBTC, mUSDC, mDAI],
    );

    console.log("Moonwell token mappings set in ProtocolRegistry");
    console.log("mUSDC address:", await registry.getMContract(USDC_ADDRESS));

    // Add Compound mappings using batch function
    await registry.batchSetTokenCContracts([USDC_ADDRESS, WETH_ADDRESS], [USDC_COMET_ADDRESS, WETH_COMET_ADDRESS]);
    console.log("Compound token mappings set in ProtocolRegistry");
    console.log("USDC Comet address:", await registry.getCContract(USDC_ADDRESS));

    return registry;
}
