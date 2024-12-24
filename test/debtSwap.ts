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
import { MaxUint256 } from "ethers";

describe("Aave v3 DebtSwap", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;
    let deployedContractAddress: string;
    const USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // Circle
    const USDbC_ADDRESS = "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca"; // Coinbase
    const aaveV3PoolAddress = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
    const aaveV3ProtocolDataProvider = "0xd82a47fdebB5bf5329b09441C3DaB4b5df2153Ad";
    const swapRouterAddress = "0x2626664c2603336E57B271c5C0b26F421741e481";

    // should be replaced by hardhat test account
    const testAddress = "0x50fe1109188A0B666c4d78908E3E539D73F97E33";

    const inputAmount = ethers.parseUnits("1", 6);

    this.timeout(3000000);
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deploAaveV3RouterFixture() {
        // Contracts are deployed using the first signer/account by default
        // const [owner, otherAccount] = await hre.ethers.getSigners();

        const DebtSwap = await hre.ethers.getContractFactory("DebtSwap");
        const debtSwap = await DebtSwap.deploy(aaveV3PoolAddress, swapRouterAddress);

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

    async function getCurrentDebtAmount(assetAddress: string): Promise<string> {
        const protocolDataProvider = new ethers.Contract(
            aaveV3ProtocolDataProvider,
            aaveProtocolDataProviderAbi,
            impersonatedSigner,
        );

        const result = await protocolDataProvider.getUserReserveData(
            assetAddress,
            impersonatedSigner,
        );
        return ethers.formatUnits(String(result.currentVariableDebt), 6);
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

    it("should return debt token address", async function () {
        const tokenAddress = await getDebtTokenAddress(USDbC_ADDRESS);
        expect(tokenAddress).to.be.equal("0x7376b2F323dC56fCd4C191B34163ac8a84702DAB");
    });

    it("should return current debt amount", async function () {
        const currentDebtAmount = await getCurrentDebtAmount(USDC_ADDRESS);
        console.log("currentDebtAmount:", currentDebtAmount);
    });

    it.only("should execute debt swap from USDC to USDbC", async function () {
        const beforeUSDbCDebtAmount = await getCurrentDebtAmount(USDbC_ADDRESS);
        const beforeUSDCDebtAmount = await getCurrentDebtAmount(USDC_ADDRESS);

        await approve();
        await approveDelegation(USDbC_ADDRESS);

        const tx = await myContract.executeDebtSwap(
            "0x8f81b80d950e5996346530b76aba2962da5c9edb", // USDC/hyUSD pool
            USDC_ADDRESS,
            USDbC_ADDRESS,
            inputAmount,
            true,
            getAmountInMax(inputAmount),
        );
        await tx.wait();

        const afterUSDbCDebtAmount = await getCurrentDebtAmount(USDbC_ADDRESS);
        const afterUSDCDebtAmount = await getCurrentDebtAmount(USDC_ADDRESS);

        console.log("USDC DebtAmount:", beforeUSDCDebtAmount, " -> ", afterUSDCDebtAmount);
        console.log("USDbC DebtAmount:", beforeUSDbCDebtAmount, " -> ", afterUSDbCDebtAmount);
    });

    // it("should aave v3 supply", async function () {
    //     const token = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);

    //     const balance = await token.balanceOf(testAddress);
    //     console.log("before balance:", balance);

    //     await approve();

    //     const tx = await myContract.aaveV3Supply(USDC_ADDRESS, "1000");
    //     console.log("tx:", tx);
    //     const result = await tx.wait();
    //     console.log("result:", result);

    //     const afterbalance = await token.balanceOf(testAddress);
    //     console.log("after balance:", afterbalance);
    // });

    // it("should aave v3 withdraw", async function () {
    //     const aToken = new ethers.Contract(
    //         "0x625e7708f30ca75bfd92586e17077590c60eb4cd", // aPOLUSDC
    //         aaveATokenJson,
    //         impersonatedSigner,
    //     );

    //     const tx = await aToken.transfer(deployedContractAddress, "100");
    //     // const tx = await aToken.approve(deployedContractAddress, "1000");
    //     await tx.wait();

    //     const result = await myContract.aaveV3Withdraw(USDC_ADDRESS, "100");

    //     console.log("result:", result);
    // });

    // it("should aave v3 borrow", async function () {
    //     const token = new ethers.Contract(USDbC_ADDRESS, ERC20_ABI, impersonatedSigner);

    //     const balance = await token.balanceOf(testAddress);
    //     console.log("balance:", balance);

    //     await approveDelegation(USDbC_ADDRESS);

    //     const borrowTx = await myContract.aaveV3Borrow(USDbC_ADDRESS, inputAmount);
    //     await borrowTx.wait();

    //     console.log("borrowTx:", borrowTx);

    //     const afterbalance = await token.balanceOf(testAddress);
    //     console.log("after balance:", afterbalance);
    // });

    // it("should aave v3 repay", async function () {
    //     await approve();

    //     const result = await myContract.aaveV3Repay(USDC_ADDRESS, inputAmount);

    //     const tx = await result.wait();
    //     console.log("tx:", tx);
    // });

    // it("should swap on aerodrome", async function () {
    //     const token = new ethers.Contract(USDbC_ADDRESS, ERC20_ABI, impersonatedSigner);

    //     const balance = await token.balanceOf(testAddress);
    //     console.log("balance:", balance);
    //     await approve();

    //     const deadline = Math.floor(Date.now() / 1000) + 300;

    //     const result = await myContract.swapToken(
    //         USDC_ADDRESS,
    //         USDbC_ADDRESS,
    //         inputAmount,
    //         getAmountOutMin(inputAmount),
    //         deadline,
    //     );
    //     const tx = await result.wait();
    //     console.log("tx:", tx);

    //     const afterBalance = await token.balanceOf(testAddress);
    //     console.log("afterBalance:", afterBalance);
    // });

    // it("Should call aave v3 flashloan", async function () {
    //     const aaveV3Pool = new ethers.Contract(
    //         aaveV3PoolAddress,
    //         aaveV3PoolJson,
    //         impersonatedSigner,
    //     );

    //     const usdt = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);

    //     await approve();

    //     // send flashloan fee to contract
    //     const tx = await usdt.transfer(deployedContractAddress, "50");
    //     await tx.wait();

    //     // encode DAI token address as example
    //     const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
    //         ["address"],
    //         ["0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063"],
    //     );

    //     const result = await aaveV3Pool.flashLoanSimple(
    //         deployedContractAddress,
    //         USDC_ADDRESS,
    //         "1000",
    //         encodedParams,
    //         0,
    //     );
    // });
});
