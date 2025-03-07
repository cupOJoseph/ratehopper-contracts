import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { LeveragedPosition } from "../typechain-types";
import morphoAbi from "../externalAbi/morpho/morpho.json";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { approve, getDecimals, getParaswapData, protocolHelperMap } from "./utils";

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
    USDC_hyUSD_POOL,
} from "./constants";

import { MaxUint256 } from "ethers";
import { AaveV3Helper } from "./protocols/aaveV3";
import { cometAddressMap, CompoundHelper } from "./protocols/compound";
import {
    MORPHO_ADDRESS,
    MorphoHelper,
    morphoMarket1Id,
    morphoMarket4Id,
    morphoMarket5Id,
    morphoMarket6Id,
} from "./protocols/morpho";
import { deployLeveragedPositionContractFixture } from "./deployUtils";
import { mcbETH, mContractAddressMap } from "./protocols/moonwell";

describe("Create leveraged position", function () {
    let myContract: LeveragedPosition;
    let impersonatedSigner: HardhatEthersSigner;

    let deployedContractAddress: string;
    let aaveV3Helper: AaveV3Helper;
    let compoundHelper: CompoundHelper;
    let morphoHelper: MorphoHelper;

    const defaultTargetSupplyAmount = "0.002";
    const cbBTCPrincipleAmount = 0.00006;

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);
        aaveV3Helper = new AaveV3Helper(impersonatedSigner);
        compoundHelper = new CompoundHelper(impersonatedSigner);
        morphoHelper = new MorphoHelper(impersonatedSigner);

        const leveragedPosition = await loadFixture(deployLeveragedPositionContractFixture);
        deployedContractAddress = await leveragedPosition.getAddress();

        myContract = await ethers.getContractAt("LeveragedPosition", deployedContractAddress, impersonatedSigner);
    });

    async function createLeveragedPosition(
        flashloanPool: string,
        protocol: Protocols,
        collateralAddress = cbETH_ADDRESS,
        debtTokenAddress = USDC_ADDRESS,
        principleAmount = Number(DEFAULT_SUPPLY_AMOUNT),
        targetAmount = Number(defaultTargetSupplyAmount),
        morphoMarketId?: string,
    ) {
        const Helper = protocolHelperMap.get(protocol)!;
        const protocolHelper = new Helper(impersonatedSigner);

        await approve(collateralAddress, deployedContractAddress, impersonatedSigner);

        const debtAsset = debtTokenAddress || USDC_ADDRESS;

        const collateralDecimals = await getDecimals(collateralAddress);
        const debtDecimals = await getDecimals(debtAsset);

        switch (protocol) {
            case Protocols.AAVE_V3:
                await aaveV3Helper.approveDelegation(debtAsset, deployedContractAddress);
                break;
            case Protocols.COMPOUND:
                await compoundHelper.allow(debtAsset, deployedContractAddress);
                break;
            case Protocols.MORPHO:
                const morphoContract = new ethers.Contract(MORPHO_ADDRESS, morphoAbi, impersonatedSigner);
                await morphoContract.setAuthorization(deployedContractAddress, true);
                break;
        }

        let extraData = "0x";

        switch (protocol) {
            case Protocols.COMPOUND:
                extraData = compoundHelper.encodeExtraData(cometAddressMap.get(debtAsset)!);
                break;
            case Protocols.MORPHO:
                extraData = morphoHelper.encodeExtraData(morphoMarketId!, BigInt(0));
                break;
        }

        const parsedTargetAmount = ethers.parseUnits(targetAmount.toString(), collateralDecimals);

        const diffAmount = parsedTargetAmount - ethers.parseUnits(principleAmount.toString(), collateralDecimals);

        const [srcAmount, paraswapData] = await getParaswapData(
            collateralAddress,
            debtAsset,
            deployedContractAddress,
            diffAmount,
        );

        // add 2% slippage(must be set by user)
        const amountPlusSlippage = (BigInt(srcAmount) * 1200n) / 1000n;

        await myContract.createLeveragedPosition(
            flashloanPool,
            protocol,
            collateralAddress,
            ethers.parseUnits(principleAmount.toString(), collateralDecimals),
            parsedTargetAmount,
            debtAsset,
            amountPlusSlippage,
            extraData,
            paraswapData,
        );

        const debtAmountParameter = protocol === Protocols.MORPHO ? morphoMarketId! : debtAsset;
        const debtAmount = await protocolHelper.getDebtAmount(debtAmountParameter);
        console.log("debtAmount: ", ethers.formatUnits(debtAmount, debtDecimals));

        let collateralAmount: bigint;
        switch (protocol) {
            case Protocols.AAVE_V3:
                collateralAmount = await aaveV3Helper.getCollateralAmount(collateralAddress);
                break;
            case Protocols.COMPOUND:
                collateralAmount = await compoundHelper.getCollateralAmount(
                    cometAddressMap.get(debtAsset)!,
                    collateralAddress,
                );
                break;
            case Protocols.MORPHO:
                collateralAmount = await morphoHelper.getCollateralAmount(morphoMarketId!);
                break;
            default:
                throw new Error("Unsupported protocol");
        }
        console.log("collateralAmount: ", ethers.formatUnits(collateralAmount, collateralDecimals));

        expect(debtAmount).to.be.gt(0);
        expect(Number(collateralAmount)).to.be.equal(parsedTargetAmount);

        const collateralToken = new ethers.Contract(collateralAddress, ERC20_ABI, impersonatedSigner);
        const collateralRemainingBalance = await collateralToken.balanceOf(deployedContractAddress);
        expect(Number(collateralRemainingBalance)).to.be.equal(0);

        const debtToken = new ethers.Contract(debtAsset, ERC20_ABI, impersonatedSigner);
        const debtRemainingBalance = await debtToken.balanceOf(deployedContractAddress);
        expect(Number(debtRemainingBalance)).to.be.equal(0);
    }

    describe("on Aave", function () {
        it("with cbETH collateral", async function () {
            await createLeveragedPosition(cbETH_ETH_POOL, Protocols.AAVE_V3);
        });

        it("with cbETH collateral and USDbC debt", async function () {
            await createLeveragedPosition(cbETH_ETH_POOL, Protocols.AAVE_V3, cbETH_ADDRESS, USDbC_ADDRESS);
        });

        it("with cbBTC collateral", async function () {
            const targetAmount = cbBTCPrincipleAmount * 2;

            await createLeveragedPosition(
                cbBTC_USDC_POOL,
                Protocols.AAVE_V3,
                cbBTC_ADDRESS,
                USDC_ADDRESS,
                cbBTCPrincipleAmount,
                targetAmount,
            );
        });

        it("with cbBTC collateral more leverage", async function () {
            const targetAmount = 0.00015;

            await createLeveragedPosition(
                cbBTC_USDC_POOL,
                Protocols.AAVE_V3,
                cbBTC_ADDRESS,
                USDC_ADDRESS,
                cbBTCPrincipleAmount,
                targetAmount,
            );
        });
    });

    describe("on Compoud", function () {
        it("with cbETH collateral", async function () {
            await createLeveragedPosition(cbETH_ETH_POOL, Protocols.COMPOUND);
        });

        it("with cbETH collateral and USDbC debt", async function () {
            await createLeveragedPosition(cbETH_ETH_POOL, Protocols.COMPOUND, cbETH_ADDRESS, USDbC_ADDRESS);
        });

        it("with cbBTC collateral", async function () {
            const targetAmount = cbBTCPrincipleAmount * 2;
            await createLeveragedPosition(
                cbBTC_USDC_POOL,
                Protocols.COMPOUND,
                cbBTC_ADDRESS,
                USDC_ADDRESS,
                cbBTCPrincipleAmount,
                targetAmount,
            );
        });
    });

    describe("on Morpho", function () {
        it("with cbETH collateral", async function () {
            await createLeveragedPosition(
                cbETH_ETH_POOL,
                Protocols.MORPHO,
                undefined,
                undefined,
                undefined,
                undefined,
                morphoMarket1Id,
            );
        });

        it("with cbBTC collateral", async function () {
            const targetAmount = cbBTCPrincipleAmount * 2;
            await createLeveragedPosition(
                cbBTC_USDC_POOL,
                Protocols.MORPHO,
                cbBTC_ADDRESS,
                USDC_ADDRESS,
                cbBTCPrincipleAmount,
                targetAmount,
                morphoMarket4Id,
            );
        });

        it("with USDC collateral and WETH debt", async function () {
            await createLeveragedPosition(
                USDC_hyUSD_POOL,
                Protocols.MORPHO,
                USDC_ADDRESS,
                WETH_ADDRESS,
                1,
                2,
                morphoMarket6Id,
            );
        });
    });
});
