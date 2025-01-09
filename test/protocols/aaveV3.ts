import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, MaxUint256 } from "ethers";
const aaveV3ProtocolDataProvider = "0xd82a47fdebB5bf5329b09441C3DaB4b5df2153Ad";
const aaveProtocolDataProviderAbi = require("../../externalAbi/aaveV3/aaveProtocolDataProvider.json");
const aaveDebtTokenJson = require("../../externalAbi/aaveV3/aaveDebtToken.json");

export class AaveV3DebtManager {
    private protocolDataProvider;

    constructor(private signer: HardhatEthersSigner) {
        this.protocolDataProvider = new ethers.Contract(
            aaveV3ProtocolDataProvider,
            aaveProtocolDataProviderAbi,
            signer,
        );
    }

    async getDebtTokenAddress(assetAddress: string): Promise<string> {
        const response = await this.protocolDataProvider.getReserveTokensAddresses(assetAddress);
        return response.variableDebtTokenAddress;
    }

    async getDebtAmount(assetAddress: string): Promise<bigint> {
        const result = await this.protocolDataProvider.getUserReserveData(
            assetAddress,
            this.signer,
        );
        return result.currentVariableDebt;
    }

    async approveDelegation(tokenAddress: string, deployedContractAddress: string) {
        const debtTokenAddress = await this.getDebtTokenAddress(tokenAddress);
        const aaveDebtToken = new ethers.Contract(debtTokenAddress, aaveDebtTokenJson, this.signer);
        const approveDelegationTx = await aaveDebtToken.approveDelegation(
            deployedContractAddress,
            MaxUint256,
        );
        await approveDelegationTx.wait();
    }
}
