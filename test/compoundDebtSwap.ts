import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";

import { approve, deployContractFixture, formatAmount, getAmountInMax } from "./utils";

import {
    USDC_ADDRESS,
    USDbC_ADDRESS,
    cbETH_ADDRESS,
    TEST_ADDRESS,
    USDC_hyUSD_POOL,
    ETH_USDbC_POOL,
    Protocols,
} from "./constants";
import {
    cometAddressMap,
    CompoundHelper,
    USDbC_COMET_ADDRESS,
    USDC_COMET_ADDRESS,
} from "./protocols/compound";

describe("Compound DebtSwap", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;
    let deployedContractAddress: string;
    let compoundHelper: CompoundHelper;

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);
        compoundHelper = new CompoundHelper(impersonatedSigner);

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
        const fromCContract = cometAddressMap.get(fromTokenAddress)!;
        const toCContract = cometAddressMap.get(toTokenAddress)!;

        await compoundHelper.allow(fromTokenAddress, deployedContractAddress);
        await compoundHelper.allow(toTokenAddress, deployedContractAddress);

        const beforeFromTokenDebt = await compoundHelper.getDebtAmount(fromTokenAddress);
        const beforeToTokenDebt = await compoundHelper.getDebtAmount(toTokenAddress);
        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
        const usdcBalance = await usdcContract.balanceOf(TEST_ADDRESS);

        const cbethContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, impersonatedSigner);
        const cbethBalance = await cbethContract.balanceOf(TEST_ADDRESS);

        const collateralAmount = await compoundHelper.getCollateralAmount(fromCContract);

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

        const afterFromTokenDebt = await compoundHelper.getDebtAmount(fromTokenAddress);
        const afterToTokenDebt = await compoundHelper.getDebtAmount(toTokenAddress);

        const usdcBalanceAfter = await usdcContract.balanceOf(TEST_ADDRESS);
        const cbethBalanceAfter = await cbethContract.balanceOf(TEST_ADDRESS);

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

        expect(usdcBalanceAfter).to.be.equal(usdcBalance);
        expect(cbethBalanceAfter).to.be.equal(cbethBalance);
        expect(afterFromTokenDebt).to.be.lessThan(beforeFromTokenDebt);
        expect(afterToTokenDebt).to.be.greaterThan(beforeToTokenDebt);
    }

    it("should return collateral amount for cbETH", async function () {
        const collateralAmount = await compoundHelper.getCollateralAmount(USDC_COMET_ADDRESS);
        console.log("collateralAmount:", ethers.formatEther(collateralAmount));
    });

    it("should switch from USDC to USDbC", async function () {
        await compoundHelper.supply(USDC_COMET_ADDRESS);
        await compoundHelper.borrow(USDC_ADDRESS);

        await executeDebtSwap(USDC_ADDRESS, USDbC_ADDRESS, USDC_hyUSD_POOL);
    });

    it("should switch from USDbC to USDC", async function () {
        await compoundHelper.supply(USDbC_COMET_ADDRESS);
        await compoundHelper.borrow(USDbC_ADDRESS);

        await executeDebtSwap(USDbC_ADDRESS, USDC_ADDRESS, ETH_USDbC_POOL);
    });
});
