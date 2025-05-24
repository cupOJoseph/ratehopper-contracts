import { base } from "./node_modules/acorn-walk/dist/walk.d";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import dotenv from "dotenv";
dotenv.config();
require("hardhat-tracer");
require("@openzeppelin/hardhat-upgrades");

// const baseUrl = "https://base.llamarpc.com";
const baseUrl = "https://mainnet.base.org";

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: "0.7.6",
            },
            {
                version: "0.8.28",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                    viaIR: true,
                },
            },
        ],
    },
    etherscan: {
        apiKey: process.env.EXPLORER_KEY,
    },
    mocha: {
        timeout: 3000000,
        parallel: false,
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS ? true : false,
    },
    networks: {
        base: {
            url: baseUrl,
            chainId: 8453,
            timeout: 10_000_000,
            accounts: [process.env.PRIVATE_KEY!],
        },
        baseSepolia: {
            url: "https://sepolia.base.org",
            chainId: 84532,
            accounts: [process.env.PRIVATE_KEY!],
        },
        sepolia: {
            url: "https://eth-sepolia.public.blastapi.io",
            chainId: 11155111,
            accounts: [process.env.PRIVATE_KEY!],
        },
        localhost: {
            url: "http://localhost:8545",
            timeout: 100_000_000,
        },
        hardhat: {
            chainId: 8453,
            chains: {
                8453: {
                    hardforkHistory: {
                        london: 1,
                    },
                },
            },
            forking: {
                url: baseUrl,
                blockNumber: 30299167,
            },
        },
    },
};

export default config;
