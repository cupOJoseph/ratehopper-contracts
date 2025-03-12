import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers, upgrades } from "hardhat";

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { LeveragedPosition } from "../typechain-types";
import morphoAbi from "../externalAbi/morpho/morpho.json";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { approve, getDecimals, getParaswapData, protocolHelperMap } from "./utils";
import { Protocols } from "./constants";

describe.skip("Upgrade contract", function () {
    let impersonatedSigner: HardhatEthersSigner;

    let deployedContractAddress: string;

    this.beforeEach(async () => {
        const SafeModuleDebtSwap = await ethers.getContractFactory("SafeModuleDebtSwapUpgradeable");

        // Prepare constructor arguments for initialize
        const protocols = [Protocols.AAVE_V3];
        const handlers = ["0x123"];

        // Deploy as upgradeable using UUPS proxy
        const safeModuleDebtSwap = await upgrades.deployProxy(SafeModuleDebtSwap, [protocols, handlers], {
            kind: "uups",
            initializer: "initialize",
        });

        await safeModuleDebtSwap.deployed();
        console.log("SafeModuleDebtSwap deployed to:", safeModuleDebtSwap.address);
    });

    it("deploy contract", async function () {
        console.log("deployed");
    });
});
