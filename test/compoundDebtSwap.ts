import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";
import hre from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import cometAbi from "../externalAbi/compound/comet.json";
import { approve, deployContractFixture, formatAmount, getAmountInMax } from "./utils";
import { Contract, MaxUint256 } from "ethers";
import {
    USDC_ADDRESS,
    USDbC_ADDRESS,
    cbETH_ADDRESS,
    TEST_ADDRESS,
    USDC_hyUSD_POOL,
    ETH_USDbC_POOL,
    Protocols,
} from "./constants";
import { CompoundDebtManager, USDbC_COMET_ADDRESS, USDC_COMET_ADDRESS } from "./protocols/compound";

describe("Compound DebtSwap", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;
    let deployedContractAddress: string;
    let compoundDebtManager: CompoundDebtManager;

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);
        compoundDebtManager = new CompoundDebtManager(impersonatedSigner);

        const { debtSwap } = await loadFixture(deployContractFixture);
        deployedContractAddress = await debtSwap.getAddress();

        myContract = await ethers.getContractAt(
            "DebtSwap",
            deployedContractAddress,
            impersonatedSigner,
        );
    });

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

        const beforeFromTokenDebt = await compoundDebtManager.getDebtAmount(fromCContract);
        const beforeToTokenDebt = await compoundDebtManager.getDebtAmount(toCContract);

        const collateralAmount = await compoundDebtManager.getCollateralAmount(fromCContract);

        const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "address", "uint256"],
            [fromCContract, toCContract, cbETH_ADDRESS, collateralAmount],
        );

        const tx = await myContract.executeDebtSwap(
            flashloanPool,
            Protocols.COMPOUND,
            Protocols.COMPOUND,
            fromTokenAddress,
            toTokenAddress,
            beforeFromTokenDebt,
            getAmountInMax(beforeFromTokenDebt),
            extraData,
            "0x",
        );
        await tx.wait();

        const afterFromTokenDebt = await compoundDebtManager.getDebtAmount(fromCContract);
        const afterToTokenDebt = await compoundDebtManager.getDebtAmount(toCContract);

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
        const collateralAmount = await compoundDebtManager.getCollateralAmount(USDC_COMET_ADDRESS);
        console.log("collateralAmount:", ethers.formatEther(collateralAmount));
    });

    it("should switch from USDC to USDbC", async function () {
        await compoundDebtManager.supply(USDC_COMET_ADDRESS);
        await compoundDebtManager.borrow(USDC_COMET_ADDRESS, USDC_ADDRESS);

        await approve(cbETH_ADDRESS, USDbC_COMET_ADDRESS, impersonatedSigner);
        await approve(USDC_ADDRESS, USDC_COMET_ADDRESS, impersonatedSigner);

        await executeDebtSwap(USDC_ADDRESS, USDbC_ADDRESS, USDC_hyUSD_POOL);
    });

    it("should switch from USDbC to USDC", async function () {
        await compoundDebtManager.supply(USDbC_COMET_ADDRESS);
        await compoundDebtManager.borrow(USDbC_COMET_ADDRESS, USDbC_ADDRESS);

        await approve(cbETH_ADDRESS, USDC_COMET_ADDRESS, impersonatedSigner);
        await approve(USDbC_ADDRESS, USDbC_COMET_ADDRESS, impersonatedSigner);

        await executeDebtSwap(USDbC_ADDRESS, USDC_ADDRESS, ETH_USDbC_POOL);
    });
});
