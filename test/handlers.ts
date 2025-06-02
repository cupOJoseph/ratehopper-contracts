import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";
import { TEST_ADDRESS, USDC_ADDRESS } from "./constants";
import { deployHandlers, deployMaliciousUniswapV3Pool } from "./deployUtils";

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

    describe.only("Malicious contract security tests", function () {
        let maliciousPool: any;

        beforeEach(async function () {
            // Deploy malicious pool targeting the handler
            maliciousPool = await deployMaliciousUniswapV3Pool(await aaveV3Handler.getAddress());
        });

        it("should revert malicious pool attempting borrow", async function () {
            // Verify the malicious pool implements the correct interface
            expect(await maliciousPool.token0()).to.equal(USDC_ADDRESS);
            expect(await maliciousPool.fee()).to.equal(3000);
            expect(await maliciousPool.targetHandler()).to.equal(await aaveV3Handler.getAddress());

            // But all attack attempts should still fail due to CallbackValidation
            await expect(maliciousPool.attemptMaliciousBorrow(USDC_ADDRESS, 1000, TEST_ADDRESS)).to.be.reverted;
        });
    });
});
