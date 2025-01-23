import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";

import { approve, deployContractFixture, formatAmount, getAmountInMax, wrapETH } from "./utils";

import {
    USDC_ADDRESS,
    USDbC_ADDRESS,
    cbETH_ADDRESS,
    TEST_ADDRESS,
    USDC_hyUSD_POOL,
    ETH_USDbC_POOL,
    Protocols,
    WETH_ADDRESS,
    DEFAULT_SUPPLY_AMOUNT,
} from "./constants";
import {
    cometAddressMap,
    CompoundHelper,
    USDbC_COMET_ADDRESS,
    USDC_COMET_ADDRESS,
} from "./protocols/compound";
import { MaxUint256 } from "ethers";

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
        collateralTokenAddress: string,
        useMaxAmount = false,
        anotherCollateralTokenAddress?: string,
    ) {
        const fromCContract = cometAddressMap.get(fromTokenAddress)!;
        const toCContract = cometAddressMap.get(toTokenAddress)!;

        await compoundHelper.allow(fromTokenAddress, deployedContractAddress);
        await compoundHelper.allow(toTokenAddress, deployedContractAddress);

        const beforeFromTokenDebt = await compoundHelper.getDebtAmount(fromTokenAddress);
        const beforeToTokenDebt = await compoundHelper.getDebtAmount(toTokenAddress);
        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
        const usdcBalance = await usdcContract.balanceOf(TEST_ADDRESS);

        const collateralToken = new ethers.Contract(
            collateralTokenAddress,
            ERC20_ABI,
            impersonatedSigner,
        );
        const collateralBalance = await collateralToken.balanceOf(TEST_ADDRESS);

        const collateralAmount = await compoundHelper.getCollateralAmount(
            fromCContract,
            collateralTokenAddress,
        );

        const fromExtraData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address"],
            [fromCContract],
        );

        const toExtraData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [toCContract]);

        await time.increaseTo((await time.latest()) + 600);

        const debtAmount = useMaxAmount ? MaxUint256 : beforeFromTokenDebt;

        const collateralArray = anotherCollateralTokenAddress
            ? [
                  { asset: collateralTokenAddress, amount: collateralAmount },
                  {
                      asset: anotherCollateralTokenAddress,
                      amount: ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
                  },
              ]
            : [{ asset: collateralTokenAddress, amount: collateralAmount }];

        const tx = await myContract.executeDebtSwap(
            flashloanPool,
            Protocols.COMPOUND,
            Protocols.COMPOUND,
            fromTokenAddress,
            toTokenAddress,
            debtAmount,
            10,
            collateralArray,
            fromExtraData,
            toExtraData,
        );
        await tx.wait();

        const afterFromTokenDebt = await compoundHelper.getDebtAmount(fromTokenAddress);
        const afterToTokenDebt = await compoundHelper.getDebtAmount(toTokenAddress);

        const usdcBalanceAfter = await usdcContract.balanceOf(TEST_ADDRESS);
        const collateralBalanceAfter = await collateralToken.balanceOf(TEST_ADDRESS);

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
        expect(collateralBalanceAfter).to.be.equal(collateralBalance);
        expect(afterFromTokenDebt).to.be.lessThan(beforeFromTokenDebt);
        expect(afterToTokenDebt).to.be.greaterThan(beforeToTokenDebt);
    }

    it("should return collateral amount for cbETH", async function () {
        const collateralAmount = await compoundHelper.getCollateralAmount(
            USDC_COMET_ADDRESS,
            cbETH_ADDRESS,
        );
        console.log("collateralAmount:", ethers.formatEther(collateralAmount));
    });

    describe("Collateral is cbETH", function () {
        it("should switch from USDbC to USDC", async function () {
            await compoundHelper.supply(USDbC_COMET_ADDRESS, cbETH_ADDRESS);
            await compoundHelper.borrow(USDbC_ADDRESS);

            await executeDebtSwap(USDbC_ADDRESS, USDC_ADDRESS, ETH_USDbC_POOL, cbETH_ADDRESS, true);
        });

        it("should switch from USDC to USDbC with max amount", async function () {
            await compoundHelper.supply(USDC_COMET_ADDRESS, cbETH_ADDRESS);
            await compoundHelper.borrow(USDC_ADDRESS);

            await executeDebtSwap(
                USDC_ADDRESS,
                USDbC_ADDRESS,
                USDC_hyUSD_POOL,
                cbETH_ADDRESS,
                true,
            );
        });
    });
    describe("Collateral is WETH", function () {
        it("should switch from USDC to USDbC", async function () {
            await wrapETH(DEFAULT_SUPPLY_AMOUNT, impersonatedSigner);
            await compoundHelper.supply(USDC_COMET_ADDRESS, WETH_ADDRESS);
            await compoundHelper.borrow(USDC_ADDRESS);

            await executeDebtSwap(USDC_ADDRESS, USDbC_ADDRESS, USDC_hyUSD_POOL, WETH_ADDRESS, true);
        });

        it("should switch from USDbC to USDC", async function () {
            await wrapETH(DEFAULT_SUPPLY_AMOUNT, impersonatedSigner);
            await compoundHelper.supply(USDbC_COMET_ADDRESS, WETH_ADDRESS);
            await compoundHelper.borrow(USDbC_ADDRESS);

            await executeDebtSwap(USDbC_ADDRESS, USDC_ADDRESS, ETH_USDbC_POOL, WETH_ADDRESS, true);
        });
    });
    describe("Multiple Collaterals(cbETH and WETH", function () {
        it("should switch from USDC to USDbC", async function () {
            await wrapETH(DEFAULT_SUPPLY_AMOUNT, impersonatedSigner);
            await compoundHelper.supply(USDC_COMET_ADDRESS, WETH_ADDRESS);
            await compoundHelper.supply(USDC_COMET_ADDRESS, cbETH_ADDRESS);
            await compoundHelper.borrow(USDC_ADDRESS);

            await executeDebtSwap(
                USDC_ADDRESS,
                USDbC_ADDRESS,
                USDC_hyUSD_POOL,
                WETH_ADDRESS,
                true,
                cbETH_ADDRESS,
            );

            const WETHAmountInUSDC = await compoundHelper.getCollateralAmount(
                USDC_COMET_ADDRESS,
                WETH_ADDRESS,
            );
            console.log("WETH collateralAmountInUSDC:", ethers.formatEther(WETHAmountInUSDC));
            const WETHAmountInUSDbC = await compoundHelper.getCollateralAmount(
                USDbC_COMET_ADDRESS,
                WETH_ADDRESS,
            );
            console.log("WETH collateralAmountInUSDbC:", ethers.formatEther(WETHAmountInUSDbC));

            const cbETHAmountInUSDC = await compoundHelper.getCollateralAmount(
                USDC_COMET_ADDRESS,
                cbETH_ADDRESS,
            );
            console.log("cbETH collateralAmountInUSDC:", ethers.formatEther(cbETHAmountInUSDC));
            const cbETHAmountInUSDbC = await compoundHelper.getCollateralAmount(
                USDbC_COMET_ADDRESS,
                cbETH_ADDRESS,
            );
            console.log("cbETH collateralAmountInUSDbC:", ethers.formatEther(cbETHAmountInUSDbC));
        });
    });
});
