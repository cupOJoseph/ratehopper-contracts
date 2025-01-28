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
    cbBTC_ADDRESS,
    cbBTC_USDC_POOL,
} from "./constants";

import { MaxUint256 } from "ethers";
import { AaveV3Helper } from "./protocols/aaveV3";
import { CompoundHelper, USDC_COMET_ADDRESS } from "./protocols/compound";
import { MORPHO_ADDRESS, MorphoHelper, morphoMarket1Id, morphoMarket4Id } from "./protocols/morpho";

describe("Create leveraged position", function () {
    let myContract: LeveragedPosition;
    let impersonatedSigner: HardhatEthersSigner;

    let deployedContractAddress: string;
    let aaveV3Helper: AaveV3Helper;
    let compoundHelper: CompoundHelper;
    let morphoHelper: MorphoHelper;

    const slipage = 10;
    const defaultTargetSupplyAmount = "0.002";
    const sampleEthPrice = 3300;
    const sampleBtcPrice = 101000;
    const cbBTCDecimals = 8;

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

    it("should create on Aave with cbETH", async function () {
        await approve(cbETH_ADDRESS, deployedContractAddress, impersonatedSigner);
        await aaveV3Helper.approveDelegation(USDC_ADDRESS, deployedContractAddress);

        const borrowAmount = calculateBorrowAmount(
            Number(DEFAULT_SUPPLY_AMOUNT),
            Number(defaultTargetSupplyAmount),
            6,
            sampleEthPrice,
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

    it("should create on Aave with cbBTC", async function () {
        await approve(cbBTC_ADDRESS, deployedContractAddress, impersonatedSigner);
        await aaveV3Helper.approveDelegation(USDC_ADDRESS, deployedContractAddress);

        const principleAmount = 0.00006;
        const targetAmount = principleAmount * 2;

        const borrowAmount = calculateBorrowAmount(
            Number(principleAmount),
            Number(targetAmount),
            6,
            sampleBtcPrice,
        );

        console.log("borrowAmount: ", borrowAmount);

        await myContract.createLeveragedPosition(
            cbBTC_USDC_POOL,
            Protocols.AAVE_V3,
            cbBTC_ADDRESS,
            ethers.parseUnits(principleAmount.toString(), cbBTCDecimals),
            ethers.parseUnits(targetAmount.toString(), cbBTCDecimals),
            USDC_ADDRESS,
            borrowAmount,
            slipage,
            3000,
            "0x",
        );

        const debtAmount = await aaveV3Helper.getDebtAmount(USDC_ADDRESS);
        console.log("debtAmount: ", ethers.formatUnits(debtAmount, 6));

        const collateralAmount = await aaveV3Helper.getCollateralAmount(cbBTC_ADDRESS);
        console.log("collateralAmount: ", ethers.formatUnits(collateralAmount, cbBTCDecimals));
    });

    it.only("should create on Aave with cbBTC more leverage", async function () {
        await approve(cbBTC_ADDRESS, deployedContractAddress, impersonatedSigner);
        await aaveV3Helper.approveDelegation(USDC_ADDRESS, deployedContractAddress);

        const principleAmount = 0.00006;
        const targetAmount = 0.00014;

        const borrowAmount = calculateBorrowAmount(
            Number(principleAmount),
            Number(targetAmount),
            6,
            sampleBtcPrice,
        );

        console.log("borrowAmount: ", borrowAmount);

        await myContract.createLeveragedPosition(
            cbBTC_USDC_POOL,
            Protocols.AAVE_V3,
            cbBTC_ADDRESS,
            ethers.parseUnits(principleAmount.toString(), cbBTCDecimals),
            ethers.parseUnits(targetAmount.toString(), cbBTCDecimals),
            USDC_ADDRESS,
            borrowAmount,
            slipage,
            3000,
            "0x",
        );

        const debtAmount = await aaveV3Helper.getDebtAmount(USDC_ADDRESS);
        console.log("debtAmount: ", ethers.formatUnits(debtAmount, 6));

        const collateralAmount = await aaveV3Helper.getCollateralAmount(cbBTC_ADDRESS);
        console.log("collateralAmount: ", ethers.formatUnits(collateralAmount, cbBTCDecimals));
    });

    it("should create on Compoud with cbETH", async function () {
        await approve(cbETH_ADDRESS, deployedContractAddress, impersonatedSigner);
        await compoundHelper.allow(USDC_ADDRESS, deployedContractAddress);
        const extraData = compoundHelper.encodeExtraData(USDC_COMET_ADDRESS);

        const borrowAmount = calculateBorrowAmount(
            Number(DEFAULT_SUPPLY_AMOUNT),
            Number(defaultTargetSupplyAmount),
            6,
            sampleEthPrice,
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

    it("should create on Compound with cbBTC", async function () {
        await approve(cbBTC_ADDRESS, deployedContractAddress, impersonatedSigner);
        await compoundHelper.allow(USDC_ADDRESS, deployedContractAddress);
        const extraData = compoundHelper.encodeExtraData(USDC_COMET_ADDRESS);

        const principleAmount = 0.00006;
        const targetAmount = principleAmount * 2;

        const borrowAmount = calculateBorrowAmount(
            Number(principleAmount),
            Number(targetAmount),
            6,
            sampleBtcPrice,
        );

        console.log("borrowAmount: ", borrowAmount);

        await myContract.createLeveragedPosition(
            cbBTC_USDC_POOL,
            Protocols.COMPOUND,
            cbBTC_ADDRESS,
            ethers.parseUnits(principleAmount.toString(), cbBTCDecimals),
            ethers.parseUnits(targetAmount.toString(), cbBTCDecimals),
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
            cbBTC_ADDRESS,
        );
        console.log("collateralAmount: ", ethers.formatUnits(collateralAmount, cbBTCDecimals));
    });

    it("should create on Morpho with cbETH", async function () {
        await approve(cbETH_ADDRESS, deployedContractAddress, impersonatedSigner);

        const morphoContract = new ethers.Contract(MORPHO_ADDRESS, morphoAbi, impersonatedSigner);
        await morphoContract.setAuthorization(deployedContractAddress, true);

        const extraData = morphoHelper.encodeExtraData(morphoMarket1Id, BigInt(0));

        const borrowAmount = calculateBorrowAmount(
            Number(DEFAULT_SUPPLY_AMOUNT),
            Number(defaultTargetSupplyAmount),
            6,
            sampleEthPrice,
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

    it("should create on Morpho with cbBTC", async function () {
        await approve(cbBTC_ADDRESS, deployedContractAddress, impersonatedSigner);

        const morphoContract = new ethers.Contract(MORPHO_ADDRESS, morphoAbi, impersonatedSigner);
        await morphoContract.setAuthorization(deployedContractAddress, true);

        const principleAmount = 0.00006;
        const targetAmount = principleAmount * 2;

        const extraData = morphoHelper.encodeExtraData(morphoMarket4Id, BigInt(0));

        const borrowAmount = calculateBorrowAmount(
            Number(principleAmount),
            Number(targetAmount),
            6,
            sampleBtcPrice,
        );

        await myContract.createLeveragedPosition(
            cbBTC_USDC_POOL,
            Protocols.MORPHO,
            cbBTC_ADDRESS,
            ethers.parseUnits(principleAmount.toString(), cbBTCDecimals),
            ethers.parseUnits(targetAmount.toString(), cbBTCDecimals),
            USDC_ADDRESS,
            borrowAmount,
            slipage,
            3000,
            extraData,
        );

        const debtAmount = await morphoHelper.getDebtAmount(morphoMarket4Id);
        console.log("debtAmount: ", ethers.formatUnits(debtAmount, 6));

        const collateralAmount = await morphoHelper.getCollateralAmount(morphoMarket4Id);
        console.log("collateralAmount: ", ethers.formatEther(collateralAmount));
    });
});
