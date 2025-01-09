// import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
// import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
// const { expect } = require("chai");
// import { ethers } from "hardhat";
// import hre from "hardhat";
// const aaveDebtTokenJson = require("../externalAbi/aaveV3/aaveDebtToken.json");
// const aaveV3PoolJson = require("../externalAbi/aaveV3/aaveV3Pool.json");
// const aaveProtocolDataProviderAbi = require("../externalAbi/aaveV3/aaveProtocolDataProvider.json");

// import "dotenv/config";
// import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
// import { DebtSwap } from "../typechain-types";
// import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
// import { deployContractFixture, formatAmount, getAmountInMax } from "./utils";
// import { Contract, MaxUint256 } from "ethers";
// import {
//     USDC_ADDRESS,
//     USDbC_ADDRESS,
//     TEST_ADDRESS,
//     USDC_hyUSD_POOL,
//     ETH_USDbC_POOL,
//     AAVE_V3_POOL_ADDRESS,
//     Protocols,
// } from "./constants";
// import { getAaveV3DebtAmount } from "./aaveV3DebtSwap";

// describe("Protocol Switch", function () {
//     let myContract: DebtSwap;
//     let impersonatedSigner: HardhatEthersSigner;
//     let aaveV3Pool: Contract;
//     let deployedContractAddress: string;

//     this.beforeEach(async () => {
//         impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);

//         const { debtSwap } = await loadFixture(deployContractFixture);
//         deployedContractAddress = await debtSwap.getAddress();

//         myContract = await ethers.getContractAt(
//             "DebtSwap",
//             deployedContractAddress,
//             impersonatedSigner,
//         );

//         aaveV3Pool = new ethers.Contract(AAVE_V3_POOL_ADDRESS, aaveV3PoolJson, impersonatedSigner);
//     });

//     async function executeDebtSwap(
//         fromTokenAddress: string,
//         toTokenAddress: string,
//         flashloanPool: string,
//     ) {
//         const beforeFromTokenDebt = await getAaveV3DebtAmount(fromTokenAddress, impersonatedSigner);

//         await approve();
//         await approveDelegation(toTokenAddress, deployedContractAddress, impersonatedSigner);

//         const tx = await myContract.executeDebtSwap(
//             flashloanPool,
//             Protocols.AAVE_V3,
//             Protocols.AAVE_V3,
//             fromTokenAddress,
//             toTokenAddress,
//             beforeFromTokenDebt,
//             getAmountInMax(beforeFromTokenDebt),
//             "0x",
//         );
//         await tx.wait();

//         const afterFromTokenDebt = await getDebtAmount(fromTokenAddress);
//         const afterToTokenDebt = await getDebtAmount(toTokenAddress);

//         console.log(
//             `${fromTokenAddress} Debt Amount:`,
//             formatAmount(beforeFromTokenDebt),
//             " -> ",
//             formatAmount(afterFromTokenDebt),
//         );
//         console.log(
//             `${toTokenAddress} Debt Amount:`,
//             formatAmount(beforeToTokenDebt),
//             " -> ",
//             formatAmount(afterToTokenDebt),
//         );
//         expect(afterFromTokenDebt).to.be.lessThan(beforeFromTokenDebt);
//         expect(afterToTokenDebt).to.be.greaterThanOrEqual(beforeToTokenDebt);
//     }

//     it("should switch from Aave to Compound", async function () {
//         await borrowToken(USDC_ADDRESS);

//         await executeDebtSwap(USDC_ADDRESS, USDbC_ADDRESS, USDC_hyUSD_POOL);
//     });
// });
