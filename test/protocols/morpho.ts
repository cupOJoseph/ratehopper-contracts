import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, MaxUint256 } from "ethers";
import { cbETH_ADDRESS, DEFAULT_SUPPLY_AMOUNT, TEST_ADDRESS, USDC_ADDRESS } from "../constants";

import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { approve, formatAmount } from "../utils";
import chainAgnosticBundlerV2Abi from "../../externalAbi/morpho/chainAgnosticBundlerV2.json";
import morphoAbi from "../../externalAbi/morpho/morpho.json";
import { BundlerAction } from "@morpho-org/bundler-sdk-ethers";

export const bundlerAddress = "0x23055618898e202386e6c13955a58d3c68200bfb";
export const MORPHO_ADDRESS = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

export class MorphoHelper {
    private morpho;

    constructor(private signer: HardhatEthersSigner) {
        this.morpho = new ethers.Contract(MORPHO_ADDRESS, morphoAbi, signer);
    }

    async getDebtAmount(marketId: string): Promise<bigint> {
        const positionData = await this.getPosition(marketId);
        const marketData = await this.getMarketData(marketId);
        const borrowShares = BigInt(positionData.borrowShares);
        const totalBorrowAssets = BigInt(marketData.totalBorrowAssets) + BigInt(1);
        const totalBorrowShares = BigInt(marketData.totalBorrowShares) + BigInt(1000000);

        const result1 = borrowShares * totalBorrowAssets;
        const result2 = totalBorrowShares - BigInt(1);
        const debtAmount = result1 / result2;
        console.log("debtAmount:", formatAmount(debtAmount));
        return debtAmount;
    }

    async getCollateralAmount(marketId: string): Promise<bigint> {
        const positionData = await this.getPosition(marketId);
        const collateralAmount = positionData.collateral;
        console.log("collateralAmount:", collateralAmount);
        return collateralAmount;
    }

    async getPosition(marketId: string) {
        const position = await this.morpho.position(marketId, TEST_ADDRESS);
        console.log("position:", position);
        return position;
    }

    async getMarketData(marketId: string) {
        const marketData = await this.morpho.market(marketId);
        return marketData;
    }

    async borrow() {
        const marketParams = {
            collateralToken: cbETH_ADDRESS,
            loanToken: USDC_ADDRESS,
            irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
            oracle: "0xb40d93F44411D8C09aD17d7F88195eF9b05cCD96",
            lltv: 860000000000000000n, // 86% LLTV
        };

        const amount = ethers.parseUnits("1", 6);
        const tx = await this.morpho.borrow(marketParams, amount, 0, TEST_ADDRESS, TEST_ADDRESS);
        await tx.wait();
        // const receipt = await tx.wait();
        // console.log("Transaction Receipt:", receipt);

        // if (receipt.logs) {
        //     receipt.logs.forEach((log, index) => {
        //         console.log(`Log ${index}:`, log);
        //     });
        // }
    }

    async supply(tokenAddress: string) {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);
        await approve(tokenAddress, bundlerAddress, this.signer);
        const amount = ethers.parseEther(DEFAULT_SUPPLY_AMOUNT);
        const borrowAmount = ethers.parseUnits("1", 6);

        const walletBalance = await tokenContract.balanceOf(TEST_ADDRESS);
        console.log(`${tokenAddress} Wallet Balance:`, formatAmount(walletBalance));

        const erc20TransferAction = BundlerAction.erc20TransferFrom(tokenAddress, amount);

        const marketParams = {
            collateralToken: cbETH_ADDRESS,
            loanToken: USDC_ADDRESS,
            irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
            oracle: "0xb40d93F44411D8C09aD17d7F88195eF9b05cCD96",
            lltv: 860000000000000000n, // 86% LLTV
        };

        const supplyAction = BundlerAction.morphoSupplyCollateral(
            marketParams,
            amount,
            TEST_ADDRESS,
            [],
        );

        const borrowAction = BundlerAction.morphoBorrow(
            marketParams,
            borrowAmount,
            0n,
            0n,
            TEST_ADDRESS,
        );

        const bundler = new Contract(bundlerAddress, chainAgnosticBundlerV2Abi, this.signer);
        await bundler.multicall([erc20TransferAction, supplyAction]);

        const walletBalanceAfter = await tokenContract.balanceOf(TEST_ADDRESS);
        console.log(`${tokenAddress} Wallet Balance:`, formatAmount(walletBalanceAfter));
    }

    async decode(rawData: string) {
        const iface = new ethers.Interface(chainAgnosticBundlerV2Abi);
        const calldataArray = iface.decodeFunctionData(rawData.slice(0, 10), rawData);
        console.log("Calldata Array:", calldataArray.length);

        for (const calldata of calldataArray) {
            const decodedFunction = iface.parseTransaction({ data: calldata[0] });
            console.log("Function name:", decodedFunction!.name);
            const decodedData = iface.decodeFunctionData(calldata[0].slice(0, 10), calldata[0]);
            console.log("Decoded Data:", decodedData);
        }
    }
}
