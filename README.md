# RateHopper Contracts

```
// fork from base mainnet. change RPC URL if needed
npx hardhat node --fork https://base.llamarpc.com

// run test againt local node
yarn test --network localhost --verbose

// deploy to testnet(base sepolia)
npx hardhat ignition deploy ignition/modules/debtSwap.ts --network baseSepolia

// deploy to mainnet(Base mainnet)
npx hardhat ignition deploy ignition/modules/debtSwap.ts --network base
```
