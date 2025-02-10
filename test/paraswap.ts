import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";
const aaveV3PoolJson = require("../externalAbi/aaveV3/aaveV3Pool.json");

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { approve, deployContractFixture, formatAmount, getAmountInMax, getParaswapData, wrapETH } from "./utils";
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
    WETH_ADDRESS,
    DEFAULT_SUPPLY_AMOUNT,
} from "./constants";
import { AaveV3Helper } from "./protocols/aaveV3";
import { constructSimpleSDK, SwapSide } from "@paraswap/sdk";
import axios from "axios";
import { cometAddressMap, CompoundHelper } from "./protocols/compound";

describe("ParaSwap", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;
    let deployedContractAddress: string;

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);

        const { debtSwap } = await loadFixture(deployContractFixture);
        deployedContractAddress = await debtSwap.getAddress();

        myContract = await ethers.getContractAt("DebtSwap", deployedContractAddress, impersonatedSigner);
    });

    it("should execute token swap", async function () {
        const aaveV3Helper = new AaveV3Helper(impersonatedSigner);
        await aaveV3Helper.supply(cbETH_ADDRESS);
        await aaveV3Helper.borrow(USDC_ADDRESS);

        const collateralToken = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, impersonatedSigner);
        const collateralBalance = await aaveV3Helper.getCollateralAmount(cbETH_ADDRESS);

        const compoundHelper = new CompoundHelper(impersonatedSigner);
        await compoundHelper.allow(USDbC_ADDRESS, deployedContractAddress);

        const toCometAddress = cometAddressMap.get(USDbC_ADDRESS)!;
        const toExtraData = compoundHelper.encodeExtraData(toCometAddress);

        const aTokenAddress = await aaveV3Helper.getATokenAddress(cbETH_ADDRESS);
        await approve(aTokenAddress, deployedContractAddress, impersonatedSigner);

        // suppose flashloan fee is 0.01%, must be fetched dynamically
        const debtAmountPlusFee = 1 + 1 * 0.0001;
        const amount = ethers.parseUnits(debtAmountPlusFee.toString(), 6).toString();

        const { router, tokenTransferProxy, swapData } = await getParaswapData(
            USDC_ADDRESS,
            USDbC_ADDRESS,
            deployedContractAddress,
            amount,
        );

        const tx = await myContract.executeDebtSwap(
            USDC_hyUSD_POOL,
            Protocols.AAVE_V3,
            Protocols.COMPOUND,
            USDC_ADDRESS,
            USDbC_ADDRESS,
            MaxUint256,
            100,
            [{ asset: cbETH_ADDRESS, amount: collateralBalance }],
            "0x",
            toExtraData,
            {
                router,
                tokenTransferProxy,
                swapData,
            },
        );
        await tx.wait();
    });
});
