import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// Import the upgrades plugin
const { upgrades } = require("hardhat");

describe("UUPS Proxy Upgrade Pattern with TimelockController", function () {
    let simpleStorage: Contract;
    // let timelockController: Contract;
    let timelockController: any;
    let owner: HardhatEthersSigner;
    let proposer: HardhatEthersSigner;
    let executor: HardhatEthersSigner;
    let admin: HardhatEthersSigner;
    let user: HardhatEthersSigner;

    // Storage for timelock operations
    let upgradeOperationId: string;
    let upgradeCallData: string;
    let simpleStorageV2Implementation: any; // Using any to avoid type issues

    before(async function () {
        // Get signers
        [owner, proposer, executor, admin, user] = await ethers.getSigners();
    });

    it("Should create a TimelockController with a 24-hour delay", async function () {
        // Create arrays for proposers and executors
        const proposers = [proposer.address];
        const executors = [executor.address];

        // 24 hours in seconds
        const minDelay = 24 * 60 * 60;

        // Deploy the TimelockController directly
        const TimelockControllerFactory = await ethers.getContractFactory("TimelockController");
        timelockController = await TimelockControllerFactory.deploy(
            minDelay,
            proposers,
            executors,
            admin.address,
        );
        await timelockController.waitForDeployment();

        console.log("TimelockController deployed at:", await timelockController.getAddress());

        // Verify the delay is set to 24 hours (in seconds)
        const delay = await timelockController.getMinDelay();
        expect(delay).to.equal(24 * 60 * 60);

        // Verify roles are set correctly
        // TimelockController roles are defined as constants in the contract
        const PROPOSER_ROLE = await timelockController.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelockController.EXECUTOR_ROLE();
        // For the admin role, we need to use the DEFAULT_ADMIN_ROLE from AccessControl
        const DEFAULT_ADMIN_ROLE = ethers.ZeroHash; // 0x00...00 is the default admin role in AccessControl

        expect(await timelockController.hasRole(PROPOSER_ROLE, proposer.address)).to.be.true;
        expect(await timelockController.hasRole(EXECUTOR_ROLE, executor.address)).to.be.true;
        expect(await timelockController.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should deploy the SimpleStorage contract behind a proxy with TimelockController", async function () {
        // Deploy the implementation contract behind a proxy using the UUPS pattern
        const SimpleStorage = await ethers.getContractFactory("SimpleStorage");
        simpleStorage = await upgrades.deployProxy(SimpleStorage, [await timelockController.getAddress()], {
            kind: "uups",
        });
        await simpleStorage.waitForDeployment();

        // Get the implementation address
        const implementationAddress = await upgrades.erc1967.getImplementationAddress(await simpleStorage.getAddress());
        console.log("SimpleStorage Proxy address:", await simpleStorage.getAddress());
        console.log("SimpleStorage Implementation address:", implementationAddress);

        // Verify the timelock is set correctly
        expect(await simpleStorage.timelock()).to.equal(await timelockController.getAddress());

        // Verify the timelock has the UPGRADER_ROLE
        const upgraderRole = await simpleStorage.UPGRADER_ROLE();
        expect(await simpleStorage.hasRole(upgraderRole, await timelockController.getAddress())).to.be.true;
    });

    it("Should store and retrieve a value", async function () {
        // Store a value
        const tx = await simpleStorage.store(42);
        await tx.wait();

        // Retrieve the value
        const value = await simpleStorage.retrieve();
        expect(value).to.equal(42);
    });

    it("Should schedule an upgrade to SimpleStorageV2 through the TimelockController", async function () {
        // Deploy the upgraded implementation contract
        const SimpleStorageV2 = await ethers.getContractFactory("SimpleStorageV2");
        simpleStorageV2Implementation = await SimpleStorageV2.deploy();
        await simpleStorageV2Implementation.waitForDeployment();

        console.log("SimpleStorageV2 Implementation deployed at:", await simpleStorageV2Implementation.getAddress());

        // Encode the upgrade call for the proxy
        upgradeCallData = simpleStorage.interface.encodeFunctionData("upgradeToAndCall", [
            await simpleStorageV2Implementation.getAddress(),
            "0x", // No initialization data needed
        ]);

        // Calculate the timestamp for execution (current time + delay)
        const currentTimestamp = await time.latest();
        const executionTime = currentTimestamp + 24 * 60 * 60; // 24 hours from now

        // Schedule the upgrade operation through the timelock
        const scheduleTx = await timelockController.connect(proposer).schedule(
            await simpleStorage.getAddress(), // Target address (the proxy)
            0, // Value (no ETH sent)
            upgradeCallData, // Calldata for the upgrade
            ethers.ZeroHash, // Predecessor (none)
            ethers.ZeroHash, // Salt
            24 * 60 * 60, // Min delay (24 hours)
        );
        await scheduleTx.wait();

        // Get the operation ID
        upgradeOperationId = await timelockController.hashOperation(
            await simpleStorage.getAddress(),
            0,
            upgradeCallData,
            ethers.ZeroHash,
            ethers.ZeroHash,
        );

        console.log("Upgrade scheduled with operation ID:", upgradeOperationId);

        // Verify the operation is pending
        expect(await timelockController.isOperationPending(upgradeOperationId)).to.be.true;
        expect(await timelockController.isOperationReady(upgradeOperationId)).to.be.false;

        // Check the timestamp when it will be ready
        const timestamp = await timelockController.getTimestamp(upgradeOperationId);
        // Instead of exact equality, check that the timestamp is close to the expected time
        // This accounts for small differences in block timestamps
        expect(timestamp).to.be.closeTo(executionTime, 1);
    });

    it("Should not be able to execute the upgrade before the delay", async function () {
        // Try to execute the operation before the delay has passed
        await expect(
            timelockController.connect(executor).execute(
                await simpleStorage.getAddress(),
                0,
                upgradeCallData, // Use the correct calldata
                ethers.ZeroHash,
                ethers.ZeroHash,
            ),
        ).to.be.reverted; // Just check for any revert, as OpenZeppelin uses custom errors
    });

    it("Should execute the upgrade after the delay", async function () {
        // Fast forward time by 24 hours
        await time.increase(24 * 60 * 60);

        // Verify the operation is now ready
        expect(await timelockController.isOperationReady(upgradeOperationId)).to.be.true;

        // Execute the upgrade through the timelock using the previously scheduled operation
        // We must use the exact same parameters that were used in the schedule call
        const executeTx = await timelockController.connect(executor).execute(
            await simpleStorage.getAddress(), // Target address (the proxy)
            0, // Value (no ETH sent)
            upgradeCallData, // Calldata for the upgrade (using the one from the schedule test)
            ethers.ZeroHash, // Predecessor (none)
            ethers.ZeroHash, // Salt
        );
        await executeTx.wait();

        // Verify the operation is now done
        expect(await timelockController.isOperationDone(upgradeOperationId)).to.be.true;

        // Get the new implementation address
        const implementationAddressV2 = await upgrades.erc1967.getImplementationAddress(
            await simpleStorage.getAddress(),
        );
        console.log("SimpleStorageV2 Implementation address after upgrade:", implementationAddressV2);

        // Verify the proxy address remains the same
        console.log("Proxy address after upgrade:", await simpleStorage.getAddress());

        // Update the simpleStorage instance to use the V2 ABI
        simpleStorage = await ethers.getContractAt("SimpleStorageV2", await simpleStorage.getAddress());
    });

    it("Should maintain the stored value after upgrade", async function () {
        // Retrieve the value (should still be 42 from before the upgrade)
        const value = await simpleStorage.retrieve();
        expect(value).to.equal(42);
    });

    it("Should use new functionality from V2", async function () {
        // Set a message using the new functionality
        await simpleStorage.setMessage("Hello, Upgradeable World with Timelock!");

        // Get the message
        const message = await simpleStorage.getMessage();
        expect(message).to.equal("Hello, Upgradeable World with Timelock!");
    });

    it("Should not allow direct upgrades bypassing the timelock", async function () {
        // Try to upgrade directly without going through the timelock
        const SimpleStorageV2 = await ethers.getContractFactory("SimpleStorageV2");
        const newImplementation = await SimpleStorageV2.deploy();
        await newImplementation.waitForDeployment();

        // This should fail because only the timelock has the UPGRADER_ROLE
        await expect(simpleStorage.upgradeToAndCall(await newImplementation.getAddress(), "0x")).to.be.reverted;
    });
});
