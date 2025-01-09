import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, MaxUint256 } from "ethers";
import cometAbi from "../../externalAbi/compound/comet.json";
import { approve, formatAmount } from "../utils";
import { cbETH_ADDRESS, TEST_ADDRESS } from "../constants";

export class CompoundDebtManager {
    constructor(private signer: HardhatEthersSigner) {}

    async getDebtAmount(cometAddress: string): Promise<bigint> {
        const comet = new ethers.Contract(cometAddress, cometAbi, this.signer);
        return await comet.borrowBalanceOf(TEST_ADDRESS);
    }

    async getCollateralAmount(cometAddress: string): Promise<bigint> {
        const comet = new ethers.Contract(cometAddress, cometAbi, this.signer);
        const response = await comet.userCollateral(TEST_ADDRESS, cbETH_ADDRESS);
        return response.balance;
    }

    async borrowToken(cometAddress: string, assetAddress: string) {
        const comet = new ethers.Contract(cometAddress, cometAbi, this.signer);

        const borrowAmount = ethers.parseUnits("0.1", 6);
        const tx = await comet.withdraw(assetAddress, borrowAmount);
        await tx.wait();
        const borrowedAmount = await this.getDebtAmount(cometAddress);
        console.log(`Borrowed ${formatAmount(borrowedAmount)} ${assetAddress}`);
    }

    async supplyToken(cometAddress: string) {
        await approve(cbETH_ADDRESS, cometAddress, this.signer);
        const supplyAmount = ethers.parseEther("0.001");
        const comet = new ethers.Contract(cometAddress, cometAbi, this.signer);

        const tx = await comet.supply(cbETH_ADDRESS, supplyAmount);
        await tx.wait();
        const suppliedAmount = await this.getCollateralAmount(cometAddress);
        console.log(`Supplied ${ethers.formatEther(suppliedAmount)} cbETH`);
    }
}
