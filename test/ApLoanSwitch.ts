import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
const { expect } = require("chai");
import { ethers } from "hardhat";
import hre from "hardhat";
const aaveDebtTokenJson = require("../externalAbi/aaveDebtToken.json");
const aaveV3PoolJson = require("../externalAbi/aaveV3Pool.json");
const aaveATokenJson = require("../externalAbi/aaveV3AToken.json");
const cometExtJson = require("../externalAbi/cometExt.json");
const cometJson = require("../externalAbi/comet.json");
import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ApLoanSwitch } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";

describe("ApLoanSwitch", function () {
  let myContract: ApLoanSwitch;
  let impersonatedSigner: HardhatEthersSigner;
  let deployedContractAddress: string;
  const USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // Circle
  const USDbC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // Coinbase
  const aaveV3PoolAddress = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
  const debtToken = "0x59dca05b6c26dbd64b5381374aaac5cd05644c28";

  // should be replaced by hardhat test account
  const testAddress = "0x50fe1109188A0B666c4d78908E3E539D73F97E33";

  this.timeout(300000);
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deploAaveV3RouterFixture() {
    // Contracts are deployed using the first signer/account by default
    // const [owner, otherAccount] = await hre.ethers.getSigners();

    const ApLoanSwitch = await hre.ethers.getContractFactory("ApLoanSwitch");
    const apLoanSwitch = await ApLoanSwitch.deploy(
      aaveV3PoolAddress,
      debtToken
    );

    return {
      apLoanSwitch,
    };
  }

  async function approve() {
    const token = new ethers.Contract(
      USDC_ADDRESS,
      ERC20_ABI,
      impersonatedSigner
    );
    const approveTx = await token.approve(deployedContractAddress, "10000");
    await approveTx.wait();
    console.log("approveTx:", approveTx);
  }

  function generatedelegationWithSig() {}

  this.beforeEach(async () => {
    const { apLoanSwitch } = await loadFixture(deploAaveV3RouterFixture);

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [testAddress],
    });

    impersonatedSigner = await ethers.getImpersonatedSigner(testAddress);

    deployedContractAddress = await apLoanSwitch.getAddress();

    myContract = await ethers.getContractAt(
      "ApLoanSwitch",
      deployedContractAddress,
      impersonatedSigner
    );
  });

  it("should aave v3 supply", async function () {
    const token = new ethers.Contract(
      USDC_ADDRESS,
      ERC20_ABI,
      impersonatedSigner
    );

    const balance = await token.balanceOf(testAddress);
    console.log("before balance:", balance);

    await approve();

    const tx = await myContract.aaveV3Supply(USDC_ADDRESS, "1000");
    console.log("tx:", tx);
    const result = await tx.wait();
    console.log("result:", result);

    const afterbalance = await token.balanceOf(testAddress);
    console.log("after balance:", afterbalance);
  });

  it("should aave v3 withdraw", async function () {
    const aToken = new ethers.Contract(
      "0x625e7708f30ca75bfd92586e17077590c60eb4cd", // aPOLUSDC
      aaveATokenJson,
      impersonatedSigner
    );

    const tx = await aToken.transfer(deployedContractAddress, "100");
    // const tx = await aToken.approve(deployedContractAddress, "1000");
    await tx.wait();

    const result = await myContract.aaveV3Withdraw(USDC_ADDRESS, "100");

    console.log("result:", result);
  });

  it.only("should aave v3 borrow", async function () {
    const token = new ethers.Contract(
      USDC_ADDRESS,
      ERC20_ABI,
      impersonatedSigner
    );

    const balance = await token.balanceOf(testAddress);
    console.log("balance:", balance);

    const aaveDebtToken = new ethers.Contract(
      debtToken,
      aaveDebtTokenJson,
      impersonatedSigner
    );

    const amount = "10";

    const tx = await aaveDebtToken.approveDelegation(
      deployedContractAddress,
      amount
    );
    // const approveResult = await tx.wait();
    // console.log(approveResult);

    const borrowTx = await myContract.aaveV3Borrow(USDC_ADDRESS, amount);
    await borrowTx.wait();

    console.log("borrowTx:", borrowTx);

    const afterbalance = await token.balanceOf(testAddress);
    console.log("after balance:", afterbalance);
  });

  it("should aave v3 repay", async function () {
    await approve();

    const result = await myContract.aaveV3Repay(USDC_ADDRESS, "10000");

    const tx = await result.wait();
    // console.log("tx:", tx);
  });

  it("Should call flashloan", async function () {
    const aaveV3Pool = new ethers.Contract(
      aaveV3PoolAddress,
      aaveV3PoolJson,
      impersonatedSigner
    );

    const usdt = new ethers.Contract(
      USDC_ADDRESS,
      ERC20_ABI,
      impersonatedSigner
    );

    await approve();

    // send flashloan fee to contract
    const tx = await usdt.transfer(deployedContractAddress, "50");
    await tx.wait();

    // encode DAI token address as example
    const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address"],
      ["0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063"]
    );

    const result = await aaveV3Pool.flashLoanSimple(
      deployedContractAddress,
      USDC_ADDRESS,
      "1000",
      encodedParams,
      0
    );
  });
});
