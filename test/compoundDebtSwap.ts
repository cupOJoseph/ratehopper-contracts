import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";
import hre from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { getAmountInMax } from "./utils";
import { Contract, MaxUint256 } from "ethers";

describe("Compound DebtSwap", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;
    let deployedContractAddress: string;
    const USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // Circle
    const mUSDC_ADDRESS = "0xedc817a28e8b93b03976fbd4a3ddbc9f7d176c22";

    const aaveV3PoolAddress = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
    const uniswapV3FactoryAddress = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
    const swapRouterAddress = "0x2626664c2603336E57B271c5C0b26F421741e481";

    // should be replaced by hardhat test account
    const testAddress = "0x50fe1109188A0B666c4d78908E3E539D73F97E33";

    this.timeout(3000000);

    async function deploAaveV3RouterFixture() {
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

    async function getDebtTokenAddress(assetAddress: string): Promise<string> {}

    async function getCurrentDebtAmount(assetAddress: string): Promise<bigint> {
        const mToken = new ethers.Contract(assetAddress, MErc20DelegatorAbi, impersonatedSigner);

        const debtAmount = await mToken.borrowBalanceStored(testAddress);
        console.log(debtAmount);
        return debtAmount;
    }

    function formatAmount(amount: bigint): string {
        return ethers.formatUnits(String(amount), 6);
    }

    async function borrowToken(tokenAddress: string) {}

    async function executeDebtSwapTest({ fromTokenAddress, toTokenAddress, flashloanPool }) {
        const beforeFromTokenDebt = await getCurrentDebtAmount(fromTokenAddress);
        const beforeToTokenDebt = await getCurrentDebtAmount(toTokenAddress);

        await approve();

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
    });

    it("should return current debt amount", async function () {
        await borrowToken(mUSDC_ADDRESS);
        // await getCurrentDebtAmount(mUSDC_ADDRESS);
        // await myContract.CompoundBorrow(mUSDC_ADDRESS, ethers.parseUnits("1", 6));
        // await getCurrentDebtAmount(mUSDC_ADDRESS);
    });
});
