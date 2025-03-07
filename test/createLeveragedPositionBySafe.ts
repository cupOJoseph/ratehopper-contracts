import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";
import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { LeveragedPosition } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { approve, getDecimals, getParaswapData, protocolHelperMap } from "./utils";
import Safe, { Eip1193Provider, RequestArguments } from "@safe-global/protocol-kit";
import {
    USDC_ADDRESS,
    USDbC_ADDRESS,
    cbETH_ADDRESS,
    TEST_ADDRESS,
    Protocols,
    WETH_ADDRESS,
    DEFAULT_SUPPLY_AMOUNT,
    cbETH_ETH_POOL,
    cbBTC_ADDRESS,
    cbBTC_USDC_POOL,
    USDC_hyUSD_POOL,
} from "./constants";
import { MaxUint256 } from "ethers";
import { deployLeveragedPositionContractFixture } from "./deployUtils";
import { mcbETH, mContractAddressMap, MoonwellHelper } from "./protocols/moonwell";
import { eip1193Provider, safeAddress } from "./debtSwapBySafe";
import { MetaTransactionData, OperationType } from "@safe-global/types-kit";

describe.only("Create leveraged position by Safe", function () {
    let myContract: LeveragedPosition;
    let impersonatedSigner: HardhatEthersSigner;

    let deployedContractAddress: string;

    const defaultTargetSupplyAmount = "0.002";
    const cbBTCPrincipleAmount = 0.00006;

    let safeWallet;

    this.beforeEach(async () => {
        impersonatedSigner = await ethers.getImpersonatedSigner(TEST_ADDRESS);

        const leveragedPosition = await loadFixture(deployLeveragedPositionContractFixture);
        deployedContractAddress = await leveragedPosition.getAddress();

        myContract = await ethers.getContractAt("LeveragedPosition", deployedContractAddress, impersonatedSigner);

        safeWallet = await Safe.init({
            provider: eip1193Provider,
            signer: process.env.PRIVATE_KEY,
            safeAddress: safeAddress,
        });
    });

    async function setSafeOwner() {
        const enableModuleTx = await safeWallet.createEnableModuleTx(
            deployedContractAddress,
            // options // Optional
        );
        const safeTxHash = await safeWallet.executeTransaction(enableModuleTx);
        console.log("Safe enable module transaction");

        console.log("Modules:", await safeWallet.getModules());

        // const setSafeTransactionData: MetaTransactionData = {
        //     to: deployedContractAddress,
        //     value: "0",
        //     data: myContract.interface.encodeFunctionData("setSafe", []),
        //     operation: OperationType.Call,
        // };

        // const safeTransaction = await safeWallet.createTransaction({
        //     transactions: [setSafeTransactionData],
        // });
        // const setSafeTxHash = await safeWallet.executeTransaction(safeTransaction);
        // console.log("Safe setSafe transaction");
    }

    async function createLeveragedPosition(
        flashloanPool: string,
        protocol: Protocols,
        collateralAddress = cbETH_ADDRESS,
        debtTokenAddress = USDC_ADDRESS,
        principleAmount = Number(DEFAULT_SUPPLY_AMOUNT),
        targetAmount = Number(defaultTargetSupplyAmount),
        morphoMarketId?: string,
    ) {
        await setSafeOwner();

        const Helper = protocolHelperMap.get(protocol)!;
        const protocolHelper = new Helper(impersonatedSigner);

        const cbETHContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, impersonatedSigner);

        const debtAsset = debtTokenAddress || USDC_ADDRESS;

        const collateralDecimals = await getDecimals(collateralAddress);
        const debtDecimals = await getDecimals(debtAsset);

        let extraData = "0x";

        switch (protocol) {
            case Protocols.MOONWELL:
                const mContract = mContractAddressMap.get(debtAsset)!;
                extraData = ethers.AbiCoder.defaultAbiCoder().encode(["address", "address[]"], [mContract, [mcbETH]]);
                break;
        }

        const parsedTargetAmount = ethers.parseUnits(targetAmount.toString(), collateralDecimals);

        const diffAmount = parsedTargetAmount - ethers.parseUnits(principleAmount.toString(), collateralDecimals);

        const [srcAmount, paraswapData] = await getParaswapData(
            collateralAddress,
            debtAsset,
            deployedContractAddress,
            diffAmount,
        );

        // add 2% slippage(must be set by user)
        const amountPlusSlippage = (BigInt(srcAmount) * 1200n) / 1000n;

        // send collateral token to safe
        const tx = await cbETHContract.transfer(safeAddress, ethers.parseEther("0.001"));
        await tx.wait();

        const approveTransactionData: MetaTransactionData = {
            to: collateralAddress,
            value: "0",
            data: cbETHContract.interface.encodeFunctionData("approve", [
                deployedContractAddress,
                ethers.parseEther("1"),
            ]),
            operation: OperationType.Call,
        };

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [approveTransactionData],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log(safeTxHash);

        const createTransactionData: MetaTransactionData = {
            to: deployedContractAddress,
            value: "0",
            data: myContract.interface.encodeFunctionData("createLeveragedPosition", [
                flashloanPool,
                protocol,
                collateralAddress,
                ethers.parseUnits(principleAmount.toString(), collateralDecimals),
                parsedTargetAmount,
                debtAsset,
                amountPlusSlippage,
                extraData,
                paraswapData,
            ]),
            operation: OperationType.Call,
        };

        const safeTransaction2 = await safeWallet.createTransaction({
            transactions: [createTransactionData],
        });

        const safeTxHash2 = await safeWallet.executeTransaction(safeTransaction2);
        console.log(safeTxHash2);

        const debtAmount = await protocolHelper.getDebtAmount(debtAsset);
        console.log("debtAmount: ", ethers.formatUnits(debtAmount, debtDecimals));

        const collateralAmount = await protocolHelper.getCollateralAmount(mcbETH, safeAddress);

        console.log("collateralAmount: ", ethers.formatUnits(collateralAmount, collateralDecimals));

        expect(debtAmount).to.be.gt(0);
        expect(Number(collateralAmount)).to.be.equal(parsedTargetAmount);

        const collateralToken = new ethers.Contract(collateralAddress, ERC20_ABI, impersonatedSigner);
        const collateralRemainingBalance = await collateralToken.balanceOf(deployedContractAddress);
        expect(Number(collateralRemainingBalance)).to.be.equal(0);

        const debtToken = new ethers.Contract(debtAsset, ERC20_ABI, impersonatedSigner);
        const debtRemainingBalance = await debtToken.balanceOf(deployedContractAddress);
        expect(Number(debtRemainingBalance)).to.be.equal(0);
    }

    describe("on Moonwell", function () {
        it("with cbETH collateral", async function () {
            await createLeveragedPosition(cbETH_ETH_POOL, Protocols.MOONWELL);
        });
    });
});
