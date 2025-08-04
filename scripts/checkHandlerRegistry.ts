import { ethers } from "ethers";
import dotenv from "dotenv";
import { getCTokenMappingArrays } from "../contractAddresses";

dotenv.config();

async function main() {
    const provider = new ethers.JsonRpcProvider("https://base.llamarpc.com");

    // Replace with actual compound handler address - you'll need to provide this
    const COMPOUND_HANDLER_ADDRESS =
        process.env.COMPOUND_HANDLER_ADDRESS || "0xaF141AB1eD50144Ff527cF0Ee5595e7D27dAb935";

    if (COMPOUND_HANDLER_ADDRESS === "0x...") {
        console.error("Please set COMPOUND_HANDLER_ADDRESS in your environment variables");
        process.exit(1);
    }

    // Get the compound handler ABI
    const compoundHandlerAbi = require("../artifacts/contracts/protocols/compoundHandler.sol/CompoundHandler.json").abi;
    const compoundHandler = new ethers.Contract(COMPOUND_HANDLER_ADDRESS, compoundHandlerAbi, provider);

    try {
        // Get the registry address from the compound handler
        const registryAddress = await compoundHandler.registry();
        console.log("Registry address:", registryAddress);

        // Get the protocol registry ABI
        const registryAbi = require("../artifacts/contracts/ProtocolRegistry.sol/ProtocolRegistry.json").abi;
        const registry = new ethers.Contract(registryAddress, registryAbi, provider);

        // Check compound token mappings
        const [tokens, contracts] = getCTokenMappingArrays();

        console.log("\nChecking Compound token mappings:");
        console.log("=".repeat(50));

        for (let i = 0; i < tokens.length; i++) {
            try {
                const registeredContract = await registry.getCContract(tokens[i]);
                const expectedContract = contracts[i];
                const isCorrect = registeredContract.toLowerCase() === expectedContract.toLowerCase();

                console.log(`Token: ${tokens[i]}`);
                console.log(`  Expected: ${expectedContract}`);
                console.log(`  Registered: ${registeredContract}`);
                console.log(`  Status: ${isCorrect ? "✅ CORRECT" : "❌ MISMATCH"}`);
                console.log("");
            } catch (error) {
                console.log(`Token: ${tokens[i]}`);
                console.log(`  Expected: ${contracts[i]}`);
                console.log(`  Error: ${error}`);
                console.log("");
            }
        }

        // Check if tokens are whitelisted
        console.log("Checking whitelist status:");
        console.log("=".repeat(50));

        for (const token of tokens) {
            try {
                const isWhitelisted = await registry.isWhitelisted(token);
                console.log(`${token}: ${isWhitelisted ? "✅ WHITELISTED" : "❌ NOT WHITELISTED"}`);
            } catch (error) {
                console.log(`${token}: Error checking whitelist - ${error}`);
            }
        }
    } catch (error) {
        console.error("Error checking compound handler registry:", error);
    }
}

main().catch((error) => {
    console.error("Script execution failed:", error);
    process.exit(1);
});
