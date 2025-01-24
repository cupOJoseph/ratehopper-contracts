import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap, LeveragedPosition } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import morphoAbi from "../externalAbi/morpho/morpho.json";
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
    cbETH_ETH_POOL,
} from "./constants";

import { MaxUint256 } from "ethers";
import { AaveV3Helper } from "./protocols/aaveV3";
import { CompoundHelper, USDC_COMET_ADDRESS } from "./protocols/compound";
import { MORPHO_ADDRESS, MorphoHelper, morphoMarket1Id } from "./protocols/morpho";

describe.only("Create leveraged position", function () {
    let myContract: LeveragedPosition;
    let impersonatedSigner: HardhatEthersSigner;

    let deployedContractAddress: string;
    let aaveV3Helper: AaveV3Helper;
    let compoundHelper: CompoundHelper;
    let morphoHelper: MorphoHelper;

    const slipage = 10;
    const defaultTargetSupplyAmount = "0.002";

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);
        aaveV3Helper = new AaveV3Helper(impersonatedSigner);
        compoundHelper = new CompoundHelper(impersonatedSigner);
        morphoHelper = new MorphoHelper(impersonatedSigner);

        const { leveragedPosition } = await loadFixture(deployContractFixture);
        deployedContractAddress = await leveragedPosition.getAddress();

        myContract = await ethers.getContractAt(
            "LeveragedPosition",
            deployedContractAddress,
            impersonatedSigner,
        );
    });

    function calculateBorrowAmount(
        principleSupplyAmount: number,
        targetSupplyAmount: number,
        borrowTokenDecimal: number,
        supplyTokenPrice: number,
    ): bigint {
        const amountDiff = targetSupplyAmount - principleSupplyAmount;
        // add buffer of 20%. remaining amount is repaid on contract
        const amountToBorrow = amountDiff * supplyTokenPrice * 1.2;
        const roundedAmount = parseFloat(amountToBorrow.toFixed(borrowTokenDecimal));

        return ethers.parseUnits(roundedAmount.toString(), borrowTokenDecimal);
    }

    it("calculate borrow amount", async function () {
        const amount = calculateBorrowAmount(0.001, 0.002, 6, 3300);
        console.log("amount: ", amount);
    });

    it("should create on Aave", async function () {
        await approve(cbETH_ADDRESS, deployedContractAddress, impersonatedSigner);
        await aaveV3Helper.approveDelegation(USDC_ADDRESS, deployedContractAddress);

        const borrowAmount = calculateBorrowAmount(
            Number(DEFAULT_SUPPLY_AMOUNT),
            Number(defaultTargetSupplyAmount),
            6,
            3300,
        );

        await myContract.createLeveragedPosition(
            cbETH_ETH_POOL,
            Protocols.AAVE_V3,
            cbETH_ADDRESS,
            ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
            ethers.parseEther(defaultTargetSupplyAmount),
            USDC_ADDRESS,
            borrowAmount,
            slipage,
            3000,
            "0x",
        );

        const debtAmount = await aaveV3Helper.getDebtAmount(USDC_ADDRESS);
        console.log("debtAmount: ", ethers.formatUnits(debtAmount, 6));

        const collateralAmount = await aaveV3Helper.getCollateralAmount(cbETH_ADDRESS);
        console.log("collateralAmount: ", ethers.formatEther(collateralAmount));
    });

    it("should create on Compoud", async function () {
        await approve(cbETH_ADDRESS, deployedContractAddress, impersonatedSigner);
        await compoundHelper.allow(USDC_ADDRESS, deployedContractAddress);
        const extraData = compoundHelper.encodeExtraData(USDC_COMET_ADDRESS);

        const borrowAmount = calculateBorrowAmount(
            Number(DEFAULT_SUPPLY_AMOUNT),
            Number(defaultTargetSupplyAmount),
            6,
            3300,
        );

        await myContract.createLeveragedPosition(
            cbETH_ETH_POOL,
            Protocols.COMPOUND,
            cbETH_ADDRESS,
            ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
            ethers.parseEther(defaultTargetSupplyAmount),
            USDC_ADDRESS,
            borrowAmount,
            slipage,
            3000,
            extraData,
        );

        const debtAmount = await compoundHelper.getDebtAmount(USDC_ADDRESS);
        console.log("debtAmount: ", ethers.formatUnits(debtAmount, 6));

        const collateralAmount = await compoundHelper.getCollateralAmount(
            USDC_COMET_ADDRESS,
            cbETH_ADDRESS,
        );
        console.log("collateralAmount: ", ethers.formatEther(collateralAmount));
    });

    it("should create on Morpho", async function () {
        await approve(cbETH_ADDRESS, deployedContractAddress, impersonatedSigner);

        const morphoContract = new ethers.Contract(MORPHO_ADDRESS, morphoAbi, impersonatedSigner);
        await morphoContract.setAuthorization(deployedContractAddress, true);

        const extraData = morphoHelper.encodeExtraData(morphoMarket1Id, BigInt(0));

        const borrowAmount = calculateBorrowAmount(
            Number(DEFAULT_SUPPLY_AMOUNT),
            Number(defaultTargetSupplyAmount),
            6,
            3300,
        );

        await myContract.createLeveragedPosition(
            cbETH_ETH_POOL,
            Protocols.MORPHO,
            cbETH_ADDRESS,
            ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
            ethers.parseEther(defaultTargetSupplyAmount),
            USDC_ADDRESS,
            borrowAmount,
            slipage,
            3000,
            extraData,
        );

        const debtAmount = await morphoHelper.getDebtAmount(morphoMarket1Id);
        console.log("debtAmount: ", ethers.formatUnits(debtAmount, 6));

        const collateralAmount = await morphoHelper.getCollateralAmount(morphoMarket1Id);
        console.log("collateralAmount: ", ethers.formatEther(collateralAmount));
    });
});
