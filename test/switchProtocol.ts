import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
const { expect } = require("chai");
import { ethers } from "hardhat";

const aaveV3PoolJson = require("../externalAbi/aaveV3/aaveV3Pool.json");
import cometAbi from "../externalAbi/compound/comet.json";
import "dotenv/config";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap } from "../typechain-types";

import { approve, deployContractFixture, formatAmount, getAmountInMax } from "./utils";
import { Contract, MaxUint256 } from "ethers";
import {
    USDC_ADDRESS,
    USDbC_ADDRESS,
    TEST_ADDRESS,
    USDC_hyUSD_POOL,
    ETH_USDbC_POOL,
    AAVE_V3_POOL_ADDRESS,
    Protocols,
    cbETH_ADDRESS,
} from "./constants";

import { AaveV3Helper } from "./protocols/aaveV3";
import { cometAddressMap, CompoundHelper, USDC_COMET_ADDRESS } from "./protocols/compound";

describe("Protocol Switch", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;

    let deployedContractAddress: string;
    let aaveV3Helper: AaveV3Helper;
    let compoundHelper: CompoundHelper;

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);
        aaveV3Helper = new AaveV3Helper(impersonatedSigner);
        compoundHelper = new CompoundHelper(impersonatedSigner);

        const { debtSwap } = await loadFixture(deployContractFixture);
        deployedContractAddress = await debtSwap.getAddress();

        myContract = await ethers.getContractAt(
            "DebtSwap",
            deployedContractAddress,
            impersonatedSigner,
        );
    });

    async function executeDebtSwap(
        flashloanPool: string,
        fromTokenAddress: string,
        toTokenAddress: string,
        fromProtocol: Protocols,
        toProtocol: Protocols,
    ) {
        const beforeAaveDebt = await aaveV3Helper.getDebtAmount(fromTokenAddress);
        const beforeCompoundDebt = await compoundHelper.getDebtAmount(fromTokenAddress);

        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
        const usdcBalance = await usdcContract.balanceOf(TEST_ADDRESS);

        const cbethContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, impersonatedSigner);
        const cbethBalance = await cbethContract.balanceOf(TEST_ADDRESS);

        const debtAmountSwitchedFrom =
            fromProtocol == Protocols.AAVE_V3 ? beforeAaveDebt : beforeCompoundDebt;
        console.log(`${fromProtocol} Debt Amount:`, debtAmountSwitchedFrom);

        await approve(cbETH_ADDRESS, USDC_COMET_ADDRESS, impersonatedSigner);

        const collateralAmount =
            fromProtocol == Protocols.AAVE_V3
                ? await aaveV3Helper.getCollateralAmount(cbETH_ADDRESS)
                : await compoundHelper.getCollateralAmount(USDC_COMET_ADDRESS);
        console.log("collateralAmount:", ethers.formatEther(collateralAmount));

        await compoundHelper.allow(fromTokenAddress, deployedContractAddress);

        let fromExtraData = "0x";
        let toExtraData = "0x";
        if (fromProtocol == Protocols.AAVE_V3) {
            const aTokenAddress = await aaveV3Helper.getATokenAddress(cbETH_ADDRESS);
            console.log("aTokenAddress:", aTokenAddress);
            await approve(aTokenAddress, deployedContractAddress, impersonatedSigner);

            fromExtraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256"],
                [aTokenAddress, cbETH_ADDRESS, collateralAmount],
            );
        } else if (fromProtocol == Protocols.COMPOUND) {
            fromExtraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256"],
                [USDC_COMET_ADDRESS, cbETH_ADDRESS, collateralAmount],
            );
        }

        if (toProtocol == Protocols.AAVE_V3) {
            await approve(cbETH_ADDRESS, deployedContractAddress, impersonatedSigner);
            await aaveV3Helper.approveDelegation(USDC_ADDRESS, deployedContractAddress);

            toExtraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [cbETH_ADDRESS, collateralAmount],
            );
        } else if (toProtocol == Protocols.COMPOUND) {
            toExtraData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256"],
                [USDC_COMET_ADDRESS, cbETH_ADDRESS, collateralAmount],
            );
        }

        const tx = await myContract.executeDebtSwap(
            flashloanPool,
            fromProtocol,
            toProtocol,
            fromTokenAddress,
            toTokenAddress,
            debtAmountSwitchedFrom,
            getAmountInMax(debtAmountSwitchedFrom),
            fromExtraData,
            toExtraData,
        );
        await tx.wait();

        const afterAaveDebt = await aaveV3Helper.getDebtAmount(fromTokenAddress);
        const afterCompoundDebt = await compoundHelper.getDebtAmount(fromTokenAddress);

        const usdcBalanceAfter = await usdcContract.balanceOf(TEST_ADDRESS);
        const cbethBalanceAfter = await cbethContract.balanceOf(TEST_ADDRESS);

        console.log(
            `Aave Debt Amount:`,
            formatAmount(beforeAaveDebt),
            " -> ",
            formatAmount(afterAaveDebt),
        );
        console.log(
            `Compound Debt Amount:`,
            formatAmount(beforeCompoundDebt),
            " -> ",
            formatAmount(afterCompoundDebt),
        );

        expect(usdcBalanceAfter).to.be.equal(usdcBalance);
        expect(cbethBalanceAfter).to.be.equal(cbethBalance);
    }

    it("should switch USDC debt from Aave to Compound", async function () {
        await aaveV3Helper.supply(cbETH_ADDRESS);
        await aaveV3Helper.borrow(USDC_ADDRESS);

        await executeDebtSwap(
            USDC_hyUSD_POOL,
            USDC_ADDRESS,
            USDC_ADDRESS,
            Protocols.AAVE_V3,
            Protocols.COMPOUND,
        );
    });

    it("should switch USDC debt from Compound to Aave", async function () {
        await compoundHelper.supply(USDC_COMET_ADDRESS);
        await compoundHelper.borrow(USDC_ADDRESS);

        await approve(USDC_ADDRESS, USDC_COMET_ADDRESS, impersonatedSigner);

        await executeDebtSwap(
            USDC_hyUSD_POOL,
            USDC_ADDRESS,
            USDC_ADDRESS,
            Protocols.COMPOUND,
            Protocols.AAVE_V3,
        );
    });

    // it("should switch USDC debt on Aave to USDbC on Compound", async function () {
    //     await aaveV3Helper.supply(cbETH_ADDRESS);
    //     await aaveV3Helper.borrow(USDC_ADDRESS);

    //     await approve(USDC_ADDRESS, USDC_COMET_ADDRESS, impersonatedSigner);

    //     await executeDebtSwap(
    //         USDC_hyUSD_POOL,
    //         USDC_ADDRESS,
    //         USDbC_ADDRESS,
    //         Protocols.AAVE_V3,
    //         Protocols.COMPOUND,
    //     );
    // });
});
