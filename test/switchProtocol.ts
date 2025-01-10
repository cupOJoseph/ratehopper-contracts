import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
const { expect } = require("chai");
import { ethers } from "hardhat";

const aaveV3PoolJson = require("../externalAbi/aaveV3/aaveV3Pool.json");

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap } from "../typechain-types";

import { approve, deployContractFixture, formatAmount, getAmountInMax } from "./utils";
import { Contract, MaxUint256 } from "ethers";
import {
    USDC_ADDRESS,
    USDbC_ADDRESS,
    TEST_ADDRESS,
    USDC_hyUSD_POOL,
    ETH_USDbC_POOL,
    AAVE_V3_POOL_ADDRESS,
    Protocols,
    cbETH_ADDRESS,
} from "./constants";

import { AaveV3DebtManager } from "./protocols/aaveV3";
import { CompoundDebtManager, USDC_COMET_ADDRESS } from "./protocols/compound";

describe("Protocol Switch", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;
    let aaveV3Pool: Contract;
    let deployedContractAddress: string;
    let aaveV3DebtManager: AaveV3DebtManager;
    let compoundDebtManager: CompoundDebtManager;

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);
        aaveV3DebtManager = new AaveV3DebtManager(impersonatedSigner);
        compoundDebtManager = new CompoundDebtManager(impersonatedSigner);

        const { debtSwap } = await loadFixture(deployContractFixture);
        deployedContractAddress = await debtSwap.getAddress();

        myContract = await ethers.getContractAt(
            "DebtSwap",
            deployedContractAddress,
            impersonatedSigner,
        );

        aaveV3Pool = new ethers.Contract(AAVE_V3_POOL_ADDRESS, aaveV3PoolJson, impersonatedSigner);
    });

    async function executeDebtSwap(fromTokenAddress: string, flashloanPool: string) {
        const beforeAaveDebt = await aaveV3DebtManager.getDebtAmount(fromTokenAddress);
        const beforeCompoundDebt = await compoundDebtManager.getDebtAmount(USDC_COMET_ADDRESS);

        await approve(fromTokenAddress, deployedContractAddress, impersonatedSigner);
        await approve(cbETH_ADDRESS, USDC_COMET_ADDRESS, impersonatedSigner);
        // await approveDelegation(toTokenAddress, deployedContractAddress, impersonatedSigner);
        const collateralAmount = await aaveV3DebtManager.getCollateralAmount(cbETH_ADDRESS);
        console.log("collateralAmount:", ethers.formatEther(collateralAmount));

        const aTokenAddress = await aaveV3DebtManager.getATokenAddress(cbETH_ADDRESS);
        console.log("aTokenAddress:", aTokenAddress);
        await approve(aTokenAddress, deployedContractAddress, impersonatedSigner);

        const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "address", "uint256"],
            [aTokenAddress, USDC_COMET_ADDRESS, cbETH_ADDRESS, collateralAmount],
        );

        const tx = await myContract.executeDebtSwap(
            flashloanPool,
            Protocols.AAVE_V3,
            Protocols.Compound,
            fromTokenAddress,
            fromTokenAddress,
            beforeAaveDebt,
            getAmountInMax(beforeAaveDebt),
            extraData,
        );
        await tx.wait();

        const afterAaveDebt = await aaveV3DebtManager.getDebtAmount(fromTokenAddress);
        const afterCompoundDebt = await compoundDebtManager.getDebtAmount(USDC_COMET_ADDRESS);

        console.log(
            `Aave Debt Amount:`,
            formatAmount(beforeAaveDebt),
            " -> ",
            formatAmount(afterAaveDebt),
        );
        console.log(
            `Compound Debt Amount:`,
            formatAmount(beforeCompoundDebt),
            " -> ",
            formatAmount(afterCompoundDebt),
        );
        expect(afterAaveDebt).to.be.lessThan(beforeAaveDebt);
        expect(afterCompoundDebt).to.be.greaterThan(beforeCompoundDebt);
    }

    it("should switch USDC debt from Aave to Compound", async function () {
        await aaveV3DebtManager.supply(cbETH_ADDRESS);
        await aaveV3DebtManager.borrow(USDC_ADDRESS);

        await executeDebtSwap(USDC_ADDRESS, USDC_hyUSD_POOL);
    });
});
