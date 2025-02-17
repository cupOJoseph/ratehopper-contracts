import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { LeveragedPosition } from "../typechain-types";
import morphoAbi from "../externalAbi/morpho/morpho.json";
import { approve, deployContractFixture, formatAmount, getParaswapData, protocolHelperMap } from "./utils";

import {
    USDC_ADDRESS,
    USDbC_ADDRESS,
    cbETH_ADDRESS,
    TEST_ADDRESS,
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

describe.skip("Create leveraged position", function () {
    let myContract: LeveragedPosition;
    let impersonatedSigner: HardhatEthersSigner;

    let deployedContractAddress: string;
    let aaveV3Helper: AaveV3Helper;
    let compoundHelper: CompoundHelper;
    let morphoHelper: MorphoHelper;

    const slipage = 10;
    const defaultTargetSupplyAmount = "0.002";
    const sampleEthPrice = 3300;
    const sampleBtcPrice = 103000;
    const USDCDecimals = 6;
    const cbBTCDecimals = 8;

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);
        aaveV3Helper = new AaveV3Helper(impersonatedSigner);
        compoundHelper = new CompoundHelper(impersonatedSigner);
        morphoHelper = new MorphoHelper(impersonatedSigner);

        const { leveragedPosition } = await loadFixture(deployContractFixture);
        deployedContractAddress = await leveragedPosition.getAddress();

        myContract = await ethers.getContractAt("LeveragedPosition", deployedContractAddress, impersonatedSigner);
    });

    function calculateBorrowAmount(
        principleSupplyAmount: number,
        targetSupplyAmount: number,
        borrowTokenDecimal: number,
        supplyTokenPrice: number,
    ): bigint {
        const amountDiff = targetSupplyAmount - principleSupplyAmount;
        // add buffer of 10%. remaining amount is repaid on contract
        const amountToBorrow = amountDiff * supplyTokenPrice * 1.1;
        const roundedAmount = parseFloat(amountToBorrow.toFixed(borrowTokenDecimal));

        const borrowAmount = ethers.parseUnits(roundedAmount.toString(), borrowTokenDecimal);

        console.log("borrowAmount: ", formatAmount(borrowAmount));

        return borrowAmount;
    }

    async function createLeveragedPosition(
        flashloanPool: string,
        protocol: Protocols,
        collateralAddress: string,
        principleAmount: number,
        targetAmount: number,
        collateralDecimals: number,
        price: number,
        marketId?: string,
    ) {
        const Helper = protocolHelperMap.get(protocol)!;
        const protocolHelper = new Helper(impersonatedSigner);

        await approve(collateralAddress, deployedContractAddress, impersonatedSigner);

        switch (protocol) {
            case Protocols.AAVE_V3:
                await aaveV3Helper.approveDelegation(USDC_ADDRESS, deployedContractAddress);
                break;
            case Protocols.COMPOUND:
                await compoundHelper.allow(USDC_ADDRESS, deployedContractAddress);
                break;
            case Protocols.MORPHO:
                const morphoContract = new ethers.Contract(MORPHO_ADDRESS, morphoAbi, impersonatedSigner);
                await morphoContract.setAuthorization(deployedContractAddress, true);
                break;
        }

        let extraData = "0x";

        switch (protocol) {
            case Protocols.COMPOUND:
                extraData = compoundHelper.encodeExtraData(USDC_COMET_ADDRESS);
                break;
            case Protocols.MORPHO:
                extraData = morphoHelper.encodeExtraData(marketId!, BigInt(0));
                break;
        }

        const parsedTargetAmount = ethers.parseUnits(targetAmount.toString(), collateralDecimals);

        const diffAmount = parsedTargetAmount - BigInt(principleAmount);

        const borrowAmount = calculateBorrowAmount(principleAmount, targetAmount, USDCDecimals, price);

        const [srcAmount, paraswapData] = await getParaswapData(
            collateralAddress,
            USDC_ADDRESS,
            deployedContractAddress,
            diffAmount,
            USDCDecimals,
            collateralDecimals,
        );

        // add 0.3% slippage(must be set by user)
        const amountPlusSlippage = (BigInt(srcAmount) * 1003n) / 1000n;

        await myContract.createLeveragedPosition(
            flashloanPool,
            protocol,
            collateralAddress,
            ethers.parseUnits(principleAmount.toString(), collateralDecimals),
            parsedTargetAmount,
            USDC_ADDRESS,
            borrowAmount,
            amountPlusSlippage,
            extraData,
            paraswapData,
        );

        const debtAmountParameter = protocol === Protocols.MORPHO ? marketId! : USDC_ADDRESS;
        const debtAmount = await protocolHelper.getDebtAmount(debtAmountParameter);
        console.log("debtAmount: ", ethers.formatUnits(debtAmount, 6));

        // const collateralAmount = await aaveV3Helper.getCollateralAmount(collateralAddress);
        let collateralAmount: bigint;
        switch (protocol) {
            case Protocols.AAVE_V3:
                collateralAmount = await aaveV3Helper.getCollateralAmount(collateralAddress);
                break;
            case Protocols.COMPOUND:
                collateralAmount = await compoundHelper.getCollateralAmount(USDC_COMET_ADDRESS, collateralAddress);
                break;
            case Protocols.MORPHO:
                collateralAmount = await morphoHelper.getCollateralAmount(marketId!);
                break;
            default:
                throw new Error("Unsupported protocol");
        }
        console.log("collateralAmount: ", ethers.formatUnits(collateralAmount, collateralDecimals));

        expect(debtAmount).to.be.gt(0);
        expect(Number(collateralAmount)).to.be.equal(parsedTargetAmount);
    }

    it("calculate borrow amount", async function () {
        const amount = calculateBorrowAmount(0.001, 0.002, 6, 3300);
        console.log("amount: ", amount);
    });

    it("should create on Aave with cbETH", async function () {
        await createLeveragedPosition(
            cbETH_ETH_POOL,
            Protocols.AAVE_V3,
            cbETH_ADDRESS,
            Number(DEFAULT_SUPPLY_AMOUNT),
            Number(defaultTargetSupplyAmount),
            18,
            sampleEthPrice,
        );
    });

    it("should create on Aave with cbBTC", async function () {
        const principleAmount = 0.00006;
        const targetAmount = principleAmount * 2;

        await createLeveragedPosition(
            cbBTC_USDC_POOL,
            Protocols.AAVE_V3,
            cbBTC_ADDRESS,
            principleAmount,
            targetAmount,
            cbBTCDecimals,
            sampleBtcPrice,
        );
    });

    it("should create on Aave with cbBTC more leverage", async function () {
        const principleAmount = 0.00006;
        const targetAmount = 0.00015;

        await createLeveragedPosition(
            cbBTC_USDC_POOL,
            Protocols.AAVE_V3,
            cbBTC_ADDRESS,
            principleAmount,
            targetAmount,
            cbBTCDecimals,
            sampleBtcPrice,
        );
    });

    it("should create on Compoud with cbETH", async function () {
        await createLeveragedPosition(
            cbETH_ETH_POOL,
            Protocols.COMPOUND,
            cbETH_ADDRESS,
            Number(DEFAULT_SUPPLY_AMOUNT),
            Number(defaultTargetSupplyAmount),
            18,
            sampleEthPrice,
        );
    });

    it("should create on Compound with cbBTC", async function () {
        const principleAmount = 0.00006;
        const targetAmount = principleAmount * 2;
        await createLeveragedPosition(
            cbBTC_USDC_POOL,
            Protocols.COMPOUND,
            cbBTC_ADDRESS,
            principleAmount,
            targetAmount,
            cbBTCDecimals,
            sampleBtcPrice,
        );
    });

    it("should create on Morpho with cbETH", async function () {
        await createLeveragedPosition(
            cbETH_ETH_POOL,
            Protocols.MORPHO,
            cbETH_ADDRESS,
            Number(DEFAULT_SUPPLY_AMOUNT),
            Number(defaultTargetSupplyAmount),
            18,
            sampleEthPrice,
            morphoMarket1Id,
        );
    });

    it("should create on Morpho with cbBTC", async function () {
        const principleAmount = 0.00006;
        const targetAmount = principleAmount * 2;
        await createLeveragedPosition(
            cbBTC_USDC_POOL,
            Protocols.MORPHO,
            cbBTC_ADDRESS,
            principleAmount,
            targetAmount,
            cbBTCDecimals,
            sampleBtcPrice,
            morphoMarket4Id,
        );
    });
});
