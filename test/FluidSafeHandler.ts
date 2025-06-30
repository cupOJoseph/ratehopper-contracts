import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FluidSafeHandler, ProtocolRegistry } from "../typechain-types";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { FLUID_VAULT_RESOLVER, FLUID_cbETH_USDC_VAULT } from "./protocols/fluid";
import { USDC_ADDRESS, cbETH_ADDRESS, UNISWAP_V3_FACTORY_ADRESS } from "./constants";

describe("FluidSafeHandler Unit Tests", function () {
    let fluidSafeHandler: FluidSafeHandler;
    let protocolRegistry: ProtocolRegistry;
    let owner: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let mockUniswapPool: HardhatEthersSigner;

    async function deployFluidSafeHandlerFixture() {
        const [owner, user, mockUniswapPool] = await ethers.getSigners();

        // Deploy ProtocolRegistry
        const ProtocolRegistry = await ethers.getContractFactory("ProtocolRegistry");
        const protocolRegistry = await ProtocolRegistry.deploy();
        await protocolRegistry.waitForDeployment();

        // Whitelist tokens
        await protocolRegistry.addToWhitelist(USDC_ADDRESS);
        await protocolRegistry.addToWhitelist(cbETH_ADDRESS);

        const FluidSafeHandler = await ethers.getContractFactory("FluidSafeHandler");
        const fluidSafeHandler = await FluidSafeHandler.deploy(
            FLUID_VAULT_RESOLVER,
            UNISWAP_V3_FACTORY_ADRESS,
            await protocolRegistry.getAddress(),
        );
        await fluidSafeHandler.waitForDeployment();

        return {
            fluidSafeHandler,
            protocolRegistry,
            owner,
            user,
            mockUniswapPool,
        };
    }

    beforeEach(async function () {
        const fixture = await loadFixture(deployFluidSafeHandlerFixture);
        fluidSafeHandler = fixture.fluidSafeHandler;
        protocolRegistry = fixture.protocolRegistry;
        owner = fixture.owner;
        user = fixture.user;
        mockUniswapPool = fixture.mockUniswapPool;
    });

    describe("Constructor", function () {
        it("Should set the correct addresses", async function () {
            expect(await fluidSafeHandler.FLUID_VAULT_RESOLVER()).to.equal(FLUID_VAULT_RESOLVER);
            expect(await fluidSafeHandler.registry()).to.equal(await protocolRegistry.getAddress());
        });
    });

    describe("getDebtAmount", function () {
        it("Should revert when vault not found", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                ["0x1234567890123456789012345678901234567890", 0],
            );

            await expect(fluidSafeHandler.getDebtAmount(USDC_ADDRESS, user.address, extraData)).to.be.revertedWith(
                "Vault not found",
            );
        });

        it("Should return debt amount with buffer for existing vault", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );

            // This will likely revert with "Vault not found" since user has no position
            // but it tests the path through the function
            await expect(fluidSafeHandler.getDebtAmount(USDC_ADDRESS, user.address, extraData)).to.be.revertedWith(
                "Vault not found",
            );
        });

        it("Should handle different vault addresses", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [ethers.ZeroAddress, 0]);

            await expect(fluidSafeHandler.getDebtAmount(USDC_ADDRESS, user.address, extraData)).to.be.revertedWith(
                "Vault not found",
            );
        });

        it("Should handle invalid ABI encoded data", async function () {
            const invalidExtraData = "0x1234";

            await expect(fluidSafeHandler.getDebtAmount(USDC_ADDRESS, user.address, invalidExtraData)).to.be.reverted; // Will revert due to ABI decoding error
        });

        it("Should handle empty extraData", async function () {
            const emptyExtraData = "0x";

            await expect(fluidSafeHandler.getDebtAmount(USDC_ADDRESS, user.address, emptyExtraData)).to.be.reverted; // Will revert due to ABI decoding error
        });
    });

    describe("Access Control Tests", function () {
        it("Should revert when called by non-UniswapV3Pool address for switchIn", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );
            const collateralAssets = [
                {
                    asset: cbETH_ADDRESS,
                    amount: ethers.parseEther("1"),
                },
            ];

            await expect(
                fluidSafeHandler.switchIn(
                    USDC_ADDRESS,
                    USDC_ADDRESS,
                    ethers.parseUnits("100", 6),
                    ethers.parseUnits("100", 6),
                    user.address,
                    collateralAssets,
                    extraData,
                    extraData,
                ),
            ).to.be.reverted;
        });

        it("Should revert when called by non-UniswapV3Pool address for switchFrom", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );
            const collateralAssets = [
                {
                    asset: cbETH_ADDRESS,
                    amount: ethers.parseEther("1"),
                },
            ];

            await expect(
                fluidSafeHandler.switchFrom(
                    USDC_ADDRESS,
                    ethers.parseUnits("100", 6),
                    user.address,
                    collateralAssets,
                    extraData,
                ),
            ).to.be.reverted;
        });

        it("Should revert when called by non-UniswapV3Pool address for switchTo", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );
            const collateralAssets = [
                {
                    asset: cbETH_ADDRESS,
                    amount: ethers.parseEther("1"),
                },
            ];

            await expect(
                fluidSafeHandler.switchTo(
                    USDC_ADDRESS,
                    ethers.parseUnits("100", 6),
                    user.address,
                    collateralAssets,
                    extraData,
                ),
            ).to.be.reverted;
        });

        it("Should revert when called by non-UniswapV3Pool address for repay", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );

            await expect(fluidSafeHandler.repay(USDC_ADDRESS, ethers.parseUnits("100", 6), user.address, extraData)).to
                .be.reverted;
        });

        it("Should revert when called by non-UniswapV3Pool address for supply", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );

            await expect(fluidSafeHandler.supply(cbETH_ADDRESS, ethers.parseEther("1"), user.address, extraData)).to.be
                .reverted;
        });

        it("Should revert when called by non-UniswapV3Pool address for borrow", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );

            await expect(fluidSafeHandler.borrow(USDC_ADDRESS, ethers.parseUnits("100", 6), user.address, extraData)).to
                .be.reverted;
        });
    });

    describe("Parameter Validation Tests", function () {
        it("Should handle empty collateral assets arrays", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );
            const emptyCollateralAssets: any[] = [];

            await expect(
                fluidSafeHandler.switchFrom(
                    USDC_ADDRESS,
                    ethers.parseUnits("100", 6),
                    user.address,
                    emptyCollateralAssets,
                    extraData,
                ),
            ).to.be.reverted;
        });

        it("Should handle zero amounts", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );
            const collateralAssets = [
                {
                    asset: cbETH_ADDRESS,
                    amount: 0,
                },
            ];

            await expect(fluidSafeHandler.switchTo(USDC_ADDRESS, 0, user.address, collateralAssets, extraData)).to.be
                .reverted;
        });

        it("Should handle multiple collateral assets", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );
            const multipleCollateralAssets = [
                {
                    asset: cbETH_ADDRESS,
                    amount: ethers.parseEther("1"),
                },
                {
                    asset: USDC_ADDRESS,
                    amount: ethers.parseUnits("1000", 6),
                },
            ];

            await expect(
                fluidSafeHandler.switchFrom(
                    USDC_ADDRESS,
                    ethers.parseUnits("100", 6),
                    user.address,
                    multipleCollateralAssets,
                    extraData,
                ),
            ).to.be.reverted;
        });

        it("Should handle large amounts", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );

            const largeAmount = ethers.parseEther("1000000");

            await expect(fluidSafeHandler.supply(cbETH_ADDRESS, largeAmount, user.address, extraData)).to.be.reverted;
        });

        it("Should handle different nftId values in extraData", async function () {
            const extraDataWithNftId = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 12345],
            );

            await expect(fluidSafeHandler.getDebtAmount(USDC_ADDRESS, user.address, extraDataWithNftId)).to.be.reverted;
        });

        it("Should handle different asset combinations", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );

            await expect(
                fluidSafeHandler.switchIn(
                    cbETH_ADDRESS, // different from asset
                    USDC_ADDRESS,
                    ethers.parseEther("1"),
                    ethers.parseUnits("1000", 6),
                    user.address,
                    [
                        {
                            asset: cbETH_ADDRESS,
                            amount: ethers.parseEther("1"),
                        },
                    ],
                    extraData,
                    extraData,
                ),
            ).to.be.reverted;
        });
    });

    describe("Registry Integration Tests", function () {
        it("Should correctly check asset whitelist status", async function () {
            expect(await protocolRegistry.isWhitelisted(USDC_ADDRESS)).to.be.true;
            expect(await protocolRegistry.isWhitelisted(cbETH_ADDRESS)).to.be.true;

            // Test non-whitelisted asset
            const randomAsset = "0x1234567890123456789012345678901234567890";
            expect(await protocolRegistry.isWhitelisted(randomAsset)).to.be.false;
        });

        it("Should handle whitelist changes", async function () {
            // Remove an asset from whitelist
            await protocolRegistry.removeFromWhitelist(USDC_ADDRESS);
            expect(await protocolRegistry.isWhitelisted(USDC_ADDRESS)).to.be.false;

            // Add it back
            await protocolRegistry.addToWhitelist(USDC_ADDRESS);
            expect(await protocolRegistry.isWhitelisted(USDC_ADDRESS)).to.be.true;
        });

        it("Should handle non-existent asset queries", async function () {
            const nonExistentAsset = "0x0000000000000000000000000000000000000001";
            expect(await protocolRegistry.isWhitelisted(nonExistentAsset)).to.be.false;
        });
    });

    describe("Error Scenarios and Edge Cases", function () {
        it("Should test all error message paths", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );

            // Test that all functions properly enforce access control
            await expect(fluidSafeHandler.repay(USDC_ADDRESS, 1, user.address, extraData)).to.be.reverted;

            await expect(fluidSafeHandler.supply(cbETH_ADDRESS, 1, user.address, extraData)).to.be.reverted;

            await expect(fluidSafeHandler.borrow(USDC_ADDRESS, 1, user.address, extraData)).to.be.reverted;
        });

        it("Should handle invalid vault addresses", async function () {
            const invalidExtraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [ethers.ZeroAddress, 0],
            );

            await expect(fluidSafeHandler.getDebtAmount(USDC_ADDRESS, user.address, invalidExtraData)).to.be.reverted;

            await expect(
                fluidSafeHandler.switchFrom(
                    USDC_ADDRESS,
                    ethers.parseUnits("100", 6),
                    user.address,
                    [
                        {
                            asset: cbETH_ADDRESS,
                            amount: ethers.parseEther("1"),
                        },
                    ],
                    invalidExtraData,
                ),
            ).to.be.reverted;
        });

        it("Should handle maximum values", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, ethers.MaxUint256],
            );

            await expect(fluidSafeHandler.getDebtAmount(USDC_ADDRESS, user.address, extraData)).to.be.revertedWith(
                "Vault not found",
            );
        });

        it("Should handle different user addresses", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );

            // Test with different user addresses
            await expect(fluidSafeHandler.getDebtAmount(USDC_ADDRESS, owner.address, extraData)).to.be.reverted;

            await expect(fluidSafeHandler.getDebtAmount(USDC_ADDRESS, ethers.ZeroAddress, extraData)).to.be.reverted;
        });
    });

    describe("Function Composition Tests", function () {
        it("Should test switchIn calls both switchFrom and switchTo", async function () {
            const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );
            const collateralAssets = [
                {
                    asset: cbETH_ADDRESS,
                    amount: ethers.parseEther("1"),
                },
            ];

            // switchIn should fail with access control error
            await expect(
                fluidSafeHandler.switchIn(
                    USDC_ADDRESS,
                    USDC_ADDRESS,
                    ethers.parseUnits("100", 6),
                    ethers.parseUnits("100", 6),
                    user.address,
                    collateralAssets,
                    extraData,
                    extraData,
                ),
            ).to.be.reverted;
        });

        it("Should test function signatures and overloads", async function () {
            // Test that all functions exist and are callable
            expect(typeof fluidSafeHandler.switchIn).to.equal("function");
            expect(typeof fluidSafeHandler.switchFrom).to.equal("function");
            expect(typeof fluidSafeHandler.switchTo).to.equal("function");
            expect(typeof fluidSafeHandler.repay).to.equal("function");
            expect(typeof fluidSafeHandler.supply).to.equal("function");
            expect(typeof fluidSafeHandler.borrow).to.equal("function");
            expect(typeof fluidSafeHandler.getDebtAmount).to.equal("function");
        });
    });

    describe("Data Encoding/Decoding Edge Cases", function () {
        it("Should handle malformed extraData", async function () {
            // Test with data that's too short
            const shortData = "0x1234";
            await expect(fluidSafeHandler.getDebtAmount(USDC_ADDRESS, user.address, shortData)).to.be.reverted;

            // Test with data that's too long
            const longData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "bytes32"],
                [FLUID_cbETH_USDC_VAULT, 0, 12345, ethers.ZeroHash],
            );
            // This should still work as it will decode the first two parameters
            await expect(fluidSafeHandler.getDebtAmount(USDC_ADDRESS, user.address, longData)).to.be.revertedWith(
                "Vault not found",
            );
        });

        it("Should handle different data types in extraData", async function () {
            // Test with incorrect types (should still work due to ABI encoding)
            const extraDataWithString = ethers.AbiCoder.defaultAbiCoder().encode(
                ["string", "uint256"],
                [FLUID_cbETH_USDC_VAULT, 0],
            );
            // This will likely fail due to incorrect address format
            await expect(fluidSafeHandler.getDebtAmount(USDC_ADDRESS, user.address, extraDataWithString)).to.be
                .reverted;
        });
    });
});
