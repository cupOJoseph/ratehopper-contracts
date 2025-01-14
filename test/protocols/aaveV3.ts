import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, MaxUint256 } from "ethers";
import { AAVE_V3_POOL_ADDRESS, TEST_ADDRESS } from "../constants";
const aaveV3ProtocolDataProvider = "0xd82a47fdebB5bf5329b09441C3DaB4b5df2153Ad";
const aaveProtocolDataProviderAbi = require("../../externalAbi/aaveV3/aaveProtocolDataProvider.json");
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { approve, formatAmount } from "../utils";
const aaveDebtTokenJson = require("../../externalAbi/aaveV3/aaveDebtToken.json");
const aaveV3PoolJson = require("../../externalAbi/aaveV3/aaveV3Pool.json");

export class AaveV3Helper {
    private protocolDataProvider;
    private pool;

    constructor(private signer: HardhatEthersSigner) {
        this.protocolDataProvider = new ethers.Contract(
            aaveV3ProtocolDataProvider,
            aaveProtocolDataProviderAbi,
            signer,
        );
        this.pool = new ethers.Contract(AAVE_V3_POOL_ADDRESS, aaveV3PoolJson, signer);
    }

    async getDebtTokenAddress(assetAddress: string): Promise<string> {
        const response = await this.protocolDataProvider.getReserveTokensAddresses(assetAddress);
        return response.variableDebtTokenAddress;
    }

    async getCollateralAmount(assetAddress: string): Promise<bigint> {
        const result = await this.protocolDataProvider.getUserReserveData(
            assetAddress,
            this.signer,
        );
        return result.currentATokenBalance;
    }

    async getDebtAmount(assetAddress: string): Promise<bigint> {
        const result = await this.protocolDataProvider.getUserReserveData(
            assetAddress,
            this.signer,
        );
        return result.currentVariableDebt;
    }

    async getATokenAddress(assetAddress: string): Promise<string> {
        const result = await this.pool.getReserveData(assetAddress);
        return result.aTokenAddress;
    }

    async approveDelegation(tokenAddress: string, deployedContractAddress: string) {
        const debtTokenAddress = await this.getDebtTokenAddress(tokenAddress);
        const aaveDebtToken = new ethers.Contract(debtTokenAddress, aaveDebtTokenJson, this.signer);
        const approveDelegationTx = await aaveDebtToken.approveDelegation(
            deployedContractAddress,
            MaxUint256,
        );
        await approveDelegationTx.wait();
        console.log("approveDelegation:", debtTokenAddress);
    }

    async supply(tokenAddress: string) {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);

        await approve(tokenAddress, AAVE_V3_POOL_ADDRESS, this.signer);
        const amount = ethers.parseEther("0.001");

        const supplyTx = await this.pool.supply(tokenAddress, amount, TEST_ADDRESS, 0);
        await supplyTx.wait();

        const walletBalance = await tokenContract.balanceOf(TEST_ADDRESS);
        console.log(`${tokenAddress} Wallet Balance:`, ethers.formatEther(walletBalance));
    }

    async borrow(tokenAddress: string) {
        const amount = ethers.parseUnits("1", 6);

        const borrowTx = await this.pool.borrow(tokenAddress, amount, 2, 0, TEST_ADDRESS);
        await borrowTx.wait();

        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);
        const walletBalance = await tokenContract.balanceOf(TEST_ADDRESS);
        console.log(
            `borrowed ${amount}, ${tokenAddress} Wallet Balance:`,
            formatAmount(walletBalance),
        );
    }
}
