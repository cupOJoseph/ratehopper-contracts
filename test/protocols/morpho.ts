import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, MaxUint256 } from "ethers";
import { DEFAULT_SUPPLY_AMOUNT, TEST_ADDRESS } from "../constants";

import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { approve, formatAmount } from "../utils";
import chainAgnosticBundlerV2Abi from "../../externalAbi/morpho/chainAgnosticBundlerV2.json";

export class MorphoHelper {
    private morpho;

    constructor(private signer: HardhatEthersSigner) {
        this.morpho = new ethers.Contract(
            "0x23055618898e202386e6c13955a58d3c68200bfb",
            chainAgnosticBundlerV2Abi,
            signer,
        );
    }

    async supply(tokenAddress: string) {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);
        await approve(tokenAddress, "0x23055618898e202386e6c13955a58d3c68200bfb", this.signer);
        const amount = ethers.parseEther(DEFAULT_SUPPLY_AMOUNT);
        const tx = await this.morpho.deposit(tokenAddress, amount);
        await tx.wait();
        const walletBalance = await tokenContract.balanceOf(TEST_ADDRESS);
        console.log(`${tokenAddress} Wallet Balance:`, formatAmount(walletBalance));
    }

    async decode(rawData: string) {
        const iface = new ethers.Interface(chainAgnosticBundlerV2Abi);
        const decodedData = iface.parseTransaction({ data: rawData });
        console.log("Decoded Data:", decodedData);
        return decodedData;
    }
}
