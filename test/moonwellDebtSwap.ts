import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";
import hre from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { approve, formatAmount, getAmountInMax } from "./utils";
import { Contract, MaxUint256 } from "ethers";
import { MoonwellHelper } from "./protocols/moonwell";
import {
    cbBTC_ADDRESS,
    cbETH_ADDRESS,
    DEFAULT_SUPPLY_AMOUNT,
    TEST_ADDRESS,
    USDC_ADDRESS,
} from "./constants";
import { DEFAULT_CIPHERS } from "tls";

const mcbETH = "0x3bf93770f2d4a794c3d9ebefbaebae2a8f09a5e5";
const mUSDC = "0xedc817a28e8b93b03976fbd4a3ddbc9f7d176c22";

describe("Moonwell DebtSwap", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;
    let deployedContractAddress: string;

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);
    });

    it.only("should execute supply and borrow", async function () {
        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
        const beforeBalance = await usdcContract.balanceOf(TEST_ADDRESS);
        const moonwellHelper = new MoonwellHelper(impersonatedSigner);
        await approve(cbETH_ADDRESS, mcbETH, impersonatedSigner);
        const tx = await moonwellHelper.supply(mcbETH);
        await moonwellHelper.enableCollateral(mcbETH);
        await moonwellHelper.getDebtAmount(mUSDC);

        await moonwellHelper.borrow(mUSDC);
        await moonwellHelper.getCollateralAmount(mcbETH);

        await moonwellHelper.getDebtAmount(mUSDC);

        const afterBalance = await usdcContract.balanceOf(TEST_ADDRESS);

        console.log(
            `USDC balance:`,
            formatAmount(beforeBalance),
            " -> ",
            formatAmount(afterBalance),
        );

        await approve(USDC_ADDRESS, mUSDC, impersonatedSigner);
        await moonwellHelper.repay(mUSDC, "1");
        await moonwellHelper.getDebtAmount(mUSDC);

        await moonwellHelper.withdrawCollateral(mcbETH, DEFAULT_SUPPLY_AMOUNT);
        await moonwellHelper.getCollateralAmount(mcbETH);
    });
});
