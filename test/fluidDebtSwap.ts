import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap, FluidHandler } from "../typechain-types";
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
} from "./constants";

import { FLUID_cbETH_USDC_VAULT, FluidHelper } from "./protocols/fluid";

describe("Fluid v3 DebtSwap", function () {
    let myContract: FluidHandler;
    let impersonatedSigner: HardhatEthersSigner;

    let deployedContractAddress: string;
    let fluidHelper: FluidHelper;

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);
        fluidHelper = new FluidHelper(impersonatedSigner);

        const { debtSwap, fluidHandler } = await loadFixture(deployContractFixture);
        // deployedContractAddress = await debtSwap.getAddress();

        // myContract = await ethers.getContractAt(
        //     "DebtSwap",
        //     deployedContractAddress,
        //     impersonatedSigner,
        // );
        deployedContractAddress = await fluidHandler.getAddress();

        myContract = await ethers.getContractAt(
            "FluidHandler",
            deployedContractAddress,
            impersonatedSigner,
        );
    });

    // it("should switch from USDC to USDbC", async function () {
    //     const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
    //     const usdcBalance = await usdcContract.balanceOf(TEST_ADDRESS);
    //     // await fluidHelper.supply(FLUID_cbETH_USDC_VAULT);

    //     // await fluidHelper.borrow(FLUID_cbETH_USDC_VAULT, USDC_ADDRESS);
    //     //
    //     await approve(cbETH_ADDRESS, deployedContractAddress, impersonatedSigner);
    //     const supplyAmount = ethers.parseEther("0.001");
    //     await myContract.supply(cbETH_ADDRESS, FLUID_cbETH_USDC_VAULT, supplyAmount, TEST_ADDRESS);
    //     await fluidHelper.getCollateralAmount(FLUID_cbETH_USDC_VAULT, TEST_ADDRESS);
    //     const nftId = await fluidHelper.getNftId(FLUID_cbETH_USDC_VAULT, TEST_ADDRESS);

    //     const borrowAmount = ethers.parseUnits("0.1", 6);
    //     await myContract.borrow(nftId, FLUID_cbETH_USDC_VAULT, borrowAmount, TEST_ADDRESS);
    //     await fluidHelper.getDebtAmount(FLUID_cbETH_USDC_VAULT, TEST_ADDRESS);

    //     const usdcBalanceAfter = await usdcContract.balanceOf(TEST_ADDRESS);
    //     console.log("usdcBalance:", usdcBalance);
    //     console.log("usdcBalanceAfter:", usdcBalanceAfter);

    //     // await executeDebtSwap(USDC_ADDRESS, USDbC_ADDRESS, USDC_hyUSD_POOL);
    // });
});
