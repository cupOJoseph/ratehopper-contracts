// import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
// const { expect } = require("chai");
// import { ethers } from "hardhat";
// import hre from "hardhat";

// import "dotenv/config";
// import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
// import { DebtSwap } from "../typechain-types";
// import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
// import { getAmountInMax } from "./utils";
// import { Contract, MaxUint256 } from "ethers";

// const MErc20DelegatorAbi = require("../externalAbi/moonwell/MErc20Delegator.json");

// describe("Moonwell DebtSwap", function () {
//     let myContract: DebtSwap;
//     let impersonatedSigner: HardhatEthersSigner;
//     let deployedContractAddress: string;
//     const USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // Circle
//     const mUSDC_ADDRESS = "0xedc817a28e8b93b03976fbd4a3ddbc9f7d176c22";

//     const AAVE_V3_POOL_ADDRESS = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
//     const UNISWAP_V3_FACTORY_ADRESS = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
//     const UNISWAP_V3_SWAP_ROUTER_ADDRESS = "0x2626664c2603336E57B271c5C0b26F421741e481";

//     // should be replaced by hardhat test account
//     const TEST_ADDRESS = "0x50fe1109188A0B666c4d78908E3E539D73F97E33";

//     this.timeout(3000000);

//     async function deployContractFixture() {
//         const DebtSwap = await hre.ethers.getContractFactory("DebtSwap");
//         const debtSwap = await DebtSwap.deploy(
//             AAVE_V3_POOL_ADDRESS,
//             UNISWAP_V3_FACTORY_ADRESS,
//             UNISWAP_V3_SWAP_ROUTER_ADDRESS,
//         );

//         return {
//             debtSwap,
//         };
//     }

//     async function approve() {
//         const token = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
//         const approveTx = await token.approve(deployedContractAddress, ethers.parseUnits("1", 6));
//         await approveTx.wait();
//         // console.log("approveTx:", approveTx);
//     }

//     async function getDebtAmount(assetAddress: string): Promise<bigint> {
//         const mToken = new ethers.Contract(assetAddress, MErc20DelegatorAbi, impersonatedSigner);

//         const debtAmount = await mToken.borrowBalanceStored(TEST_ADDRESS);
//         console.log(debtAmount);
//         return debtAmount;
//     }

//     function formatAmount(amount: bigint): string {
//         return ethers.formatUnits(String(amount), 6);
//     }

//     async function borrow(tokenAddress: string) {
//         const mToken = new ethers.Contract(tokenAddress, MErc20DelegatorAbi, impersonatedSigner);
//         const tx = await mToken.borrow(ethers.parseUnits("1", 6));
//         const result = await tx.wait();
//         console.log("result:", result);
//         await getDebtAmount(mUSDC_ADDRESS);
//     }

//     this.beforeEach(async () => {
//         impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);

//         const { debtSwap } = await loadFixture(deployContractFixture);
//         deployedContractAddress = await debtSwap.getAddress();

//         myContract = await ethers.getContractAt(
//             "DebtSwap",
//             deployedContractAddress,
//             impersonatedSigner,
//         );
//     });

//     it("should return current debt amount", async function () {
//         await getDebtAmount(mUSDC_ADDRESS);
//         await myContract.moonwellBorrow(mUSDC_ADDRESS, ethers.parseUnits("1", 6));
//         await getDebtAmount(mUSDC_ADDRESS);
//     });
// });
