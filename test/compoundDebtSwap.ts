import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";
import hre from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { CompoundDebtSwap } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import cometAbi from "../externalAbi/compound/comet.json";
import { getAmountInMax } from "./utils";
import { Contract, MaxUint256 } from "ethers";
import {
    USDC_ADDRESS,
    USDbC_ADDRESS,
    cbETH_ADDRESS,
    UNISWAP_V3_FACTORY_ADRESS,
    UNISWAP_V3_SWAP_ROUTER_ADDRESS,
    TEST_ADDRESS,
    USDC_hyUSD_POOL,
    ETH_USDbC_POOL,
} from "./constants";

describe("Compound DebtSwap", function () {
    let myContract: CompoundDebtSwap;
    let impersonatedSigner: HardhatEthersSigner;
    let deployedContractAddress: string;

    const USDC_COMET_ADDRESS = "0xb125E6687d4313864e53df431d5425969c15Eb2F";
    const USDbC_COMET_ADDRESS = "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf";

    this.timeout(3000000);

    const contractName = "CompoundDebtSwap";

    async function deployContractFixture() {
        const CompoundDebtSwap = await hre.ethers.getContractFactory(contractName);
        const debtSwap = await CompoundDebtSwap.deploy(
            UNISWAP_V3_FACTORY_ADRESS,
            UNISWAP_V3_SWAP_ROUTER_ADDRESS,
        );

        return {
            debtSwap,
        };
    }

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);

        const { debtSwap } = await loadFixture(deployContractFixture);
        deployedContractAddress = await debtSwap.getAddress();

        myContract = await ethers.getContractAt(
            contractName,
            deployedContractAddress,
            impersonatedSigner,
        );
    });

    async function approve(tokenAddress: string, spenderAddress: string) {
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, impersonatedSigner);
        const approveTx = await token.approve(spenderAddress, MaxUint256);
        await approveTx.wait();
    }

    async function getCurrentDebtAmount(comet_address: string): Promise<bigint> {
        const comet = new ethers.Contract(comet_address, cometAbi, impersonatedSigner);
        const debtAmount = await comet.borrowBalanceOf(TEST_ADDRESS);
        return debtAmount;
    }

    function formatAmount(amount: bigint): string {
        return ethers.formatUnits(String(amount), 6);
    }

    async function borrowToken() {
        const comet = new ethers.Contract(USDC_COMET_ADDRESS, cometAbi, impersonatedSigner);

        const borrowAmount = ethers.parseUnits("0.1", 6);

        const tx = await comet.withdraw(USDC_ADDRESS, borrowAmount);

        const result = await tx.wait();
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

        const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
        const cbETH = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, impersonatedSigner);
        const balance = await usdc.balanceOf(TEST_ADDRESS);
        const cbETHBalance = await cbETH.balanceOf(TEST_ADDRESS);
        const beforeFromTokenDebt = await getCurrentDebtAmount(USDC_COMET_ADDRESS);
        const beforeToTokenDebt = await getCurrentDebtAmount(USDbC_COMET_ADDRESS);

        const tx = await myContract.executeDebtSwap(
            flashloanPool,
            fromTokenAddress,
            toTokenAddress,
            USDbC_COMET_ADDRESS,
            USDC_COMET_ADDRESS,
            cbETH_ADDRESS,
            "300000000000000",
            beforeFromTokenDebt,
            getAmountInMax(beforeFromTokenDebt),
        );
        await tx.wait();

        const afterFromTokenDebt = await getCurrentDebtAmount(USDC_COMET_ADDRESS);
        const afterToTokenDebt = await getCurrentDebtAmount(USDbC_COMET_ADDRESS);

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

    it("should execute debt swap from USDC to USDbC", async function () {
        await borrowToken();

        await approve(cbETH_ADDRESS, USDbC_COMET_ADDRESS);
        await approve(USDC_ADDRESS, USDC_COMET_ADDRESS);

        await executeDebtSwap(USDC_ADDRESS, USDbC_ADDRESS, USDC_hyUSD_POOL);
    });

    it.only("should execute debt swap from USDbC to USDC", async function () {
        await borrowToken();

        await approve(cbETH_ADDRESS, USDC_COMET_ADDRESS);
        await approve(USDbC_ADDRESS, USDbC_COMET_ADDRESS);

        await executeDebtSwap(USDbC_ADDRESS, USDC_ADDRESS, ETH_USDbC_POOL);
    });
});
