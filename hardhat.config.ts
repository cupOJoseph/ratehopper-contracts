import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.27",
  networks: {
    hardhat: {
      chains: {
        137: {
          hardforkHistory: {
            london: 23850000,
          },
        },
      },
      forking: {
        url: `https://polygon.meowrpc.com`,
        blockNumber: 63332844,
      },
    },
  },
};

export default config;
