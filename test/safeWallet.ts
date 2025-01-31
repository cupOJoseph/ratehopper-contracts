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
import { MetaTransactionData, OperationType } from "@safe-global/types-kit";
import { MaxUint256 } from "ethers";
import { AaveV3Helper } from "../test/protocols/aaveV3";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployContractFixture } from "./utils";

describe.only("Safe wallet", function () {
    let safeAddress;
    let signer;
    let safeWallet;

    const eip1193Provider: Eip1193Provider = {
        request: async (args: RequestArguments) => {
            const { method, params } = args;
            return ethers.provider.send(method, Array.isArray(params) ? params : []);
        },
    };

    it("Should be deployed", async function () {
        const safeAccountConfig: SafeAccountConfig = {
            owners: [TEST_ADDRESS],
            threshold: 1,
            // More optional properties
        };

        const predictedSafe: PredictedSafeProps = {
            safeAccountConfig,
            // More optional properties
        };

        const protocolKit = await Safe.init({
            provider: eip1193Provider,
            signer: process.env.PRIVATE_KEY,
            predictedSafe,
        });

        safeAddress = await protocolKit.getAddress();
        console.log("Safe address:", safeAddress);

        const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();

        const client = await protocolKit.getSafeProvider().getExternalSigner();

        const transactionHash = await client!.sendTransaction({
            to: deploymentTransaction.to,
            value: BigInt(deploymentTransaction.value),
            data: deploymentTransaction.data as `0x${string}`,
            chain: base,
        });

        console.log("Transaction hash:", transactionHash);
    });

    it("Should ETH be sent", async function () {
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, ethers.provider); // Replace with a funded Hardhat account

        const tx = await wallet.sendTransaction({
            to: safeAddress,
            value: ethers.parseEther("0.001"),
        });

        console.log("Transaction Hash:", tx.hash);

        const balance = await ethers.provider.getBalance(safeAddress);
        console.log(`Balance:`, ethers.formatEther(balance), "ETH");
    });

    it("Should enable module", async function () {
        const { safeModule, targetContract } = await loadFixture(deployContractFixture);
        const safeModuleAddress = await safeModule.getAddress();
        const targetContractAddress = await targetContract.getAddress();

        // const options: SafeTransactionOptionalProps = {
        //     safeTxGas: '123', // Optional
        //     baseGas: '123', // Optional
        //     gasPrice: '123', // Optional
        //     gasToken: '0x...', // Optional
        //     refundReceiver: '0x...', // Optional
        //     nonce: 123 // Optional
        //   }

        safeWallet = await Safe.init({
            provider: eip1193Provider,
            signer: process.env.PRIVATE_KEY,
            safeAddress: safeAddress,
        });

        const enableModuleTx = await safeWallet.createEnableModuleTx(
            safeModuleAddress,
            // options // Optional
        );
        const safeTxHash = await safeWallet.executeTransaction(enableModuleTx);
        console.log("Safe enable module transaction hash:", safeTxHash);

        console.log("Modules:", await safeWallet.getModules());

        signer = new ethers.Wallet(process.env.PRIVATE_KEY!, ethers.provider);
        const moduleContract = await ethers.getContractAt("SafeModule", safeModuleAddress, signer);

        // const iface = new ethers.Interface(["function performAction()"]);
        // const data = iface.encodeFunctionData("performAction");

        const data = targetContract.interface.encodeFunctionData("performAction");

        await moduleContract.executeTransaction(safeAddress, targetContractAddress, data);
    });

    it.skip("Should send a transaction", async function () {
        signer = new ethers.Wallet(process.env.PRIVATE_KEY!, ethers.provider);
        const cbETHContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, signer);
        const tx = await cbETHContract.transfer(safeAddress, ethers.parseEther("0.001"));
        await tx.wait();

        const balance = await cbETHContract.balanceOf(safeAddress);
        console.log(`Balance:`, ethers.formatEther(balance), "cbETH");

        const approveData = cbETHContract.interface.encodeFunctionData("approve", [
            AAVE_V3_POOL_ADDRESS,
            ethers.parseEther("1"),
        ]);

        const approveTransactionData: MetaTransactionData = {
            to: cbETH_ADDRESS,
            value: "0",
            data: approveData,
            operation: OperationType.Call,
        };

        const aaveV3PoolContract = new ethers.Contract(
            AAVE_V3_POOL_ADDRESS,
            aaveV3PoolJson,
            signer,
        );

        const supplyData = aaveV3PoolContract.interface.encodeFunctionData("supply", [
            cbETH_ADDRESS,
            ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
            safeAddress,
            0,
        ]);

        const aaveSupplyTransactionData: MetaTransactionData = {
            to: AAVE_V3_POOL_ADDRESS,
            value: "0",
            data: supplyData,
            operation: OperationType.Call,
        };

        const borrowData = aaveV3PoolContract.interface.encodeFunctionData("borrow", [
            USDC_ADDRESS,
            ethers.parseUnits("0.1", 6),
            2,
            0,
            safeAddress,
        ]);

        const aaveBorrowTransactionData: MetaTransactionData = {
            to: AAVE_V3_POOL_ADDRESS,
            value: "0",
            data: borrowData,
            operation: OperationType.Call,
        };

        safeWallet = await Safe.init({
            provider: eip1193Provider,
            signer: process.env.PRIVATE_KEY,
            safeAddress: safeAddress,
        });

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [
                approveTransactionData,
                aaveSupplyTransactionData,
                aaveBorrowTransactionData,
            ],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("Safe transaction hash:", safeTxHash);

        const balanceAfter = await cbETHContract.balanceOf(safeAddress);
        console.log(`Balance after:`, ethers.formatEther(balanceAfter), "cbETH");

        const aaveV3Helper = new AaveV3Helper(signer);
        const debt = await aaveV3Helper.getDebtAmount(USDC_ADDRESS, safeAddress);
        console.log("debt:", ethers.formatUnits(debt, 6));
    });

    it.skip("Should execute debt swap", async function () {
        const { debtSwap } = await loadFixture(deployContractFixture);
        const deployedContractAddress = await debtSwap.getAddress();

        const myContract = await ethers.getContractAt("DebtSwap", deployedContractAddress, signer);

        const aaveV3Helper = new AaveV3Helper(signer);
        const debtTokenAddress = await aaveV3Helper.getDebtTokenAddress(USDbC_ADDRESS);
        console.log("debtTokenAddress:", debtTokenAddress);
        const aaveDebtToken = new ethers.Contract(debtTokenAddress, aaveDebtTokenJson, signer);
        const approveDelegationData = aaveDebtToken.interface.encodeFunctionData(
            "approveDelegation",
            [deployedContractAddress, MaxUint256],
        );

        const aaveApproveDelegationTransactionData: MetaTransactionData = {
            to: debtTokenAddress,
            value: "0",
            data: approveDelegationData,
            operation: OperationType.Call,
        };

        const debtAmount = await aaveV3Helper.getDebtAmount(USDC_ADDRESS, safeAddress);

        const swapData = myContract.interface.encodeFunctionData("executeDebtSwap", [
            USDC_hyUSD_POOL,
            Protocols.AAVE_V3,
            Protocols.AAVE_V3,
            USDC_ADDRESS,
            USDbC_ADDRESS,
            debtAmount,
            100,
            [{ asset: cbETH_ADDRESS, amount: ethers.parseEther(DEFAULT_SUPPLY_AMOUNT) }],
            "0x",
            "0x",
        ]);

        const swapTransactionData: MetaTransactionData = {
            to: deployedContractAddress,
            value: "0",
            data: swapData,
            operation: OperationType.Call,
        };

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [aaveApproveDelegationTransactionData, swapTransactionData],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("Safe transaction hash:", safeTxHash);

        const fromDebtAmountAfter = await aaveV3Helper.getDebtAmount(USDC_ADDRESS, safeAddress);

        const toDebtAmountAfter = await aaveV3Helper.getDebtAmount(USDbC_ADDRESS, safeAddress);
        console.log("fromDebtAmountAfter:", ethers.formatUnits(fromDebtAmountAfter, 6));
        console.log("toDebtAmountAfter:", ethers.formatUnits(toDebtAmountAfter, 6));
    });
});
