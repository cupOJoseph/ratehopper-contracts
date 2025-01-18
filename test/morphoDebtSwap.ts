import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
// import { DebtSwap,  MorphoHandler } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { approve, deployContractFixture, formatAmount, getAmountInMax } from "./utils";
import { Contract, MaxUint256 } from "ethers";
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
} from "./constants";
import morphoAbi from "../externalAbi/morpho/morpho.json";
import { MORPHO_ADDRESS, MorphoHelper } from "./protocols/morpho";
import { DebtSwap } from "../typechain-types";

describe(" Morpho v3 DebtSwap", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;
    let deployedContractAddress: string;
    let morphoHelper: MorphoHelper;

    const fromMarketId = "0x1c21c59df9db44bf6f645d854ee710a8ca17b479451447e9f56758aee10a2fad";
    const toMarketId = "0xb5d424e4af49244b074790f1f2dc9c20df948ce291fc6bcc6b59149ecf91196d";

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);
        morphoHelper = new MorphoHelper(impersonatedSigner);

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
    ) {
        const fromMarketParams = {
            collateralToken: cbETH_ADDRESS,
            loanToken: USDC_ADDRESS,
            irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
            oracle: "0xb40d93F44411D8C09aD17d7F88195eF9b05cCD96",
            lltv: 860000000000000000n,
        };

        const toMarketParams = {
            collateralToken: cbETH_ADDRESS,
            loanToken: eUSD_ADDRESS,
            irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
            oracle: "0xc3Fa71D77d80f671F366DAA6812C8bD6C7749cEc",
            lltv: 860000000000000000n,
        };

        const beforeFromTokenDebt = await morphoHelper.getDebtAmount(fromMarketId);
        const beforeToTokenDebt = await morphoHelper.getDebtAmount(toMarketId);

        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
        const usdcBalance = await usdcContract.balanceOf(TEST_ADDRESS);

        const collateralToken = new ethers.Contract(
            collateralTokenAddress,
            ERC20_ABI,
            impersonatedSigner,
        );
        const collateralBalance = await collateralToken.balanceOf(TEST_ADDRESS);
        const collateralAmount = await morphoHelper.getCollateralAmount(fromMarketId);

        await approve(USDC_ADDRESS, deployedContractAddress, impersonatedSigner);

        const fromExtraData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256", "address", "address", "address", "address", "uint256"],
            [
                collateralAmount,
                fromMarketParams.loanToken,
                fromMarketParams.collateralToken,
                fromMarketParams.oracle,
                fromMarketParams.irm,
                fromMarketParams.lltv,
            ],
        );

        const toExtraData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256", "address", "address", "address", "address", "uint256"],
            [
                collateralAmount,
                fromMarketParams.loanToken,
                fromMarketParams.collateralToken,
                fromMarketParams.oracle,
                fromMarketParams.irm,
                fromMarketParams.lltv,
            ],
        );

        const tx = await myContract.executeDebtSwap(
            flashloanPool,
            Protocols.MORPHO,
            Protocols.MORPHO,
            fromTokenAddress,
            toTokenAddress,
            beforeFromTokenDebt,
            getAmountInMax(beforeFromTokenDebt),
            fromExtraData,
            toExtraData,
        );
        await tx.wait();

        const afterFromTokenDebt = await morphoHelper.getDebtAmount(fromMarketId);
        const afterToTokenDebt = await morphoHelper.getDebtAmount(toMarketId);

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
        expect(afterToTokenDebt).to.be.greaterThanOrEqual(beforeToTokenDebt);
    }

    describe("Collateral is cbETH", function () {
        it.only("should switch from USDC to eUSD", async function () {
            await morphoHelper.supply(cbETH_ADDRESS);

            const morphoContract = new ethers.Contract(
                MORPHO_ADDRESS,
                morphoAbi,
                impersonatedSigner,
            );
            await morphoContract.setAuthorization(deployedContractAddress, true);

            await morphoHelper.borrow();

            await executeDebtSwap(USDC_ADDRESS, eUSD_ADDRESS, USDC_hyUSD_POOL, cbETH_ADDRESS);
        });
    });

    it("supply", async function () {
        const tokenContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
        const walletBalance = await tokenContract.balanceOf(TEST_ADDRESS);
        console.log(`Wallet Balance:`, formatAmount(walletBalance));

        await morphoHelper.supply(cbETH_ADDRESS);

        const morphoContract = new ethers.Contract(MORPHO_ADDRESS, morphoAbi, impersonatedSigner);

        await morphoHelper.borrow();

        const walletBalanceAfter = await tokenContract.balanceOf(TEST_ADDRESS);
        console.log(`Wallet Balance:`, formatAmount(walletBalanceAfter));
    });

    // it.only("supplyContract", async function () {
    //     await morphoHelper.getPosition();
    //     const tokenContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
    //     await approve(cbETH_ADDRESS, deployedContractAddress, impersonatedSigner);
    //     await approve(USDC_ADDRESS, deployedContractAddress, impersonatedSigner);
    //     const walletBalance = await tokenContract.balanceOf(TEST_ADDRESS);
    //     console.log(`Wallet Balance:`, formatAmount(walletBalance));

    //     const morphoContract = new ethers.Contract(MORPHO_ADDRESS, morphoAbi, impersonatedSigner);
    //     await morphoContract.setAuthorization(deployedContractAddress, true);

    //     await myContract.supply(
    //         {
    //             collateralToken: cbETH_ADDRESS,
    //             loanToken: USDC_ADDRESS,
    //             irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
    //             oracle: "0xb40d93F44411D8C09aD17d7F88195eF9b05cCD96",
    //             lltv: 860000000000000000n,
    //         },
    //         cbETH_ADDRESS,
    //         ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
    //         TEST_ADDRESS,
    //     );

    //     const walletBalanceAfter = await tokenContract.balanceOf(TEST_ADDRESS);
    //     console.log(`Wallet Balance:`, formatAmount(walletBalanceAfter));

    //     await morphoHelper.getPosition();
    // });

    it("decode", async function () {
        morphoHelper.decode(borrow);
    });
});

const withdrawData =
    "0x1af3bbc6000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000002ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22000000000000000000000000b40d93f44411d8c09ad17d7f88195ef9b05ccd9600000000000000000000000046415998764c29ab2a25cbea6254146d50d226870000000000000000000000000000000000000000000000000bef55718ad60000000000000000000000000000000000000000000000000000000012309ce54000000000000000000000000000cc6052347377630ba1042fe618f848ee8b52db09";

const withdrawData2 =
    "0xac9650d800000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000e41af3bbc6000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000002ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22000000000000000000000000b40d93f44411d8c09ad17d7f88195ef9b05ccd9600000000000000000000000046415998764c29ab2a25cbea6254146d50d226870000000000000000000000000000000000000000000000000bef55718ad60000000000000000000000000000000000000000000000000000000009184e72a000000000000000000000000000cc6052347377630ba1042fe618f848ee8b52db0900000000000000000000000000000000000000000000000000000000678878f50000da44";

const depositAndBorrowData =
    "0xca463673000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000002ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22000000000000000000000000b40d93f44411d8c09ad17d7f88195ef9b05ccd9600000000000000000000000046415998764c29ab2a25cbea6254146d50d226870000000000000000000000000000000000000000000000000bef55718ad60000000000000000000000000000000000000000000000000000000009184e72a000000000000000000000000000cc6052347377630ba1042fe618f848ee8b52db090000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000";

const deposit =
    "0xac9650d8000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000000000000000000000000000000000000000000184af5042020000000000000000000000002ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22000000000000000000000000000000000000000000000000000009184e72a0000000000000000000000000000000000000000000000000000000ffffffffffff000000000000000000000000000000000000000000000000000000000000000100000000000000000000000023055618898e202386e6c13955a58d3c68200bfb000000000000000000000000000000000000000000000000000000006789d6e200000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000004180fc98da6f78a7c8d8fff693c4c6924c6e4d2202efd6b7e8331ae83b93f944e23e8ad271e97445867b9adc02989afbfece6285deefbf719853f05b49b484f9a21c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004454c53ef00000000000000000000000002ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22000000000000000000000000000000000000000000000000000009184e72a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000164ca463673000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000002ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22000000000000000000000000b40d93f44411d8c09ad17d7f88195ef9b05ccd9600000000000000000000000046415998764c29ab2a25cbea6254146d50d226870000000000000000000000000000000000000000000000000bef55718ad60000000000000000000000000000000000000000000000000000000009184e72a000000000000000000000000000cc6052347377630ba1042fe618f848ee8b52db09000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000678885760000da44";

const borrow =
    "0xac9650d8000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000012462577ad0000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000002ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22000000000000000000000000b40d93f44411d8c09ad17d7f88195ef9b05ccd9600000000000000000000000046415998764c29ab2a25cbea6254146d50d226870000000000000000000000000000000000000000000000000bef55718ad600000000000000000000000000000000000000000000000000000000000000009c400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000092743d098000000000000000000000000cc6052347377630ba1042fe618f848ee8b52db0900000000000000000000000000000000000000000000000000000000678888f70000da44";
