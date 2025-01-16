import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
// import { DebtSwap,  MorphoHandler } from "../typechain-types";
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

import { MorphoHelper } from "./protocols/morpho";

describe(" Morpho v3 DebtSwap", function () {
    // let myContract:  MorphoHandler;
    let impersonatedSigner: HardhatEthersSigner;

    let deployedContractAddress: string;
    let morphoHelper: MorphoHelper;

    this.beforeEach(async () => {
        morphoHelper = new MorphoHelper(impersonatedSigner);
        //  impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);
        // const { debtSwap,  morphoHandler } = await loadFixture(deployContractFixture);
        // // deployedContractAddress = await debtSwap.getAddress();

        // // myContract = await ethers.getContractAt(
        // //     "DebtSwap",
        // //     deployedContractAddress,
        // //     impersonatedSigner,
        // // );
        // deployedContractAddress = await  morphoHandler.getAddress();

        // myContract = await ethers.getContractAt(
        //     " MorphoHandler",
        //     deployedContractAddress,
        //     impersonatedSigner,
        // );
    });

    it("decode", async function () {
        morphoHelper.decode("0x0000000000000000000000000000000000000000000000000000000000000001");
    });
});
