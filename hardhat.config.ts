import { base } from "./node_modules/acorn-walk/dist/walk.d";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const baseUrl = "https://base.llamarpc.com";

const config: HardhatUserConfig = {
  solidity: "0.8.27",
  networks: {
    base: {
      url: baseUrl,
      // timeout: 1000000,
      gasPrice: 1700000000,
      chainId: 8453,
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
        // blockNumber: 23901547,
      },
    },
  },
};

export default config;
