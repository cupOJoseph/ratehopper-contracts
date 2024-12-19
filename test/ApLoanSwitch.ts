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
  const USDT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
  const USDCe_ADDRESS = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
  const aaveV3PoolAddress = "0x794a61358d6845594f94dc1db02a252b5b4814ad";
  const usdtDebtToken = "0xfb00ac187a8eb5afae4eace434f493eb62672df7";
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
      "0xfb00ac187a8eb5afae4eace434f493eb62672df7",
      "0xaeB318360f27748Acb200CE616E389A6C9409a07",
      "0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf"
    );

    return {
      apLoanSwitch,
    };
  }

  async function approveUSDT() {
    const usdt = new ethers.Contract(
      USDT_ADDRESS,
      ERC20_ABI,
      impersonatedSigner
    );
    const approveTx = await usdt.approve(deployedContractAddress, "10000");
    await approveTx.wait();
    // console.log("approveTx:", approveTx);
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

  it("Should getUserData", async function () {
    const data = await myContract.getUserData(testAddress);
    console.log(data);
  });

  it.only("Should compound v3 borrow", async function () {
    const cometExt = new ethers.Contract(
      "0x2F4eAF29dfeeF4654bD091F7112926E108eF4Ed0",
      cometExtJson,
      impersonatedSigner
    );

    const allowResult = await cometExt.allow(deployedContractAddress, true);
    await allowResult.wait();

    const comet = new ethers.Contract(
      "0xaeb318360f27748acb200ce616e389a6c9409a07",
      cometJson,
      impersonatedSigner
    );

    const permission = await comet.hasPermission(
      testAddress,
      deployedContractAddress
    );

    // TODO: this should be true. it seems a bug in their upgraded contract
    console.log("permission: ", permission);

    // const borrowAmount = ethers.parseUnits("1", 6);

    // const result = await myContract.compoundV3Withdraw(
    //   USDT_ADDRESS,
    //   borrowAmount
    // );
    // console.log("result:", result);
  });

  it("should aave v3 supply", async function () {
    await approveUSDT();

    const result = await myContract.aaveV3Supply(USDT_ADDRESS, "1000");
    // console.log("result:", result);
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

    const result = await myContract.aaveV3Withdraw(USDCe_ADDRESS, "100");

    console.log("result:", result);
  });

  it("should aave v3 borrow", async function () {
    const aaveUSDTDebtToken = new ethers.Contract(
      usdtDebtToken,
      aaveDebtTokenJson,
      impersonatedSigner
    );

    const amount = "1000";

    const tx = await aaveUSDTDebtToken.approveDelegation(
      deployedContractAddress,
      amount
    );
    const approveResult = await tx.wait();
    console.log(approveResult);

    const result = await myContract.aaveV3Borrow(USDT_ADDRESS, amount);

    // console.log("result:", result);
  });

  it("should aave v3 repay", async function () {
    await approveUSDT();

    const result = await myContract.aaveV3Repay(USDT_ADDRESS, "10000");

    const tx = await result.wait();
    // console.log("tx:", tx);
  });

  it("should aave v2 deposit", async function () {
    await approveUSDT();

    const result = await myContract.aaveV2Supply(USDT_ADDRESS, "100");

    const tx = await result.wait();
    // console.log("tx:", tx);
  });

  it("should aaveCollateralSwitch", async function () {
    await approveUSDT();

    const USDCe = new ethers.Contract(
      USDCe_ADDRESS,
      ERC20_ABI,
      impersonatedSigner
    );
    const approveTx = await USDCe.approve(deployedContractAddress, "100");
    await approveTx.wait();

    const aToken = new ethers.Contract(
      "0x625e7708f30ca75bfd92586e17077590c60eb4cd", // aPOLUSDC
      aaveATokenJson,
      impersonatedSigner
    );

    const tx = await aToken.transfer(deployedContractAddress, "100");
    await tx.wait();

    const result = await myContract.aaveCollateralSwitch(
      USDT_ADDRESS,
      USDCe_ADDRESS,
      "100"
    );
  });

  it("Should call flashloan", async function () {
    const aaveV3Pool = new ethers.Contract(
      aaveV3PoolAddress,
      aaveV3PoolJson,
      impersonatedSigner
    );

    const usdt = new ethers.Contract(
      USDT_ADDRESS,
      ERC20_ABI,
      impersonatedSigner
    );

    await approveUSDT();

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
      USDT_ADDRESS,
      "1000",
      encodedParams,
      0
    );
  });
});
