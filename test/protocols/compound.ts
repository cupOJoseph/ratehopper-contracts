import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, MaxUint256 } from "ethers";
import cometAbi from "../../externalAbi/compound/comet.json";
import { approve, formatAmount } from "../utils";
import { cbETH_ADDRESS, TEST_ADDRESS, USDbC_ADDRESS, USDC_ADDRESS } from "../constants";

export const USDC_COMET_ADDRESS = "0xb125E6687d4313864e53df431d5425969c15Eb2F";
export const USDbC_COMET_ADDRESS = "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf";

export const cometAddressMap = new Map<string, string>([
    [USDC_ADDRESS, USDC_COMET_ADDRESS],
    [USDbC_ADDRESS, USDbC_COMET_ADDRESS],
]);

export class CompoundHelper {
    constructor(private signer: HardhatEthersSigner) {}

    async getDebtAmount(tokenAddress: string): Promise<bigint> {
        const comet = new ethers.Contract(
            cometAddressMap.get(tokenAddress)!,
            cometAbi,
            this.signer,
        );
        return await comet.borrowBalanceOf(TEST_ADDRESS);
    }

    async getCollateralAmount(cometAddress: string): Promise<bigint> {
        const comet = new ethers.Contract(cometAddress, cometAbi, this.signer);
        const response = await comet.userCollateral(TEST_ADDRESS, cbETH_ADDRESS);
        return response.balance;
    }

    async supply(cometAddress: string) {
        await approve(cbETH_ADDRESS, cometAddress, this.signer);
        const supplyAmount = ethers.parseEther("0.001");
        const comet = new ethers.Contract(cometAddress, cometAbi, this.signer);

        const tx = await comet.supply(cbETH_ADDRESS, supplyAmount);
        await tx.wait();
        const suppliedAmount = await this.getCollateralAmount(cometAddress);
        console.log(`Supplied ${ethers.formatEther(suppliedAmount)} cbETH`);
    }

    async borrow(tokenAddress: string) {
        const comet = new ethers.Contract(
            cometAddressMap.get(tokenAddress)!,
            cometAbi,
            this.signer,
        );

        const borrowAmount = ethers.parseUnits("1", 6);
        const tx = await comet.withdraw(tokenAddress, borrowAmount);
        await tx.wait();
        const borrowedAmount = await this.getDebtAmount(tokenAddress);
        console.log(`Borrowed ${formatAmount(borrowedAmount)} ${tokenAddress}`);
    }

    async allow(tokenAddress: string, targetAddress: string) {
        const comet = new ethers.Contract(
            cometAddressMap.get(tokenAddress)!,
            cometAbi,
            this.signer,
        );
        const tx = await comet.allow(targetAddress, true);
        await tx.wait();
        console.log(`allow ${tokenAddress} to ${targetAddress}`);
    }

    encodeExtraData(
        fromCometAddress: string,
        toCometAddress: string,
        colalleralAddress: string,
        collateralAmount: bigint,
    ) {
        return ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "address", "uint256"],
            [fromCometAddress, toCometAddress, colalleralAddress, collateralAmount],
        );
    }
}
