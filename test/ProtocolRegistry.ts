import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ProtocolRegistry } from "../typechain-types";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { USDC_ADDRESS, cbETH_ADDRESS, WETH_ADDRESS, DAI_ADDRESS } from "./constants";

describe("ProtocolRegistry - setTokenMContract and setTokenCContract Tests", function () {
    let protocolRegistry: ProtocolRegistry;
    let owner: HardhatEthersSigner;
    let nonOwner: HardhatEthersSigner;
    let mockMContract: HardhatEthersSigner;
    let mockCContract: HardhatEthersSigner;

    async function deployProtocolRegistryFixture() {
        const [owner, nonOwner, mockMContract, mockCContract] = await ethers.getSigners();

        const ProtocolRegistry = await ethers.getContractFactory("ProtocolRegistry");
        const protocolRegistry = await ProtocolRegistry.deploy();
        await protocolRegistry.waitForDeployment();

        return {
            protocolRegistry,
            owner,
            nonOwner,
            mockMContract,
            mockCContract,
        };
    }

    beforeEach(async function () {
        const fixture = await loadFixture(deployProtocolRegistryFixture);
        protocolRegistry = fixture.protocolRegistry;
        owner = fixture.owner;
        nonOwner = fixture.nonOwner;
        mockMContract = fixture.mockMContract;
        mockCContract = fixture.mockCContract;
    });

    describe("setTokenMContract", function () {
        describe("Success Cases", function () {
            it("Should set token to mContract mapping successfully", async function () {
                await protocolRegistry.setTokenMContract(USDC_ADDRESS, mockMContract.address);

                const mContract = await protocolRegistry.getMContract(USDC_ADDRESS);
                expect(mContract).to.equal(mockMContract.address);
            });

            it("Should allow setting multiple different tokens", async function () {
                await protocolRegistry.setTokenMContract(USDC_ADDRESS, mockMContract.address);
                await protocolRegistry.setTokenMContract(cbETH_ADDRESS, mockCContract.address);

                expect(await protocolRegistry.getMContract(USDC_ADDRESS)).to.equal(mockMContract.address);
                expect(await protocolRegistry.getMContract(cbETH_ADDRESS)).to.equal(mockCContract.address);
            });

            it("Should allow overwriting existing mapping", async function () {
                // Set initial mapping
                await protocolRegistry.setTokenMContract(USDC_ADDRESS, mockMContract.address);
                expect(await protocolRegistry.getMContract(USDC_ADDRESS)).to.equal(mockMContract.address);

                // Overwrite with new mapping
                await protocolRegistry.setTokenMContract(USDC_ADDRESS, mockCContract.address);
                expect(await protocolRegistry.getMContract(USDC_ADDRESS)).to.equal(mockCContract.address);
            });

            it("Should allow setting mContract to zero address", async function () {
                // First set a valid mapping
                await protocolRegistry.setTokenMContract(USDC_ADDRESS, mockMContract.address);
                expect(await protocolRegistry.getMContract(USDC_ADDRESS)).to.equal(mockMContract.address);

                // Then set to zero address (effectively removing the mapping)
                await protocolRegistry.setTokenMContract(USDC_ADDRESS, ethers.ZeroAddress);
                expect(await protocolRegistry.getMContract(USDC_ADDRESS)).to.equal(ethers.ZeroAddress);
            });
        });

        describe("Access Control", function () {
            it("Should revert when called by non-owner", async function () {
                await expect(
                    protocolRegistry.connect(nonOwner).setTokenMContract(USDC_ADDRESS, mockMContract.address),
                ).to.be.revertedWithCustomError(protocolRegistry, "OwnableUnauthorizedAccount");
            });

            it("Should only allow owner to call the function", async function () {
                // Owner should succeed
                await expect(protocolRegistry.connect(owner).setTokenMContract(USDC_ADDRESS, mockMContract.address)).to
                    .not.be.reverted;

                // Non-owner should fail
                await expect(
                    protocolRegistry.connect(nonOwner).setTokenMContract(cbETH_ADDRESS, mockMContract.address),
                ).to.be.revertedWithCustomError(protocolRegistry, "OwnableUnauthorizedAccount");
            });
        });

        describe("Input Validation", function () {
            it("Should revert when token address is zero", async function () {
                await expect(
                    protocolRegistry.setTokenMContract(ethers.ZeroAddress, mockMContract.address),
                ).to.be.revertedWithCustomError(protocolRegistry, "ZeroAddress");
            });

            it("Should not revert when mContract address is zero", async function () {
                await expect(protocolRegistry.setTokenMContract(USDC_ADDRESS, ethers.ZeroAddress)).to.not.be.reverted;
            });
        });

        describe("Edge Cases", function () {
            it("Should handle setting same token and mContract address", async function () {
                await protocolRegistry.setTokenMContract(USDC_ADDRESS, USDC_ADDRESS);
                expect(await protocolRegistry.getMContract(USDC_ADDRESS)).to.equal(USDC_ADDRESS);
            });

            it("Should return zero address for non-existent mappings", async function () {
                expect(await protocolRegistry.getMContract(WETH_ADDRESS)).to.equal(ethers.ZeroAddress);
            });
        });
    });

    describe("setTokenCContract", function () {
        describe("Success Cases", function () {
            it("Should set token to cContract mapping successfully", async function () {
                await protocolRegistry.setTokenCContract(USDC_ADDRESS, mockCContract.address);

                const cContract = await protocolRegistry.getCContract(USDC_ADDRESS);
                expect(cContract).to.equal(mockCContract.address);
            });

            it("Should allow setting multiple different tokens", async function () {
                await protocolRegistry.setTokenCContract(USDC_ADDRESS, mockCContract.address);
                await protocolRegistry.setTokenCContract(cbETH_ADDRESS, mockMContract.address);

                expect(await protocolRegistry.getCContract(USDC_ADDRESS)).to.equal(mockCContract.address);
                expect(await protocolRegistry.getCContract(cbETH_ADDRESS)).to.equal(mockMContract.address);
            });

            it("Should allow overwriting existing mapping", async function () {
                // Set initial mapping
                await protocolRegistry.setTokenCContract(USDC_ADDRESS, mockCContract.address);
                expect(await protocolRegistry.getCContract(USDC_ADDRESS)).to.equal(mockCContract.address);

                // Overwrite with new mapping
                await protocolRegistry.setTokenCContract(USDC_ADDRESS, mockMContract.address);
                expect(await protocolRegistry.getCContract(USDC_ADDRESS)).to.equal(mockMContract.address);
            });

            it("Should allow setting cContract to zero address", async function () {
                // First set a valid mapping
                await protocolRegistry.setTokenCContract(USDC_ADDRESS, mockCContract.address);
                expect(await protocolRegistry.getCContract(USDC_ADDRESS)).to.equal(mockCContract.address);

                // Then set to zero address (effectively removing the mapping)
                await protocolRegistry.setTokenCContract(USDC_ADDRESS, ethers.ZeroAddress);
                expect(await protocolRegistry.getCContract(USDC_ADDRESS)).to.equal(ethers.ZeroAddress);
            });
        });

        describe("Access Control", function () {
            it("Should revert when called by non-owner", async function () {
                await expect(
                    protocolRegistry.connect(nonOwner).setTokenCContract(USDC_ADDRESS, mockCContract.address),
                ).to.be.revertedWithCustomError(protocolRegistry, "OwnableUnauthorizedAccount");
            });

            it("Should only allow owner to call the function", async function () {
                // Owner should succeed
                await expect(protocolRegistry.connect(owner).setTokenCContract(USDC_ADDRESS, mockCContract.address)).to
                    .not.be.reverted;

                // Non-owner should fail
                await expect(
                    protocolRegistry.connect(nonOwner).setTokenCContract(cbETH_ADDRESS, mockCContract.address),
                ).to.be.revertedWithCustomError(protocolRegistry, "OwnableUnauthorizedAccount");
            });
        });

        describe("Input Validation", function () {
            it("Should revert when token address is zero", async function () {
                await expect(
                    protocolRegistry.setTokenCContract(ethers.ZeroAddress, mockCContract.address),
                ).to.be.revertedWithCustomError(protocolRegistry, "ZeroAddress");
            });

            it("Should not revert when cContract address is zero", async function () {
                await expect(protocolRegistry.setTokenCContract(USDC_ADDRESS, ethers.ZeroAddress)).to.not.be.reverted;
            });
        });

        describe("Edge Cases", function () {
            it("Should handle setting same token and cContract address", async function () {
                await protocolRegistry.setTokenCContract(USDC_ADDRESS, USDC_ADDRESS);
                expect(await protocolRegistry.getCContract(USDC_ADDRESS)).to.equal(USDC_ADDRESS);
            });

            it("Should return zero address for non-existent mappings", async function () {
                expect(await protocolRegistry.getCContract(WETH_ADDRESS)).to.equal(ethers.ZeroAddress);
            });
        });
    });

    describe("Cross-function Integration", function () {
        it("Should allow setting both mContract and cContract for same token", async function () {
            await protocolRegistry.setTokenMContract(USDC_ADDRESS, mockMContract.address);
            await protocolRegistry.setTokenCContract(USDC_ADDRESS, mockCContract.address);

            expect(await protocolRegistry.getMContract(USDC_ADDRESS)).to.equal(mockMContract.address);
            expect(await protocolRegistry.getCContract(USDC_ADDRESS)).to.equal(mockCContract.address);
        });

        it("Should maintain independent mappings for M and C contracts", async function () {
            await protocolRegistry.setTokenMContract(USDC_ADDRESS, mockMContract.address);
            await protocolRegistry.setTokenCContract(USDC_ADDRESS, mockCContract.address);

            // Changing mContract should not affect cContract
            await protocolRegistry.setTokenMContract(USDC_ADDRESS, mockCContract.address);
            expect(await protocolRegistry.getMContract(USDC_ADDRESS)).to.equal(mockCContract.address);
            expect(await protocolRegistry.getCContract(USDC_ADDRESS)).to.equal(mockCContract.address);

            // Changing cContract should not affect mContract
            await protocolRegistry.setTokenCContract(USDC_ADDRESS, mockMContract.address);
            expect(await protocolRegistry.getMContract(USDC_ADDRESS)).to.equal(mockCContract.address);
            expect(await protocolRegistry.getCContract(USDC_ADDRESS)).to.equal(mockMContract.address);
        });

        it("Should handle multiple tokens with different contract mappings", async function () {
            // Set up multiple mappings
            await protocolRegistry.setTokenMContract(USDC_ADDRESS, mockMContract.address);
            await protocolRegistry.setTokenCContract(USDC_ADDRESS, mockCContract.address);
            await protocolRegistry.setTokenMContract(cbETH_ADDRESS, mockCContract.address);
            await protocolRegistry.setTokenCContract(cbETH_ADDRESS, mockMContract.address);

            // Verify all mappings are correct
            expect(await protocolRegistry.getMContract(USDC_ADDRESS)).to.equal(mockMContract.address);
            expect(await protocolRegistry.getCContract(USDC_ADDRESS)).to.equal(mockCContract.address);
            expect(await protocolRegistry.getMContract(cbETH_ADDRESS)).to.equal(mockCContract.address);
            expect(await protocolRegistry.getCContract(cbETH_ADDRESS)).to.equal(mockMContract.address);
        });
    });

    describe("Gas Usage and Performance", function () {
        it("Should handle setting many mappings efficiently", async function () {
            const tokens = [USDC_ADDRESS, cbETH_ADDRESS, WETH_ADDRESS, DAI_ADDRESS];
            const contracts = [mockMContract.address, mockCContract.address, owner.address, nonOwner.address];

            // Set mContract mappings
            for (let i = 0; i < tokens.length; i++) {
                await protocolRegistry.setTokenMContract(tokens[i], contracts[i]);
            }

            // Set cContract mappings
            for (let i = 0; i < tokens.length; i++) {
                await protocolRegistry.setTokenCContract(tokens[i], contracts[i]);
            }

            // Verify all mappings
            for (let i = 0; i < tokens.length; i++) {
                expect(await protocolRegistry.getMContract(tokens[i])).to.equal(contracts[i]);
                expect(await protocolRegistry.getCContract(tokens[i])).to.equal(contracts[i]);
            }
        });
    });
});
