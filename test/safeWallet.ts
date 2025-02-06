import { SafeModule } from "./../typechain-types/contracts/SafeModule";
import { sepolia, base, hardhat } from "viem/chains";
import { createPublicClient, http, custom, createWalletClient, maxInt128 } from "viem";
import { ethers } from "hardhat";
import { MaxInt256, ZeroAddress } from "ethers";
import dotenv from "dotenv";
dotenv.config();
import Safe, {
    Eip1193Provider,
    PredictedSafeProps,
    RequestArguments,
    SafeAccountConfig,
    SafeDeploymentConfig,
    SafeTransactionOptionalProps,
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
import { deployContractFixture, deploySafeContractFixture, formatAmount } from "./utils";
import { mcbETH, mDAI, mUSDC } from "./moonwellDebtSwap";
import { COMPTROLLER_ADDRESS, MoonwellHelper } from "./protocols/moonwell";
import { FluidHelper } from "./protocols/fluid";
const MErc20DelegatorAbi = require("../externalAbi/moonwell/MErc20Delegator.json");
const FluidVaultAbi = require("../externalAbi/fluid/fluidVaultT1.json");

export const eip1193Provider: Eip1193Provider = {
    request: async (args: RequestArguments) => {
        const { method, params } = args;
        return ethers.provider.send(method, Array.isArray(params) ? params : []);
    },
};

describe.only("Safe wallet", function () {
    const safeAddress = "0x2f9054Eb6209bb5B94399115117044E4f150B2De";
    const FLUID_VAULT_ADDRESS = "0x40d9b8417e6e1dcd358f04e3328bced061018a82";
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, ethers.provider);
    let safeWallet;
    let safeModuleContract;
    let safeModuleAddress;

    this.beforeEach(async () => {
        safeWallet = await Safe.init({
            provider: eip1193Provider,
            signer: process.env.PRIVATE_KEY,
            safeAddress: safeAddress,
        });

        const { safeModule } = await loadFixture(deploySafeContractFixture);
        safeModuleContract = safeModule;
        safeModuleAddress = await safeModuleContract.getAddress();

        await fundETH();
        await setSafeOwner();
    });

    async function fundETH() {
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, ethers.provider); // Replace with a funded Hardhat account

        const tx = await wallet.sendTransaction({
            to: safeAddress,
            value: ethers.parseEther("0.001"),
        });

        console.log("Transaction Hash:", tx.hash);

        const balance = await ethers.provider.getBalance(safeAddress);
        console.log(`Balance:`, ethers.formatEther(balance), "ETH");
    }

    async function setSafeOwner() {
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
    }

    async function supplyAndBorrowOnMoonwell() {
        const cbETHContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, signer);
        const tx = await cbETHContract.transfer(safeAddress, ethers.parseEther("0.001"));
        await tx.wait();

        const balance = await cbETHContract.balanceOf(safeAddress);
        console.log(`Balance:`, ethers.formatEther(balance), "cbETH");

        const approveTransactionData: MetaTransactionData = {
            to: cbETH_ADDRESS,
            value: "0",
            data: cbETHContract.interface.encodeFunctionData("approve", [mcbETH, ethers.parseEther("1")]),
            operation: OperationType.Call,
        };

        const cbETHmToken = new ethers.Contract(mcbETH, MErc20DelegatorAbi, signer);

        const supplyTransactionData: MetaTransactionData = {
            to: mcbETH,
            value: "0",
            data: cbETHmToken.interface.encodeFunctionData("mint", [ethers.parseEther(DEFAULT_SUPPLY_AMOUNT)]),
            operation: OperationType.Call,
        };

        const comptroller = new ethers.Contract(COMPTROLLER_ADDRESS, ComptrollerAbi, signer);

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
    }

    async function supplyAndBorrowOnFluid() {
        const cbETHContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, signer);
        const tx = await cbETHContract.transfer(safeAddress, ethers.parseEther("0.001"));
        await tx.wait();

        // const balance = await cbETHContract.balanceOf(safeAddress);
        // console.log(`Balance:`, ethers.formatEther(balance), "cbETH");

        const approveTransactionData: MetaTransactionData = {
            to: cbETH_ADDRESS,
            value: "0",
            data: cbETHContract.interface.encodeFunctionData("approve", [FLUID_VAULT_ADDRESS, ethers.parseEther("1")]),
            operation: OperationType.Call,
        };

        const fluidVault = new ethers.Contract(FLUID_VAULT_ADDRESS, FluidVaultAbi, signer);

        const supplyTransactionData: MetaTransactionData = {
            to: FLUID_VAULT_ADDRESS,
            value: "0",
            data: fluidVault.interface.encodeFunctionData("operate", [
                0,
                ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
                0,
                safeAddress,
            ]),
            operation: OperationType.Call,
        };

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [approveTransactionData, supplyTransactionData],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("Safe transaction hash:", safeTxHash);

        const fluidHelper = new FluidHelper(signer);
        const nftId = await fluidHelper.getNftId(FLUID_VAULT_ADDRESS, safeAddress);

        const borrowTransactionData: MetaTransactionData = {
            to: FLUID_VAULT_ADDRESS,
            value: "0",
            data: fluidVault.interface.encodeFunctionData("operate", [
                nftId,
                0,
                ethers.parseUnits("1", 6),
                safeAddress,
            ]),
            operation: OperationType.Call,
        };

        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

        // const transferTransactionData: MetaTransactionData = {
        //     to: USDC_ADDRESS,
        //     value: "0",
        //     data: usdcContract.interface.encodeFunctionData("transfer", [TEST_ADDRESS, ethers.parseUnits("1", 6)]),
        //     operation: OperationType.Call,
        // };

        const safeTransaction2 = await safeWallet.createTransaction({
            transactions: [borrowTransactionData],
        });

        const safeTxHash2 = await safeWallet.executeTransaction(safeTransaction2);
        console.log("Safe transaction hash:", safeTxHash2);

        // const approveTransactionData2: MetaTransactionData = {
        //     to: USDC_ADDRESS,
        //     value: "0",
        //     data: usdcContract.interface.encodeFunctionData("approve", [
        //         FLUID_VAULT_ADDRESS,
        //         ethers.parseUnits("10", 6),
        //     ]),
        //     operation: OperationType.Call,
        // };

        // const beforeFluidDebt = await fluidHelper.getDebtAmount(FLUID_VAULT_ADDRESS, safeAddress);

        // const repayTransactionData: MetaTransactionData = {
        //     to: FLUID_VAULT_ADDRESS,
        //     value: "0",
        //     // data: fluidVault.interface.encodeFunctionData("operate", [nftId, 0, -MaxInt256, safeAddress]),
        //     data: fluidVault.interface.encodeFunctionData("operate", [
        //         nftId,
        //         0,
        //         // -ethers.parseUnits("0.1", 6),
        //         -1000004,
        //         safeAddress,
        //     ]),
        //     operation: OperationType.Call,
        // };

        // const safeTransaction3 = await safeWallet.createTransaction({
        //     transactions: [approveTransactionData2, repayTransactionData],
        // });

        // const safeTxHash3 = await safeWallet.executeTransaction(safeTransaction3);
        // console.log("Safe transaction hash3:", safeTxHash3);
    }

    it("Should execute debt swap from Fluid to Moonwell", async function () {
        await supplyAndBorrowOnFluid();

        const fluidHelper = new FluidHelper(signer);
        const moonwellHelper = new MoonwellHelper(signer);

        const beforeMoonwellDebt = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);
        const beforeFluidDebt = await fluidHelper.getDebtAmount(FLUID_VAULT_ADDRESS, safeAddress);

        const moduleContract = await ethers.getContractAt("SafeModule", safeModuleAddress, signer);

        const nftId = await fluidHelper.getNftId(FLUID_VAULT_ADDRESS, safeAddress);

        await moduleContract.executeDebtSwap(
            USDC_hyUSD_POOL,
            Protocols.FLUID,
            Protocols.MOONWELL,
            USDC_ADDRESS,
            USDC_ADDRESS,
            // beforeFluidDebt,
            MaxUint256,
            100,
            [{ asset: cbETH_ADDRESS, amount: ethers.parseEther(DEFAULT_SUPPLY_AMOUNT) }],
            ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [FLUID_VAULT_ADDRESS, nftId]),
            ethers.AbiCoder.defaultAbiCoder().encode(["address", "address[]"], [mUSDC, [mcbETH]]),
            {
                gasLimit: "2000000",
            },
        );

        const afterMoonwellDebt = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);
        const afterFluidDebt = await fluidHelper.getDebtAmount(FLUID_VAULT_ADDRESS, safeAddress);

        console.log(`Fluid Debt Amount:`, formatAmount(beforeFluidDebt), " -> ", formatAmount(afterFluidDebt));
        console.log(`Moonwell Debt Amount:`, formatAmount(beforeMoonwellDebt), " -> ", formatAmount(afterMoonwellDebt));
    });

    it.only("Should execute debt swap from Moonwell to Fluid", async function () {
        await supplyAndBorrowOnMoonwell();

        const fluidHelper = new FluidHelper(signer);
        const moonwellHelper = new MoonwellHelper(signer);

        const beforeMoonwellDebt = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);
        const beforeFluidDebt = await fluidHelper.getDebtAmount(FLUID_VAULT_ADDRESS, safeAddress);

        const moduleContract = await ethers.getContractAt("SafeModule", safeModuleAddress, signer);

        await moduleContract.executeDebtSwap(
            USDC_hyUSD_POOL,
            Protocols.MOONWELL,
            Protocols.FLUID,
            USDC_ADDRESS,
            USDC_ADDRESS,
            // beforeFluidDebt,
            MaxUint256,
            100,
            [{ asset: cbETH_ADDRESS, amount: ethers.parseEther(DEFAULT_SUPPLY_AMOUNT) }],
            ethers.AbiCoder.defaultAbiCoder().encode(["address", "address[]"], [mUSDC, [mcbETH]]),
            ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [FLUID_VAULT_ADDRESS, 0]),
            {
                gasLimit: "2000000",
            },
        );

        const afterMoonwellDebt = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);
        const afterFluidDebt = await fluidHelper.getDebtAmount(FLUID_VAULT_ADDRESS, safeAddress);

        console.log(`Fluid Debt Amount:`, formatAmount(beforeFluidDebt), " -> ", formatAmount(afterFluidDebt));
        console.log(`Moonwell Debt Amount:`, formatAmount(beforeMoonwellDebt), " -> ", formatAmount(afterMoonwellDebt));
    });

    it.skip("Should execute debt swap on Aave", async function () {
        const aaveV3Helper = new AaveV3Helper(signer);

        // const debtAmount = await aaveV3Helper.getDebtAmount(mUSDC, safeAddress);
        // console.log("debt amount before:", ethers.formatUnits(debtAmount, 6));

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

    it("Should execute debt swap on Moonwell", async function () {
        await supplyAndBorrowOnMoonwell();
        const moonwellHelper = new MoonwellHelper(signer);

        const beforeFromTokenDebt = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);
        const beforeToTokenDebt = await moonwellHelper.getDebtAmount(mDAI, safeAddress);

        const moduleContract = await ethers.getContractAt("SafeModule", safeModuleAddress, signer);

        await moduleContract.executeDebtSwap(
            USDC_hyUSD_POOL,
            Protocols.MOONWELL,
            Protocols.MOONWELL,
            USDC_ADDRESS,
            DAI_ADDRESS,
            // beforeFromTokenDebt,
            MaxUint256,
            100,
            [{ asset: cbETH_ADDRESS, amount: ethers.parseEther(DEFAULT_SUPPLY_AMOUNT) }],
            ethers.AbiCoder.defaultAbiCoder().encode(["address", "address[]"], [mUSDC, [ZeroAddress]]),
            ethers.AbiCoder.defaultAbiCoder().encode(["address", "address[]"], [mDAI, [ZeroAddress]]),
            {
                gasLimit: "5000000",
            },
        );

        const afterFromTokenDebt = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);
        const afterToTokenDebt = await moonwellHelper.getDebtAmount(mDAI, safeAddress);

        console.log(`USDC Debt Amount:`, formatAmount(beforeFromTokenDebt), " -> ", formatAmount(afterFromTokenDebt));

        console.log(
            `DAI Debt Amount:`,
            ethers.formatEther(beforeToTokenDebt),
            " -> ",
            ethers.formatEther(afterToTokenDebt),
        );
    });

    it("Should execute debt swap from Moonwell to Aave", async function () {
        await supplyAndBorrowOnMoonwell();

        const moonwellHelper = new MoonwellHelper(signer);
        const aaveV3Helper = new AaveV3Helper(signer);

        const safeModuleAddress = await safeModuleContract.getAddress();
        const moduleContract = await ethers.getContractAt("SafeModule", safeModuleAddress, signer);

        const beforeMoonwellDebt = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);
        const beforeAaveDebt = await aaveV3Helper.getDebtAmount(USDC_ADDRESS, safeAddress);

        await moduleContract.executeDebtSwap(
            USDC_hyUSD_POOL,
            Protocols.MOONWELL,
            Protocols.AAVE_V3,
            USDC_ADDRESS,
            USDC_ADDRESS,
            beforeMoonwellDebt,
            100,
            [{ asset: cbETH_ADDRESS, amount: ethers.parseEther(DEFAULT_SUPPLY_AMOUNT) }],
            ethers.AbiCoder.defaultAbiCoder().encode(["address", "address[]"], [mUSDC, [mcbETH]]),
            "0x",
            {
                gasLimit: "2000000",
            },
        );

        const afterMoonwellDebt = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);
        const afterAaveDebt = await aaveV3Helper.getDebtAmount(USDC_ADDRESS, safeAddress);

        console.log(
            `Moonwell USDC Debt Amount:`,
            formatAmount(beforeMoonwellDebt),
            " -> ",
            formatAmount(afterMoonwellDebt),
        );

        console.log(`Aave USDC Debt Amount:`, formatAmount(beforeAaveDebt), " -> ", formatAmount(afterAaveDebt));
    });

    it("Should execute debt swap from Aave to Moonwell", async function () {
        const cbETHContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, signer);
        const tx = await cbETHContract.transfer(safeAddress, ethers.parseEther("0.001"));
        await tx.wait();

        const approveTransactionData: MetaTransactionData = {
            to: cbETH_ADDRESS,
            value: "0",
            data: cbETHContract.interface.encodeFunctionData("approve", [AAVE_V3_POOL_ADDRESS, ethers.parseEther("1")]),
            operation: OperationType.Call,
        };

        const aavePool = new ethers.Contract(AAVE_V3_POOL_ADDRESS, aaveV3PoolJson, signer);

        const supplyTransactionData: MetaTransactionData = {
            to: AAVE_V3_POOL_ADDRESS,
            value: "0",
            data: aavePool.interface.encodeFunctionData("supply", [
                cbETH_ADDRESS,
                ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
                safeAddress,
                0,
            ]),
            operation: OperationType.Call,
        };

        const borrowTransactionData: MetaTransactionData = {
            to: AAVE_V3_POOL_ADDRESS,
            value: "0",
            data: aavePool.interface.encodeFunctionData("borrow", [
                USDC_ADDRESS,
                ethers.parseUnits("1", 6),
                2,
                0,
                safeAddress,
            ]),
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

                borrowTransactionData,
                transferTransactionData,
            ],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("Safe transaction hash:", safeTxHash);

        const moonwellHelper = new MoonwellHelper(signer);
        const aaveV3Helper = new AaveV3Helper(signer);

        const collateral = await aaveV3Helper.getCollateralAmount(cbETH_ADDRESS, safeAddress);
        console.log("collateral:", ethers.formatUnits(collateral, 6));

        const debt = await aaveV3Helper.getDebtAmount(USDC_ADDRESS, safeAddress);
        console.log("debt:", ethers.formatUnits(debt, 6));

        const usdcBalance = await usdcContract.balanceOf(safeAddress);
        console.log("USDC Balance on Safe:", ethers.formatUnits(usdcBalance, 6));

        const userUsdcBalance = await usdcContract.balanceOf(TEST_ADDRESS);
        console.log("USDC Balance on user:", ethers.formatUnits(userUsdcBalance, 6));

        const moduleContract = await ethers.getContractAt("SafeModule", safeModuleAddress, signer);

        const beforeMoonwellDebt = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);
        const beforeAaveDebt = await aaveV3Helper.getDebtAmount(USDC_ADDRESS, safeAddress);

        await moduleContract.executeDebtSwap(
            USDC_hyUSD_POOL,
            Protocols.AAVE_V3,
            Protocols.MOONWELL,
            USDC_ADDRESS,
            USDC_ADDRESS,
            MaxUint256,
            100,
            [{ asset: cbETH_ADDRESS, amount: ethers.parseEther(DEFAULT_SUPPLY_AMOUNT) }],
            "0x",
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "tuple(address, uint256)[]"],
                [mUSDC, [[mcbETH, ethers.parseEther(DEFAULT_SUPPLY_AMOUNT)]]],
            ),
            {
                gasLimit: "2000000",
            },
        );

        const afterMoonwellDebt = await moonwellHelper.getDebtAmount(mUSDC, safeAddress);
        const afterAaveDebt = await aaveV3Helper.getDebtAmount(USDC_ADDRESS, safeAddress);

        console.log(
            `Moonwell USDC Debt Amount:`,
            formatAmount(beforeMoonwellDebt),
            " -> ",
            formatAmount(afterMoonwellDebt),
        );

        console.log(`Aave USDC Debt Amount:`, formatAmount(beforeAaveDebt), " -> ", formatAmount(afterAaveDebt));
    });

    it.skip("Should repay switched debt and withdraw collateral", async function () {
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
