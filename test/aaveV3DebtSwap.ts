import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
const { expect } = require("chai");
import { ethers } from "hardhat";
import hre from "hardhat";
const aaveDebtTokenJson = require("../externalAbi/aaveV3/aaveDebtToken.json");
const aaveV3PoolJson = require("../externalAbi/aaveV3/aaveV3Pool.json");
const aaveATokenJson = require("../externalAbi/aaveV3/aaveV3AToken.json");
const aaveProtocolDataProviderAbi = require("../externalAbi/aaveV3/aaveProtocolDataProvider.json");

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { getAmountInMax } from "./utils";
import { Contract, MaxUint256 } from "ethers";
import {
    USDC_ADDRESS,
    USDbC_ADDRESS,
    UNISWAP_V3_FACTORY_ADRESS,
    UNISWAP_V3_SWAP_ROUTER_ADDRESS,
    TEST_ADDRESS,
    USDC_hyUSD_POOL,
    ETH_USDbC_POOL,
} from "./constants";

describe("Aave v3 DebtSwap", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;
    let aaveV3Pool: Contract;
    let deployedContractAddress: string;
    const aaveV3PoolAddress = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
    const aaveV3ProtocolDataProvider = "0xd82a47fdebB5bf5329b09441C3DaB4b5df2153Ad";

    this.timeout(3000000);
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployContractFixture() {
        // Contracts are deployed using the first signer/account by default
        // const [owner, otherAccount] = await hre.ethers.getSigners();

        const DebtSwap = await hre.ethers.getContractFactory("DebtSwap");
        const debtSwap = await DebtSwap.deploy(
            aaveV3PoolAddress,
            UNISWAP_V3_FACTORY_ADRESS,
            UNISWAP_V3_SWAP_ROUTER_ADDRESS,
        );

        return {
            debtSwap,
        };
    }

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);

        const { debtSwap } = await loadFixture(deployContractFixture);
        deployedContractAddress = await debtSwap.getAddress();

        myContract = await ethers.getContractAt(
            "DebtSwap",
            deployedContractAddress,
            impersonatedSigner,
        );

        aaveV3Pool = new ethers.Contract(aaveV3PoolAddress, aaveV3PoolJson, impersonatedSigner);
    });

    async function approve() {
        const token = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
        const approveTx = await token.approve(deployedContractAddress, ethers.parseUnits("1", 6));
        await approveTx.wait();
        // console.log("approveTx:", approveTx);
    }

    async function approveDelegation(tokenAddress: string) {
        const debtToken = await getDebtTokenAddress(tokenAddress);
        const aaveDebtToken = new ethers.Contract(debtToken, aaveDebtTokenJson, impersonatedSigner);
        const approveDelegationTx = await aaveDebtToken.approveDelegation(
            deployedContractAddress,
            MaxUint256,
        );
        await approveDelegationTx.wait();
        // console.log("approveDelegationTx:", approveDelegationTx);
    }

    async function getDebtTokenAddress(assetAddress: string): Promise<string> {
        const protocolDataProvider = new ethers.Contract(
            aaveV3ProtocolDataProvider,
            aaveProtocolDataProviderAbi,
            impersonatedSigner,
        );

        const response = await protocolDataProvider.getReserveTokensAddresses(assetAddress);
        return response.variableDebtTokenAddress;
    }

    async function getCurrentDebtAmount(assetAddress: string): Promise<bigint> {
        const protocolDataProvider = new ethers.Contract(
            aaveV3ProtocolDataProvider,
            aaveProtocolDataProviderAbi,
            impersonatedSigner,
        );

        const result = await protocolDataProvider.getUserReserveData(
            assetAddress,
            impersonatedSigner,
        );
        return result.currentVariableDebt;
        // return ethers.formatUnits(String(result.currentVariableDebt), 6);
    }

    function formatAmount(amount: bigint): string {
        return ethers.formatUnits(String(amount), 6);
    }

    async function borrowToken(tokenAddress: string) {
        const oneUnit = ethers.parseUnits("1", 6);

        const aavePool = new ethers.Contract(aaveV3PoolAddress, aaveV3PoolJson, impersonatedSigner);
        const borrowTx = await aavePool.borrow(tokenAddress, oneUnit, 2, 0, TEST_ADDRESS);
        await borrowTx.wait();

        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, impersonatedSigner);
        const walletBalance = await tokenContract.balanceOf(TEST_ADDRESS);
        console.log(`${tokenAddress} Wallet Balance:`, formatAmount(walletBalance));
    }

    async function executeDebtSwapTest(
        fromTokenAddress: string,
        toTokenAddress: string,
        flashloanPool: string,
    ) {
        const beforeFromTokenDebt = await getCurrentDebtAmount(fromTokenAddress);
        const beforeToTokenDebt = await getCurrentDebtAmount(toTokenAddress);

        await approve();
        await approveDelegation(toTokenAddress);

        const tx = await myContract.executeDebtSwap(
            flashloanPool,
            fromTokenAddress,
            toTokenAddress,
            beforeFromTokenDebt,
            getAmountInMax(beforeFromTokenDebt),
        );
        await tx.wait();

        const afterFromTokenDebt = await getCurrentDebtAmount(fromTokenAddress);
        const afterToTokenDebt = await getCurrentDebtAmount(toTokenAddress);

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
        expect(afterFromTokenDebt).to.be.lessThan(beforeFromTokenDebt);
        expect(afterToTokenDebt).to.be.greaterThanOrEqual(beforeToTokenDebt);
    }

    it("should return debt token address", async function () {
        const tokenAddress = await getDebtTokenAddress(USDbC_ADDRESS);
        expect(tokenAddress).to.be.equal("0x7376b2F323dC56fCd4C191B34163ac8a84702DAB");
    });

    it("should return current debt amount", async function () {
        const currentDebtAmount = await getCurrentDebtAmount(USDC_ADDRESS);
        console.log("currentDebtAmount:", currentDebtAmount);
    });

    it("should execute debt swap from USDC to USDbC", async function () {
        await borrowToken(USDC_ADDRESS);

        await executeDebtSwapTest(USDC_ADDRESS, USDbC_ADDRESS, USDC_hyUSD_POOL);
    });

    it("should execute debt swap from USDbC to USDC", async function () {
        await borrowToken(USDbC_ADDRESS);

        await executeDebtSwapTest(USDbC_ADDRESS, USDC_ADDRESS, ETH_USDbC_POOL);
    });
});
