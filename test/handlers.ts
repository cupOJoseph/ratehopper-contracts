import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";
import { TEST_ADDRESS, USDC_ADDRESS } from "./constants";
import { deployHandlers } from "./deployUtils";

describe("Handler contracts should", function () {
    let aaveV3Handler;

    this.beforeEach(async () => {
        ({ aaveV3Handler } = await loadFixture(deployHandlers));
    });

    it("revert when calling directly with default signer", async function () {
        await expect(aaveV3Handler.borrow(USDC_ADDRESS, ethers.parseUnits("1", 6), TEST_ADDRESS, "0x")).to.be.reverted;
    });

    it("revert when calling directly with another signer", async function () {
        const [, signer1] = await ethers.getSigners();
        const aaveV3HandlerWithSigner1 = aaveV3Handler.connect(signer1);

        await expect(aaveV3HandlerWithSigner1.borrow(USDC_ADDRESS, ethers.parseUnits("1", 6), TEST_ADDRESS, "0x")).to.be
            .reverted;
    });
});
