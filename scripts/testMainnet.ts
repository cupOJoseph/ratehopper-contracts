import { ethers, MaxUint256 } from "ethers";

import dotenv from "dotenv";
import {
    cbETH_ADDRESS,
    DEFAULT_SUPPLY_AMOUNT,
    Protocols,
    USDbC_ADDRESS,
    USDC_ADDRESS,
    USDC_hyUSD_POOL,
} from "../test/constants";
dotenv.config();
import * as debtSwapJson from "../artifacts/contracts/DebtSwap.sol/DebtSwap.json";
import { AaveV3Helper } from "../test/protocols/aaveV3";
import { DebtSwap } from "../typechain-types";

async function main() {
    const provider = new ethers.JsonRpcProvider("https://base.llamarpc.com");
    const signer = new ethers.Wallet(process.env.MY_PRIVATE_KEY!, provider);

    const debtSwapAddress = "0xc59d0C394fAF06df813319767cA0A55DB3eA46e1";
    const aaveV3Helper = new AaveV3Helper(signer);
    await aaveV3Helper.approveDelegation(USDbC_ADDRESS, debtSwapAddress);

    const debtSwapABI = [...debtSwapJson.abi];
    const debtSwapContract = new ethers.Contract(debtSwapAddress, debtSwapABI, signer);

    const tx = await debtSwapContract.executeDebtSwap(
        USDC_hyUSD_POOL,
        Protocols.AAVE_V3,
        Protocols.AAVE_V3,
        USDC_ADDRESS,
        USDbC_ADDRESS,
        MaxUint256,
        10,
        [{ asset: cbETH_ADDRESS, amount: ethers.parseEther(DEFAULT_SUPPLY_AMOUNT) }],
        "0x",
        "0x",
    );
    console.log("tx:", tx);

    const result = await tx.wait();
    console.log("result:", result);
}

main().catch((error) => {
    console.error("Error executing:", error);
});
