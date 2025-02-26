import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
// import { DebtSwap,  MorphoHandler } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { approve, deployContractFixture, formatAmount, getAmountInMax, getParaswapData } from "./utils";
import { Contract, MaxUint256, ZeroAddress } from "ethers";
import {
    USDC_ADDRESS,
    USDbC_ADDRESS,
    TEST_ADDRESS,
    USDC_hyUSD_POOL,
    ETH_USDbC_POOL,
    Protocols,
    cbETH_ADDRESS,
    DEFAULT_SUPPLY_AMOUNT,
    eUSD_ADDRESS,
    MAI_ADDRESS,
    TEST_FEE_BENEFICIARY_ADDRESS,
} from "./constants";
import morphoAbi from "../externalAbi/morpho/morpho.json";
import {
    marketParamsMap,
    MORPHO_ADDRESS,
    MorphoHelper,
    morphoMarket1Id,
    morphoMarket2Id,
    morphoMarket3Id,
} from "./protocols/morpho";
import { DebtSwap } from "../typechain-types";

describe("Morpho DebtSwap", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;
    let deployedContractAddress: string;
    let morphoHelper: MorphoHelper;

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);
        morphoHelper = new MorphoHelper(impersonatedSigner);

        const { debtSwap } = await loadFixture(deployContractFixture);
        deployedContractAddress = await debtSwap.getAddress();

        myContract = await ethers.getContractAt("DebtSwap", deployedContractAddress, impersonatedSigner);
    });

    async function executeDebtSwap(
        fromTokenAddress: string,
        toTokenAddress: string,
        flashloanPool: string,
        collateralTokenAddress: string,
        fromMarketId: string,
        toMarketId: string,
    ) {
        const beforeFromTokenDebt = await morphoHelper.getDebtAmount(fromMarketId);
        const beforeToTokenDebt = await morphoHelper.getDebtAmount(toMarketId);

        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
        const usdcBalance = await usdcContract.balanceOf(TEST_ADDRESS);

        const collateralToken = new ethers.Contract(collateralTokenAddress, ERC20_ABI, impersonatedSigner);
        const collateralBalance = await collateralToken.balanceOf(TEST_ADDRESS);
        const collateralAmount = await morphoHelper.getCollateralAmount(fromMarketId);

        await approve(fromTokenAddress, deployedContractAddress, impersonatedSigner);
        await approve(toTokenAddress, deployedContractAddress, impersonatedSigner);
        await approve(collateralTokenAddress, deployedContractAddress, impersonatedSigner);

        const morphoContract = new ethers.Contract(MORPHO_ADDRESS, morphoAbi, impersonatedSigner);
        await morphoContract.setAuthorization(deployedContractAddress, true);

        const borrowShares = await morphoHelper.getBorrowShares(fromMarketId);

        const fromExtraData = await morphoHelper.encodeExtraData(fromMarketId, borrowShares);
        const toExtraData = await morphoHelper.encodeExtraData(toMarketId, borrowShares);

        let srcAmount = BigInt(0);
        let paraswapData = {
            router: ZeroAddress,
            tokenTransferProxy: ZeroAddress,
            swapData: "0x",
        };

        const srcDecimals = toMarketId === morphoMarket3Id ? 18 : 6;

        [srcAmount, paraswapData] = await getParaswapData(
            fromTokenAddress,
            toTokenAddress,
            deployedContractAddress,
            beforeFromTokenDebt,
            srcDecimals,
        );

        // add 2% slippage(must be set by user)
        const amountPlusSlippage = (BigInt(srcAmount) * 1020n) / 1000n;

        // set protocol fee
        const signers = await ethers.getSigners();
        const contractByOwner = await ethers.getContractAt("DebtSwap", deployedContractAddress, signers[0]);
        const setTx = await contractByOwner.setProtocolFee(10);
        await setTx.wait();

        const setFeeBeneficiaryTx = await contractByOwner.setFeeBeneficiary(TEST_FEE_BENEFICIARY_ADDRESS);
        await setFeeBeneficiaryTx.wait();

        const tx = await myContract.executeDebtSwap(
            flashloanPool,
            Protocols.MORPHO,
            Protocols.MORPHO,
            fromTokenAddress,
            toTokenAddress,
            MaxUint256,
            amountPlusSlippage,
            [{ asset: collateralTokenAddress, amount: collateralAmount }],
            fromExtraData,
            toExtraData,
            paraswapData,
        );
        await tx.wait();

        const afterFromTokenDebt = await morphoHelper.getDebtAmount(fromMarketId);
        const afterToTokenDebt = await morphoHelper.getDebtAmount(toMarketId);

        const usdcBalanceAfter = await usdcContract.balanceOf(TEST_ADDRESS);
        const collateralBalanceAfter = await collateralToken.balanceOf(TEST_ADDRESS);

        console.log(
            `${fromMarketId} Debt Amount:`,
            formatAmount(beforeFromTokenDebt),
            " -> ",
            formatAmount(afterFromTokenDebt),
        );
        console.log(
            `${toMarketId} Debt Amount:`,
            formatAmount(beforeToTokenDebt),
            " -> ",
            formatAmount(afterToTokenDebt),
        );

        expect(usdcBalanceAfter).to.be.gte(usdcBalance);
        expect(collateralBalanceAfter).to.be.equal(collateralBalance);
        expect(afterFromTokenDebt).to.be.lessThan(beforeFromTokenDebt);
        expect(afterToTokenDebt).to.be.greaterThanOrEqual(beforeToTokenDebt);
    }

    describe("Collateral is cbETH", function () {
        it("should switch from market 1 to market 2", async function () {
            await morphoHelper.supply(cbETH_ADDRESS, morphoMarket1Id);
            await morphoHelper.borrow(morphoMarket1Id);

            await executeDebtSwap(
                USDC_ADDRESS,
                USDC_ADDRESS,
                USDC_hyUSD_POOL,
                cbETH_ADDRESS,
                morphoMarket1Id,
                morphoMarket2Id,
            );
        });

        it("should switch from market 2 to market 1", async function () {
            await morphoHelper.supply(cbETH_ADDRESS, morphoMarket2Id);
            await morphoHelper.borrow(morphoMarket2Id);

            await executeDebtSwap(
                USDC_ADDRESS,
                USDC_ADDRESS,
                USDC_hyUSD_POOL,
                cbETH_ADDRESS,
                morphoMarket2Id,
                morphoMarket1Id,
            );
        });

        it("should switch from market 1 to market 3(MAI, 18 decimals)", async function () {
            await morphoHelper.supply(cbETH_ADDRESS, morphoMarket1Id);
            await morphoHelper.borrow(morphoMarket1Id);

            await executeDebtSwap(
                USDC_ADDRESS,
                MAI_ADDRESS,
                USDC_hyUSD_POOL,
                cbETH_ADDRESS,
                morphoMarket1Id,
                morphoMarket3Id,
            );
        });
    });
});
