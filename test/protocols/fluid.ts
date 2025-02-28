import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, MaxUint256 } from "ethers";
import fluidAbi from "../../externalAbi/fluid/fluidVaultT1.json";
import fluidVaultResolverAbi from "../../externalAbi/fluid/fluidVaultResolver.json";
import { approve, formatAmount } from "../utils";
import {
    cbETH_ADDRESS,
    DEFAULT_SUPPLY_AMOUNT,
    sUSDS_ADDRESS,
    TEST_ADDRESS,
    USDbC_ADDRESS,
    USDC_ADDRESS,
} from "../constants";

export const FLUID_VAULT_RESOLVER = "0x79B3102173EB84E6BCa182C7440AfCa5A41aBcF8";
export const FLUID_cbETH_USDC_VAULT = "0x40d9b8417e6e1dcd358f04e3328bced061018a82";

export const fluidVaultMap = new Map<string, string>([
    // https://fluid.instadapp.io/vaults/8453/6
    [USDC_ADDRESS, FLUID_cbETH_USDC_VAULT],
]);

export class FluidHelper {
    constructor(private signer: HardhatEthersSigner | any) {}

    async getPosition(vaultAddress: string, userAddress) {
        const resolver = new ethers.Contract(FLUID_VAULT_RESOLVER, fluidVaultResolverAbi, this.signer);
        const positions = await resolver.positionsByUser(userAddress);
        const positionIndex = positions[1].findIndex((vault) => vault[0].toLowerCase() === vaultAddress);
        if (positionIndex === -1) {
            return;
        }
        return positions[0][positionIndex];
    }

    async getDebtAmount(tokenAddress: string, userAddress: string): Promise<bigint> {
        const vaultAddress = fluidVaultMap.get(tokenAddress)!;
        const position = await this.getPosition(vaultAddress, userAddress);
        if (!position) return BigInt(0);

        const debtAmount = position[10];
        console.log("debtAmount:", debtAmount + " on vault: " + vaultAddress);
        return debtAmount;
    }

    // INFO: https://docs.fluid.instadapp.io/integrate/vault-user-positions.html
    async getCollateralAmount(tokenAddress: string, userAddress: string): Promise<bigint> {
        const vaultAddress = fluidVaultMap.get(tokenAddress)!;
        const position = await this.getPosition(vaultAddress, userAddress);
        const collateralAmount = position[9];
        console.log("collateralAmount:", collateralAmount + " on vault: " + vaultAddress);
        return collateralAmount;
    }

    async getNftId(vaultAddress: string, userAddress: string): Promise<bigint> {
        const position = await this.getPosition(vaultAddress, userAddress);
        const nftId = position[0];
        console.log("nftId:", nftId + " on vault: " + vaultAddress);
        return nftId;
    }

    async supply(vaultAddress: string) {
        await approve(cbETH_ADDRESS, vaultAddress, this.signer);

        const vault = new ethers.Contract(vaultAddress, fluidAbi, this.signer);
        const supplyAmount = ethers.parseEther(DEFAULT_SUPPLY_AMOUNT);
        // new position
        const tx = await vault.operate(0, supplyAmount, 0, this.signer.address);
        await tx.wait();
    }

    async borrow(vaultAddress: string, tokenAddress: string, userAddress: string) {
        await approve(tokenAddress, vaultAddress, this.signer);

        const nftId = await this.getNftId(vaultAddress, userAddress);

        const vault = new ethers.Contract(vaultAddress, fluidAbi, this.signer);
        const borrowAmount = ethers.parseUnits("1", 6);
        // new position
        const tx = await vault.operate(nftId, 0, borrowAmount, this.signer.address);
        await tx.wait();
    }
}
