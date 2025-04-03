import { ethers, MaxUint256 } from "ethers";

import dotenv from "dotenv";
import { cbETH_ADDRESS, USDbC_ADDRESS } from "../test/constants";
import cometAbi from "../externalAbi/compound/comet.json";
import { USDC_COMET_ADDRESS } from "../test/protocols/compound";
import { approve } from "../test/utils";
import { AaveV3Helper } from "../test/protocols/aaveV3";
import aaveDebtTokenJson from "../externalAbi/aaveV3/aaveDebtToken.json";
dotenv.config();
const aaveProtocolDataProviderAbi = require("../externalAbi/aaveV3/aaveProtocolDataProvider.json");

const debtSwapContractAddress = "0x0F4bA1e061823830D42350e410513727E7125171";
const provider = new ethers.JsonRpcProvider("https://base.llamarpc.com");
const signer = new ethers.Wallet(process.env.MY_PRIVATE_KEY2!, provider);

async function main() {
    // await compound();
    // await aaveFrom();
    await aaveTo();
}

// async function compound() {
//     const comet = new ethers.Contract(USDC_COMET_ADDRESS, cometAbi, signer);
//     const tx = await comet.allow(debtSwapContractAddress, true);
//     await tx.wait();
//     console.log("Successfully approved DebtSwap contract for Compound");
// }

// async function aaveFrom() {
//     const aaveV3Helper = new AaveV3Helper(signer);
//     const aTokenAddress = await aaveV3Helper.getATokenAddress(cbETH_ADDRESS);
//     await approve(aTokenAddress, debtSwapContractAddress, signer);
//     console.log("Successfully approved A Token");
// }

const aaveV3ProtocolDataProvider = "0xd82a47fdebB5bf5329b09441C3DaB4b5df2153Ad";

async function aaveTo() {
    const protocolDataProvider = new ethers.Contract(aaveV3ProtocolDataProvider, aaveProtocolDataProviderAbi, signer);
    const response = await protocolDataProvider.getReserveTokensAddresses(USDbC_ADDRESS);
    const debtTokenAddress = response.variableDebtTokenAddress;
    const aaveDebtToken = new ethers.Contract(debtTokenAddress, aaveDebtTokenJson, signer);
    const approveDelegationTx = await aaveDebtToken.approveDelegation(debtSwapContractAddress, MaxUint256);
    await approveDelegationTx.wait();
    console.log("approveDelegation:", debtTokenAddress);
}

main().catch((error) => {
    console.error("Error executing:", error);
});
