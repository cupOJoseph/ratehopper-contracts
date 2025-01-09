import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";
import hre from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import cometAbi from "../externalAbi/compound/comet.json";
import { deployContractFixture, formatAmount, getAmountInMax } from "./utils";
import { Contract, MaxUint256 } from "ethers";
import {
    USDC_ADDRESS,
    USDbC_ADDRESS,
    cbETH_ADDRESS,
    TEST_ADDRESS,
    USDC_hyUSD_POOL,
    ETH_USDbC_POOL,
} from "./constants";

describe("Compound DebtSwap", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;
    let deployedContractAddress: string;

    const USDC_COMET_ADDRESS = "0xb125E6687d4313864e53df431d5425969c15Eb2F";
    const USDbC_COMET_ADDRESS = "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf";

    this.timeout(3000000);

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);

        const { debtSwap } = await loadFixture(deployContractFixture);
        deployedContractAddress = await debtSwap.getAddress();

        myContract = await ethers.getContractAt(
            "DebtSwap",
            deployedContractAddress,
            impersonatedSigner,
        );
    });

    async function approve(tokenAddress: string, spenderAddress: string) {
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, impersonatedSigner);
        const approveTx = await token.approve(spenderAddress, MaxUint256);
        await approveTx.wait();
        console.log("approve:" + tokenAddress + "token to " + spenderAddress);
    }

    async function getDebtAmount(cometAddress: string): Promise<bigint> {
        const comet = new ethers.Contract(cometAddress, cometAbi, impersonatedSigner);
        return await comet.borrowBalanceOf(TEST_ADDRESS);
    }

    async function getCollateralAmount(cometAddress: string): Promise<bigint> {
        const comet = new ethers.Contract(cometAddress, cometAbi, impersonatedSigner);
        const response = await comet.userCollateral(TEST_ADDRESS, cbETH_ADDRESS);
        return response.balance;
    }

    async function borrowToken(cometAddress: string, assetAddress: string) {
        const comet = new ethers.Contract(cometAddress, cometAbi, impersonatedSigner);

        const borrowAmount = ethers.parseUnits("0.1", 6);

        const tx = await comet.withdraw(assetAddress, borrowAmount);

        const result = await tx.wait();
        const borrowedAmount = await getDebtAmount(cometAddress);
        console.log(`Borrowed ${formatAmount(borrowedAmount)} ${assetAddress}`);
    }

    async function supplyToken(cometAddress: string) {
        await approve(cbETH_ADDRESS, cometAddress);

        const comet = new ethers.Contract(cometAddress, cometAbi, impersonatedSigner);

        const supplyAmount = ethers.parseEther("0.001");

        const tx = await comet.supply(cbETH_ADDRESS, supplyAmount);

        const result = await tx.wait();
        const suppliedAmount = await getCollateralAmount(cometAddress);
        console.log(`Supplied ${ethers.formatEther(suppliedAmount)} cbETH`);
    }

    async function executeDebtSwap(
        fromTokenAddress: string,
        toTokenAddress: string,
        flashloanPool: string,
    ) {
        const usdcComet = new ethers.Contract(USDC_COMET_ADDRESS, cometAbi, impersonatedSigner);
        const allowResult = await usdcComet.allow(deployedContractAddress, true);
        await allowResult.wait();

        const usdbcComet = new ethers.Contract(USDbC_COMET_ADDRESS, cometAbi, impersonatedSigner);
        const allowResult2 = await usdbcComet.allow(deployedContractAddress, true);
        await allowResult2.wait();

        const fromCContract =
            fromTokenAddress == USDC_ADDRESS ? USDC_COMET_ADDRESS : USDbC_COMET_ADDRESS;
        const toCContract =
            fromCContract == USDC_COMET_ADDRESS ? USDbC_COMET_ADDRESS : USDC_COMET_ADDRESS;

        const beforeFromTokenDebt = await getDebtAmount(fromCContract);
        const beforeToTokenDebt = await getDebtAmount(toCContract);

        const collateralAmount = await getCollateralAmount(fromCContract);

        const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "address", "uint256"],
            [fromCContract, toCContract, cbETH_ADDRESS, collateralAmount],
        );

        const tx = await myContract.executeDebtSwap(
            1,
            flashloanPool,
            fromTokenAddress,
            toTokenAddress,
            beforeFromTokenDebt,
            getAmountInMax(beforeFromTokenDebt),
            extraData,
        );
        await tx.wait();

        const afterFromTokenDebt = await getDebtAmount(fromCContract);
        const afterToTokenDebt = await getDebtAmount(toCContract);

        console.log(
            `${fromTokenAddress} Debt Amount:`,
            formatAmount(beforeFromTokenDebt),
            " -> ",
            formatAmount(afterFromTokenDebt),
        );
        console.log(
            `${toTokenAddress} Debt Amount:`,
            formatAmount(beforeToTokenDebt),
            " -> ",
            formatAmount(afterToTokenDebt),
        );
        expect(afterFromTokenDebt).to.be.lessThan(beforeFromTokenDebt);
        expect(afterToTokenDebt).to.be.greaterThan(beforeToTokenDebt);
    }

    it("should return collateral amount for cbETH", async function () {
        const collateralAmount = await getCollateralAmount(USDC_COMET_ADDRESS);
        console.log("collateralAmount:", ethers.formatEther(collateralAmount));
    });

    it("should execute debt swap from USDC to USDbC", async function () {
        await supplyToken(USDC_COMET_ADDRESS);
        await borrowToken(USDC_COMET_ADDRESS, USDC_ADDRESS);

        await approve(cbETH_ADDRESS, USDbC_COMET_ADDRESS);
        await approve(USDC_ADDRESS, USDC_COMET_ADDRESS);

        await executeDebtSwap(USDC_ADDRESS, USDbC_ADDRESS, USDC_hyUSD_POOL);
    });

    it("should execute debt swap from USDbC to USDC", async function () {
        await supplyToken(USDbC_COMET_ADDRESS);
        await borrowToken(USDbC_COMET_ADDRESS, USDbC_ADDRESS);

        await approve(cbETH_ADDRESS, USDC_COMET_ADDRESS);
        await approve(USDbC_ADDRESS, USDbC_COMET_ADDRESS);

        await executeDebtSwap(USDbC_ADDRESS, USDC_ADDRESS, ETH_USDbC_POOL);
    });
});
