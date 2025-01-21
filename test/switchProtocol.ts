import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";

import "dotenv/config";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap } from "../typechain-types";
import morphoAbi from "../externalAbi/morpho/morpho.json";

import {
    approve,
    deployContractFixture,
    formatAmount,
    getAmountInMax,
    protocolHelperMap,
} from "./utils";
import {
    USDC_ADDRESS,
    USDbC_ADDRESS,
    TEST_ADDRESS,
    USDC_hyUSD_POOL,
    ETH_USDbC_POOL,
    Protocols,
    cbETH_ADDRESS,
} from "./constants";

import { AaveV3Helper } from "./protocols/aaveV3";
import { cometAddressMap, CompoundHelper, USDC_COMET_ADDRESS } from "./protocols/compound";
import { MORPHO_ADDRESS, MorphoHelper, morphoMarket1Id } from "./protocols/morpho";
import { MaxUint256 } from "ethers";

describe("Protocol Switch", function () {
    let myContract: DebtSwap;
    let impersonatedSigner: HardhatEthersSigner;

    let deployedContractAddress: string;
    let aaveV3Helper: AaveV3Helper;
    let compoundHelper: CompoundHelper;
    let morphoHelper: MorphoHelper;

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);
        aaveV3Helper = new AaveV3Helper(impersonatedSigner);
        compoundHelper = new CompoundHelper(impersonatedSigner);
        morphoHelper = new MorphoHelper(impersonatedSigner);

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
        fromMarketId?: string,
        toMarketId?: string,
    ) {
        const FromHelper = protocolHelperMap.get(fromProtocol)!;
        const fromHelper = new FromHelper(impersonatedSigner);
        const ToHelper = protocolHelperMap.get(toProtocol)!;
        const toHelper = new ToHelper(impersonatedSigner);

        const fromDebtAmountParameter =
            fromProtocol === Protocols.MORPHO ? fromMarketId! : fromTokenAddress;
        const beforeFromProtocolDebt = await fromHelper.getDebtAmount(fromDebtAmountParameter);

        const toDebtAmountParameter =
            toProtocol === Protocols.MORPHO ? toMarketId! : toTokenAddress;
        const beforeToProtocolDebt = await toHelper.getDebtAmount(toDebtAmountParameter);

        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
        const usdcBalance = await usdcContract.balanceOf(TEST_ADDRESS);

        const cbethContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, impersonatedSigner);
        const cbethBalance = await cbethContract.balanceOf(TEST_ADDRESS);

        let collateralAmount: bigint;
        switch (fromProtocol) {
            case Protocols.AAVE_V3:
                collateralAmount = await aaveV3Helper.getCollateralAmount(cbETH_ADDRESS);
                break;
            case Protocols.COMPOUND:
                collateralAmount = await compoundHelper.getCollateralAmount(
                    USDC_COMET_ADDRESS,
                    cbETH_ADDRESS,
                );
                break;
            case Protocols.MORPHO:
                collateralAmount = await morphoHelper.getCollateralAmount(fromMarketId!);
                break;
            default:
                throw new Error("Unsupported protocol");
        }
        console.log("collateralAmount:", ethers.formatEther(collateralAmount));

        let fromExtraData = "0x";
        let toExtraData = "0x";

        switch (fromProtocol) {
            case Protocols.AAVE_V3:
                const aTokenAddress = await aaveV3Helper.getATokenAddress(cbETH_ADDRESS);
                await approve(aTokenAddress, deployedContractAddress, impersonatedSigner);

                fromExtraData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256"],
                    [cbETH_ADDRESS, collateralAmount],
                );
                break;
            case Protocols.COMPOUND:
                await compoundHelper.allow(fromTokenAddress, deployedContractAddress);

                const fromCometAddress = cometAddressMap.get(fromTokenAddress)!;
                fromExtraData = compoundHelper.encodeExtraData(fromCometAddress);
                break;

            case Protocols.MORPHO:
                const morphoContract = new ethers.Contract(
                    MORPHO_ADDRESS,
                    morphoAbi,
                    impersonatedSigner,
                );
                await morphoContract.setAuthorization(deployedContractAddress, true);
                const borrowShares = await morphoHelper.getBorrowShares(fromMarketId!);

                fromExtraData = morphoHelper.encodeExtraData(fromMarketId!, borrowShares);
                break;
        }

        switch (toProtocol) {
            case Protocols.AAVE_V3:
                await aaveV3Helper.approveDelegation(toTokenAddress, deployedContractAddress);

                toExtraData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256"],
                    [cbETH_ADDRESS, collateralAmount],
                );
                break;

            case Protocols.COMPOUND:
                await compoundHelper.allow(toTokenAddress, deployedContractAddress);

                const toCometAddress = cometAddressMap.get(toTokenAddress)!;
                toExtraData = compoundHelper.encodeExtraData(toCometAddress);
                break;

            case Protocols.MORPHO:
                const morphoContract = new ethers.Contract(
                    MORPHO_ADDRESS,
                    morphoAbi,
                    impersonatedSigner,
                );
                await morphoContract.setAuthorization(deployedContractAddress, true);
                const borrowShares = await morphoHelper.getBorrowShares(toMarketId!);

                toExtraData = morphoHelper.encodeExtraData(toMarketId!, borrowShares);
                break;
        }

        const tx = await myContract.executeDebtSwap(
            flashloanPool,
            fromProtocol,
            toProtocol,
            fromTokenAddress,
            toTokenAddress,
            MaxUint256,
            ethers.parseUnits("1.01", 4),
            [{ asset: cbETH_ADDRESS, amount: collateralAmount }],
            fromExtraData,
            toExtraData,
        );
        await tx.wait();

        const afterFromProtocolDebt = await fromHelper.getDebtAmount(fromDebtAmountParameter);
        const afterToProtocolDebt = await toHelper.getDebtAmount(toDebtAmountParameter);

        const usdcBalanceAfter = await usdcContract.balanceOf(TEST_ADDRESS);
        const cbethBalanceAfter = await cbethContract.balanceOf(TEST_ADDRESS);

        console.log(
            `Before Protocol ${Protocols[fromProtocol]}, asset: ${fromTokenAddress} Debt Amount:`,
            formatAmount(beforeFromProtocolDebt),
            " -> ",
            formatAmount(afterFromProtocolDebt),
        );

        console.log(
            `To Protocol ${Protocols[toProtocol]}, asset: ${toTokenAddress} Debt Amount:`,
            formatAmount(beforeToProtocolDebt),
            " -> ",
            formatAmount(afterToProtocolDebt),
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
        await compoundHelper.supply(USDC_COMET_ADDRESS, cbETH_ADDRESS);
        await compoundHelper.borrow(USDC_ADDRESS);

        await executeDebtSwap(
            USDC_hyUSD_POOL,
            USDC_ADDRESS,
            USDC_ADDRESS,
            Protocols.COMPOUND,
            Protocols.AAVE_V3,
        );
    });

    it("should switch USDC debt on Aave to USDbC on Compound", async function () {
        await aaveV3Helper.supply(cbETH_ADDRESS);
        await aaveV3Helper.borrow(USDC_ADDRESS);

        await executeDebtSwap(
            USDC_hyUSD_POOL,
            USDC_ADDRESS,
            USDbC_ADDRESS,
            Protocols.AAVE_V3,
            Protocols.COMPOUND,
        );
    });

    it("should switch USDbC debt on Aave to USDC on Compound", async function () {
        await aaveV3Helper.supply(cbETH_ADDRESS);
        await aaveV3Helper.borrow(USDbC_ADDRESS);

        await executeDebtSwap(
            ETH_USDbC_POOL,
            USDbC_ADDRESS,
            USDC_ADDRESS,
            Protocols.AAVE_V3,
            Protocols.COMPOUND,
        );
    });

    it("should switch USDC debt on Aave to USDC on Morpho", async function () {
        await aaveV3Helper.supply(cbETH_ADDRESS);
        await aaveV3Helper.borrow(USDC_ADDRESS);

        await executeDebtSwap(
            USDC_hyUSD_POOL,
            USDC_ADDRESS,
            USDC_ADDRESS,
            Protocols.AAVE_V3,
            Protocols.MORPHO,
            undefined,
            morphoMarket1Id,
        );
    });

    it("should switch USDC debt on Morpho to USDC on Aave", async function () {
        await morphoHelper.supply(cbETH_ADDRESS, morphoMarket1Id);
        await morphoHelper.borrow(morphoMarket1Id);

        await executeDebtSwap(
            USDC_hyUSD_POOL,
            USDC_ADDRESS,
            USDC_ADDRESS,
            Protocols.MORPHO,
            Protocols.AAVE_V3,
            morphoMarket1Id,
            undefined,
        );
    });

    it("should switch USDC debt on Morpho to USDC on Compound", async function () {
        await morphoHelper.supply(cbETH_ADDRESS, morphoMarket1Id);
        await morphoHelper.borrow(morphoMarket1Id);

        await executeDebtSwap(
            USDC_hyUSD_POOL,
            USDC_ADDRESS,
            USDC_ADDRESS,
            Protocols.MORPHO,
            Protocols.COMPOUND,
            morphoMarket1Id,
            undefined,
        );
    });

    it("should switch USDC debt on Morpho to USDbC on Aave", async function () {
        await morphoHelper.supply(cbETH_ADDRESS, morphoMarket1Id);
        await morphoHelper.borrow(morphoMarket1Id);

        await executeDebtSwap(
            USDC_hyUSD_POOL,
            USDC_ADDRESS,
            USDbC_ADDRESS,
            Protocols.MORPHO,
            Protocols.AAVE_V3,
            morphoMarket1Id,
            undefined,
        );
    });
});
