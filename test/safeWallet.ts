import { SafeModule } from "./../typechain-types/contracts/SafeModule";
import { sepolia, base, hardhat } from "viem/chains";
import { createPublicClient, http, custom, createWalletClient } from "viem";
import { ethers } from "hardhat";
// import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();
import Safe, {
    Eip1193Provider,
    PredictedSafeProps,
    RequestArguments,
    SafeAccountConfig,
    SafeDeploymentConfig,
} from "@safe-global/protocol-kit";
import {
    AAVE_V3_POOL_ADDRESS,
    cbETH_ADDRESS,
    DAI_ADDRESS,
    DEFAULT_SUPPLY_AMOUNT,
    Protocols,
    TEST_ADDRESS,
    USDbC_ADDRESS,
    USDC_ADDRESS,
    USDC_hyUSD_POOL,
} from "../test/constants";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
const aaveV3PoolJson = require("../externalAbi/aaveV3/aaveV3Pool.json");
const aaveDebtTokenJson = require("../externalAbi/aaveV3/aaveDebtToken.json");
const ComptrollerAbi = require("../externalAbi/moonwell/comptroller.json");
import { MetaTransactionData, OperationType } from "@safe-global/types-kit";
import { MaxUint256 } from "ethers";
import { AaveV3Helper } from "../test/protocols/aaveV3";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployContractFixture } from "./utils";
import { mcbETH, mDAI, mUSDC } from "./moonwellDebtSwap";
import { COMPTROLLER_ADDRESS, MoonwellHelper } from "./protocols/moonwell";
const MErc20DelegatorAbi = require("../externalAbi/moonwell/MErc20Delegator.json");

describe.only("Safe wallet", function () {
    const safeAddress = "0x2f9054Eb6209bb5B94399115117044E4f150B2De";
    let signer;
    let safeWallet;
    let safeModule;

    const eip1193Provider: Eip1193Provider = {
        request: async (args: RequestArguments) => {
            const { method, params } = args;
            return ethers.provider.send(method, Array.isArray(params) ? params : []);
        },
    };

    it("Should ETH to be sent", async function () {
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, ethers.provider); // Replace with a funded Hardhat account

        const tx = await wallet.sendTransaction({
            to: safeAddress,
            value: ethers.parseEther("0.001"),
        });

        console.log("Transaction Hash:", tx.hash);

        const balance = await ethers.provider.getBalance(safeAddress);
        console.log(`Balance:`, ethers.formatEther(balance), "ETH");
    });

    it("Should supply and borrow on Moonwell on Safe", async function () {
        signer = new ethers.Wallet(process.env.PRIVATE_KEY!, ethers.provider);
        const cbETHContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, signer);
        const tx = await cbETHContract.transfer(safeAddress, ethers.parseEther("0.001"));
        await tx.wait();

        const balance = await cbETHContract.balanceOf(safeAddress);
        console.log(`Balance:`, ethers.formatEther(balance), "cbETH");

        safeWallet = await Safe.init({
            provider: eip1193Provider,
            signer: process.env.PRIVATE_KEY,
            safeAddress: safeAddress,
        });

        const approveTransactionData: MetaTransactionData = {
            to: cbETH_ADDRESS,
            value: "0",
            data: cbETHContract.interface.encodeFunctionData("approve", [mcbETH, ethers.parseEther("1")]),
            operation: OperationType.Call,
        };

        const cbETHmToken = new ethers.Contract(mcbETH, MErc20DelegatorAbi, this.signer);

        const supplyTransactionData: MetaTransactionData = {
            to: mcbETH,
            value: "0",
            data: cbETHmToken.interface.encodeFunctionData("mint", [ethers.parseEther(DEFAULT_SUPPLY_AMOUNT)]),
            operation: OperationType.Call,
        };

        const comptroller = new ethers.Contract(COMPTROLLER_ADDRESS, ComptrollerAbi, this.signer);

        const enableTransactionData: MetaTransactionData = {
            to: COMPTROLLER_ADDRESS,
            value: "0",
            data: comptroller.interface.encodeFunctionData("enterMarkets", [[mcbETH]]),
            operation: OperationType.Call,
        };

        const USDCmToken = new ethers.Contract(mUSDC, MErc20DelegatorAbi, signer);

        const borrowTransactionData: MetaTransactionData = {
            to: mUSDC,
            value: "0",
            data: USDCmToken.interface.encodeFunctionData("borrow", [ethers.parseUnits("1", 6)]),
            operation: OperationType.Call,
        };

        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

        const transferTransactionData: MetaTransactionData = {
            to: USDC_ADDRESS,
            value: "0",
            data: usdcContract.interface.encodeFunctionData("transfer", [TEST_ADDRESS, ethers.parseUnits("1", 6)]),
            operation: OperationType.Call,
        };

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [
                approveTransactionData,
                supplyTransactionData,
                enableTransactionData,
                borrowTransactionData,
                transferTransactionData,
            ],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("Safe transaction hash:", safeTxHash);

        const balanceAfter = await cbETHContract.balanceOf(safeAddress);
        console.log(`Balance after:`, ethers.formatEther(balanceAfter), "cbETH");

        const moonwellHelper = new MoonwellHelper(signer);

        const collateral = await moonwellHelper.getCollateralAmount(mcbETH, safeAddress);
        console.log("collateral:", ethers.formatUnits(collateral, 6));

        const debt = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);
        console.log("debt:", ethers.formatUnits(debt, 6));

        const usdcBalance = await usdcContract.balanceOf(safeAddress);
        console.log("USDC Balance on Safe:", ethers.formatUnits(usdcBalance, 6));

        const userUsdcBalance = await usdcContract.balanceOf(TEST_ADDRESS);
        console.log("USDC Balance on user:", ethers.formatUnits(userUsdcBalance, 6));
    });

    it("Should enable module and set safe owner", async function () {
        const { safeModule } = await loadFixture(deployContractFixture);
        this.safeModule = safeModule;
        const safeModuleAddress = await safeModule.getAddress();

        const enableModuleTx = await safeWallet.createEnableModuleTx(
            safeModuleAddress,
            // options // Optional
        );
        const safeTxHash = await safeWallet.executeTransaction(enableModuleTx);
        console.log("Safe enable module transaction hash:", safeTxHash);

        console.log("Modules:", await safeWallet.getModules());

        const moduleContract = await ethers.getContractAt("SafeModule", safeModuleAddress, signer);

        const setSafeTransactionData: MetaTransactionData = {
            to: safeModuleAddress,
            value: "0",
            data: moduleContract.interface.encodeFunctionData("setSafe", []),
            operation: OperationType.Call,
        };
        const safeTransaction = await safeWallet.createTransaction({
            transactions: [setSafeTransactionData],
        });
        const setSafeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("Safe setSafe transaction hash:", setSafeTxHash);
    });

    it.skip("Should execute debt swap", async function () {
        const aaveV3Helper = new AaveV3Helper(signer);

        // const debtAmount = await aaveV3Helper.getDebtAmount(mUSDC, safeAddress);
        // console.log("debt amount before:", ethers.formatUnits(debtAmount, 6));

        const safeModuleAddress = await this.safeModule.getAddress();
        const moduleContract = await ethers.getContractAt("SafeModule", safeModuleAddress, signer);

        await moduleContract.executeDebtSwap(
            USDC_hyUSD_POOL,
            Protocols.AAVE_V3,
            Protocols.AAVE_V3,
            USDC_ADDRESS,
            DAI_ADDRESS,
            100000,
            100,
            [{ asset: cbETH_ADDRESS, amount: ethers.parseEther(DEFAULT_SUPPLY_AMOUNT) }],
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [mUSDC]),
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [mDAI]),
        );

        const debtAmountAfter = await aaveV3Helper.getDebtAmount(mUSDC, safeAddress);

        console.log("debtAmountAfter:", debtAmountAfter);

        const DAIdebtAmount = await aaveV3Helper.getDebtAmount(mDAI, safeAddress);
        console.log("DAI debt amount:", ethers.formatEther(DAIdebtAmount));
    });

    it("Should execute debt swap", async function () {
        const moonwellHelper = new MoonwellHelper(signer);

        const debtAmount = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);
        console.log("debt amount before:", ethers.formatUnits(debtAmount, 6));

        const safeModuleAddress = await this.safeModule.getAddress();
        const moduleContract = await ethers.getContractAt("SafeModule", safeModuleAddress, signer);

        await moduleContract.executeDebtSwap(
            USDC_hyUSD_POOL,
            Protocols.MOONWELL,
            Protocols.MOONWELL,
            USDC_ADDRESS,
            DAI_ADDRESS,
            debtAmount,
            100,
            [{ asset: cbETH_ADDRESS, amount: ethers.parseEther(DEFAULT_SUPPLY_AMOUNT) }],
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [mUSDC]),
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [mDAI]),
        );

        const debtAmountAfter = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);

        console.log("debtAmountAfter:", debtAmountAfter);

        const DAIdebtAmount = await moonwellHelper.getDebtAmount(mDAI, safeAddress);
        console.log("DAI debt amount:", ethers.formatEther(DAIdebtAmount));
    });

    it.skip("Should execute debt swap from Moonwell", async function () {
        const moonwellHelper = new MoonwellHelper(signer);

        const debtAmount = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);
        console.log("debt amount before:", ethers.formatUnits(debtAmount, 6));

        const safeModuleAddress = await this.safeModule.getAddress();
        const moduleContract = await ethers.getContractAt("SafeModule", safeModuleAddress, signer);

        await moduleContract.executeDebtSwap(
            USDC_hyUSD_POOL,
            Protocols.MOONWELL,
            Protocols.AAVE_V3,
            USDC_ADDRESS,
            USDC_ADDRESS,
            debtAmount,
            100,
            [{ asset: mcbETH, amount: ethers.parseEther(DEFAULT_SUPPLY_AMOUNT) }],
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [mUSDC]),
            ethers.AbiCoder.defaultAbiCoder().encode(["address"], [mUSDC]),
        );

        const debtAmountAfter = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);

        console.log("debtAmountAfter:", debtAmountAfter);

        const DAIdebtAmount = await moonwellHelper.getDebtAmount(mDAI, safeAddress);
        console.log("DAI debt amount:", ethers.formatEther(DAIdebtAmount));
    });

    it("Should repay switched debt and withdraw collateral", async function () {
        const daiContract = new ethers.Contract(DAI_ADDRESS, ERC20_ABI, signer);
        const daiBalance = await daiContract.balanceOf(TEST_ADDRESS);

        console.log("DAI balance:", ethers.formatEther(daiBalance));

        const moonwellHelper = new MoonwellHelper(signer);
        const DAIdebtAmount = await moonwellHelper.getDebtAmount(mDAI, safeAddress);
        console.log("DAI debt amount:", ethers.formatEther(DAIdebtAmount));

        const DAImToken = new ethers.Contract(mDAI, MErc20DelegatorAbi, signer);

        await daiContract.transfer(safeAddress, DAIdebtAmount);

        const approveTransactionData: MetaTransactionData = {
            to: DAI_ADDRESS,
            value: "0",
            data: daiContract.interface.encodeFunctionData("approve", [mDAI, MaxUint256]),
            operation: OperationType.Call,
        };

        const repayTransactionData: MetaTransactionData = {
            to: mDAI,
            value: "0",
            data: DAImToken.interface.encodeFunctionData("repayBorrow", [DAIdebtAmount]),
            operation: OperationType.Call,
        };

        const cbETHmToken = new ethers.Contract(mcbETH, MErc20DelegatorAbi, signer);

        const withdrawTransactionData: MetaTransactionData = {
            to: mcbETH,
            value: "0",
            data: cbETHmToken.interface.encodeFunctionData("redeemUnderlying", [
                ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
            ]),
            operation: OperationType.Call,
        };

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [approveTransactionData, repayTransactionData, withdrawTransactionData],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("Safe transaction hash:", safeTxHash);

        const DAIdebtAmountAfter = await moonwellHelper.getDebtAmount(mDAI, safeAddress);
        console.log("DAI debt amount after:", ethers.formatEther(DAIdebtAmountAfter));

        const cbETHCollateralAfter = await moonwellHelper.getCollateralAmount(mcbETH, safeAddress);
        console.log("cbETH Collateral after:", ethers.formatEther(cbETHCollateralAfter));
    });
});
