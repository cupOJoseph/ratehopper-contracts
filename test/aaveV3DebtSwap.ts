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

describe("Aave v3 DebtSwap", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;
    let aaveV3Pool: Contract;
    let deployedContractAddress: string;
    const USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // Circle
    const USDbC_ADDRESS = "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca"; // Coinbase
    const aaveV3PoolAddress = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
    const aaveV3ProtocolDataProvider = "0xd82a47fdebB5bf5329b09441C3DaB4b5df2153Ad";
    const uniswapV3FactoryAddress = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
    const swapRouterAddress = "0x2626664c2603336E57B271c5C0b26F421741e481";

    // should be replaced by hardhat test account
    const testAddress = "0x50fe1109188A0B666c4d78908E3E539D73F97E33";

    this.timeout(3000000);
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deploAaveV3RouterFixture() {
        // Contracts are deployed using the first signer/account by default
        // const [owner, otherAccount] = await hre.ethers.getSigners();

        const DebtSwap = await hre.ethers.getContractFactory("DebtSwap");
        const debtSwap = await DebtSwap.deploy(
            aaveV3PoolAddress,
            uniswapV3FactoryAddress,
            swapRouterAddress,
        );

        return {
            debtSwap,
        };
    }

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
        const borrowTx = await aavePool.borrow(tokenAddress, oneUnit, 2, 0, testAddress);
        await borrowTx.wait();

        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, impersonatedSigner);
        const walletBalance = await tokenContract.balanceOf(testAddress);
        console.log(`${tokenAddress} Wallet Balance:`, formatAmount(walletBalance));
    }

    async function executeDebtSwapTest({ fromTokenAddress, toTokenAddress, flashloanPool }) {
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
        expect(afterFromTokenDebt).to.be.lessThan(BigInt(1));
        expect(afterToTokenDebt).to.be.greaterThanOrEqual(BigInt(1));
    }

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(testAddress);

        const { debtSwap } = await loadFixture(deploAaveV3RouterFixture);
        deployedContractAddress = await debtSwap.getAddress();

        myContract = await ethers.getContractAt(
            "DebtSwap",
            deployedContractAddress,
            impersonatedSigner,
        );

        aaveV3Pool = new ethers.Contract(aaveV3PoolAddress, aaveV3PoolJson, impersonatedSigner);
    });

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

        await executeDebtSwapTest({
            fromTokenAddress: USDC_ADDRESS,
            toTokenAddress: USDbC_ADDRESS,
            flashloanPool: "0x8f81b80d950e5996346530b76aba2962da5c9edb", // USDC/hyUSD pool
        });
    });

    it("should execute debt swap from USDbC to USDC", async function () {
        await borrowToken(USDbC_ADDRESS);

        await executeDebtSwapTest({
            fromTokenAddress: USDbC_ADDRESS,
            toTokenAddress: USDC_ADDRESS,
            flashloanPool: "0x3B8000CD10625ABdC7370fb47eD4D4a9C6311fD5", // ETH/USDbC pool
        });
    });
});
