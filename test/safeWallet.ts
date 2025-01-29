import { sepolia, base, hardhat } from "viem/chains";
import { createPublicClient, http, custom, createWalletClient } from "viem";
import { ethers } from "hardhat";
// import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();
import Safe, {
    Eip1193Provider,
    PredictedSafeProps,
    SafeAccountConfig,
    SafeDeploymentConfig,
} from "@safe-global/protocol-kit";
import { AAVE_V3_POOL_ADDRESS, TEST_ADDRESS, USDC_ADDRESS } from "../test/constants";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
const aaveV3PoolJson = require("../externalAbi/aaveV3/aaveV3Pool.json");
import { MetaTransactionData, OperationType } from "@safe-global/types-kit";

describe.only("Safe wallet", function () {
    let safeAddress;
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

        const eip1193Provider = {
            request: async ({ method, params }: { method: string; params?: unknown[] }) => {
                return ethers.provider.send(method, params || []);
            },
        };

        const protocolKit = await Safe.init({
            provider: hardhat.rpcUrls.default.http[0],
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
            // chain: sepolia,
            chain: base,
        });

        console.log("Transaction hash:", transactionHash);
    });

    it("Should ETH be sent", async function () {
        const walletClient = createWalletClient({
            chain: base,
            transport: http("http://127.0.0.1:8545"),
            account: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Replace with a funded Hardhat account
        });
        const publicClient = createPublicClient({
            chain: base,
            transport: http("http://127.0.0.1:8545"), // Hardhat node
        });

        // const hash = await walletClient.sendTransaction({
        //     // account: TEST_ADDRESS,
        //     account: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        //     to: safeAddress,
        //     value: ethers.parseEther("0.001"),
        // });

        // console.log("Transaction Hash:", hash);

        const balance = await publicClient.getBalance({
            address: safeAddress,
        });
        console.log(`Balance:`, ethers.formatEther(balance), "ETH");
    });

    it("Should send a transaction", async function () {
        const provider = new ethers.JsonRpcProvider("http://localhost:8545");
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
        const tx = await usdcContract.transfer(safeAddress, ethers.parseUnits("0.1", 6));
        await tx.wait();

        const balance = await usdcContract.balanceOf(safeAddress);
        console.log(`Balance:`, ethers.formatUnits(balance, 6), "USDC");

        const approveData = usdcContract.interface.encodeFunctionData("approve", [
            AAVE_V3_POOL_ADDRESS,
            ethers.parseUnits("1", 6), // Approving 1 USDC
        ]);

        const approveTransactionData: MetaTransactionData = {
            to: USDC_ADDRESS,
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
            USDC_ADDRESS,
            ethers.parseUnits("0.1", 6),
            safeAddress,
            0,
        ]);

        const aaveTransactionData: MetaTransactionData = {
            to: AAVE_V3_POOL_ADDRESS,
            value: "0",
            data: supplyData,
            operation: OperationType.Call,
        };

        const safeWallet = await Safe.init({
            provider: "http://localhost:8545",
            signer: process.env.PRIVATE_KEY,
            safeAddress: safeAddress,
        });

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [approveTransactionData, aaveTransactionData],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("Safe transaction hash:", safeTxHash);

        const balanceAfter = await usdcContract.balanceOf(safeAddress);
        console.log(`Balance after:`, ethers.formatUnits(balanceAfter, 6), "USDC");
    });
});
