import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";
const aaveV3PoolJson = require("../externalAbi/aaveV3/aaveV3Pool.json");

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
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
import { AaveV3Helper } from "./protocols/aaveV3";

describe("Aave v3 DebtSwap", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;
    let aaveV3Pool: Contract;
    let deployedContractAddress: string;
    let aaveV3Helper: AaveV3Helper;

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);
        aaveV3Helper = new AaveV3Helper(impersonatedSigner);

        const { debtSwap } = await loadFixture(deployContractFixture);
        deployedContractAddress = await debtSwap.getAddress();

        myContract = await ethers.getContractAt(
            "DebtSwap",
            deployedContractAddress,
            impersonatedSigner,
        );

        aaveV3Pool = new ethers.Contract(AAVE_V3_POOL_ADDRESS, aaveV3PoolJson, impersonatedSigner);
    });

    async function executeDebtSwap(
        fromTokenAddress: string,
        toTokenAddress: string,
        flashloanPool: string,
    ) {
        const beforeFromTokenDebt = await aaveV3Helper.getDebtAmount(fromTokenAddress);
        const beforeToTokenDebt = await aaveV3Helper.getDebtAmount(toTokenAddress);

        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
        const usdcBalance = await usdcContract.balanceOf(TEST_ADDRESS);

        const cbethContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, impersonatedSigner);
        const cbethBalance = await cbethContract.balanceOf(TEST_ADDRESS);

        await approve(USDC_ADDRESS, deployedContractAddress, impersonatedSigner);
        await aaveV3Helper.approveDelegation(toTokenAddress, deployedContractAddress);

        const tx = await myContract.executeDebtSwap(
            flashloanPool,
            Protocols.AAVE_V3,
            Protocols.AAVE_V3,
            fromTokenAddress,
            toTokenAddress,
            beforeFromTokenDebt,
            getAmountInMax(beforeFromTokenDebt),
            "0x",
            "0x",
        );
        await tx.wait();

        const afterFromTokenDebt = await aaveV3Helper.getDebtAmount(fromTokenAddress);
        const afterToTokenDebt = await aaveV3Helper.getDebtAmount(toTokenAddress);

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
        expect(afterToTokenDebt).to.be.greaterThanOrEqual(beforeToTokenDebt);
    }

    it("should return debt token address", async function () {
        const tokenAddress = await aaveV3Helper.getDebtTokenAddress(USDbC_ADDRESS);
        expect(tokenAddress).to.be.equal("0x7376b2F323dC56fCd4C191B34163ac8a84702DAB");
    });

    it("should return current debt amount", async function () {
        const currentDebtAmount = await aaveV3Helper.getDebtAmount(USDC_ADDRESS);
        console.log("currentDebtAmount:", currentDebtAmount);
    });

    it("should switch from USDC to USDbC", async function () {
        await aaveV3Helper.supply(cbETH_ADDRESS);
        await aaveV3Helper.borrow(USDC_ADDRESS);

        await executeDebtSwap(USDC_ADDRESS, USDbC_ADDRESS, USDC_hyUSD_POOL);
    });

    it("should switch from USDbC to USDC", async function () {
        await aaveV3Helper.supply(cbETH_ADDRESS);
        await aaveV3Helper.borrow(USDbC_ADDRESS);

        await executeDebtSwap(USDbC_ADDRESS, USDC_ADDRESS, ETH_USDbC_POOL);
    });
});
