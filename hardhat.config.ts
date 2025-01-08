import { base } from "./node_modules/acorn-walk/dist/walk.d";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";
dotenv.config();

const baseUrl = "https://base.llamarpc.com";

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: "0.7.6",
            },
            {
                version: "0.8.27",
            },
        ],
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
            chains: {
                8453: {
                    hardforkHistory: {
                        london: 1,
                    },
                },
            },
            forking: {
                url: baseUrl,
                blockNumber: 24722079,
            },
        },
    },
};

export default config;
