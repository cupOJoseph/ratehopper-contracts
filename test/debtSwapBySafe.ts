import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();
import Safe, { Eip1193Provider, RequestArguments } from "@safe-global/protocol-kit";
import {
    cbBTC_ADDRESS,
    cbETH_ADDRESS,
    DAI_ADDRESS,
    DAI_USDC_POOL,
    DEFAULT_SUPPLY_AMOUNT,
    EURC_ADDRESS,
    Protocols,
    sUSDS_ADDRESS,
    TEST_ADDRESS,
    TEST_FEE_BENEFICIARY_ADDRESS,
    USDbC_ADDRESS,
    USDC_ADDRESS,
    USDC_hyUSD_POOL,
} from "./constants";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import cometAbi from "../externalAbi/compound/comet.json";
import morphoAbi from "../externalAbi/morpho/morpho.json";
import { MetaTransactionData, OperationType } from "@safe-global/types-kit";
import { MaxUint256 } from "ethers";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { fundETH, getDecimals, getParaswapData, protocolHelperMap } from "./utils";
import { FLUID_cbETH_EURC_VAULT, FLUID_cbETH_USDC_VAULT, FluidHelper } from "./protocols/fluid";
import { cometAddressMap } from "./protocols/compound";
import { MORPHO_ADDRESS, morphoMarket1Id, morphoMarket2Id } from "./protocols/morpho";
import FluidVaultAbi from "../externalAbi/fluid/fluidVaultT1.json";
import aaveDebtTokenJson from "../externalAbi/aaveV3/aaveDebtToken.json";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { deploySafeContractFixture } from "./deployUtils";

export const eip1193Provider: Eip1193Provider = {
    request: async (args: RequestArguments) => {
        const { method, params } = args;
        return ethers.provider.send(method, Array.isArray(params) ? params : []);
    },
};

export const safeAddress = "0x2f9054Eb6209bb5B94399115117044E4f150B2De";

describe("Safe wallet should debtSwap", function () {
    // Increase timeout for memory-intensive operations
    this.timeout(300000); // 5 minutes

    const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, ethers.provider);
    let safeWallet;
    let safeModuleContract;
    let safeModuleAddress;

    this.beforeEach(async () => {
        safeWallet = await Safe.init({
            provider: eip1193Provider,
            signer: process.env.PRIVATE_KEY,
            safeAddress: safeAddress,
        });

        const safeModule = await loadFixture(deploySafeContractFixture);
        safeModuleContract = safeModule;
        safeModuleAddress = await safeModuleContract.getAddress();

        await fundETH(safeAddress);
        await enableSafeModule();
    });

    async function enableSafeModule() {
        const enableModuleTx = await safeWallet.createEnableModuleTx(safeModuleAddress);
        const safeTxHash = await safeWallet.executeTransaction(enableModuleTx);
        console.log("Safe enable module transaction");

        console.log("Modules:", await safeWallet.getModules());
    }

    this.afterEach(async () => {
        // Force garbage collection to free memory
        if (global.gc) {
            global.gc();
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
    });

    async function sendCollateralToSafe() {
        const cbETHContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, signer);
        const tx = await cbETHContract.transfer(safeAddress, ethers.parseEther("0.001"));
        await tx.wait();
    }

    async function supplyAndBorrow(protocol: Protocols, debtTokenAddress = USDC_ADDRESS) {
        await sendCollateralToSafe();
        const Helper = protocolHelperMap.get(protocol)!;
        const helper = new Helper(signer);

        const protocolCallData = await helper.getSupplyAndBorrowTxdata(debtTokenAddress);

        const tokenContract = new ethers.Contract(debtTokenAddress, ERC20_ABI, signer);

        const decimals = await getDecimals(debtTokenAddress);

        const transferTransactionData: MetaTransactionData = {
            to: debtTokenAddress,
            value: "0",
            data: tokenContract.interface.encodeFunctionData("transfer", [
                TEST_ADDRESS,
                ethers.parseUnits("1", decimals),
            ]),
            operation: OperationType.Call,
        };

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [...protocolCallData, transferTransactionData],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log(`Supplied and borrowed on protocol: ${protocol}`);

        const tokenBalance = await tokenContract.balanceOf(safeAddress);
        console.log("Token Balance on Safe:", ethers.formatUnits(tokenBalance, decimals));

        const userTokenBalance = await tokenContract.balanceOf(TEST_ADDRESS);
        console.log("Token Balance on user:", ethers.formatUnits(userTokenBalance, decimals));
    }

    async function supplyAndBorrowOnFluid() {
        await sendCollateralToSafe();
        const cbETHContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, signer);

        const approveTransactionData: MetaTransactionData = {
            to: cbETH_ADDRESS,
            value: "0",
            data: cbETHContract.interface.encodeFunctionData("approve", [
                FLUID_cbETH_USDC_VAULT,
                ethers.parseEther("1"),
            ]),
            operation: OperationType.Call,
        };

        const fluidVault = new ethers.Contract(FLUID_cbETH_USDC_VAULT, FluidVaultAbi, signer);

        const supplyTransactionData: MetaTransactionData = {
            to: FLUID_cbETH_USDC_VAULT,
            value: "0",
            data: fluidVault.interface.encodeFunctionData("operate", [
                0,
                ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
                0,
                safeAddress,
            ]),
            operation: OperationType.Call,
        };

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [approveTransactionData, supplyTransactionData],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log(`Supplied on Fluid`);

        const fluidHelper = new FluidHelper(signer);
        const nftId = await fluidHelper.getNftId(FLUID_cbETH_USDC_VAULT, safeAddress);

        const borrowTransactionData: MetaTransactionData = {
            to: FLUID_cbETH_USDC_VAULT,
            value: "0",
            data: fluidVault.interface.encodeFunctionData("operate", [
                nftId,
                0,
                ethers.parseUnits("1", 6),
                safeAddress,
            ]),
            operation: OperationType.Call,
        };

        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

        const transferTransactionData: MetaTransactionData = {
            to: USDC_ADDRESS,
            value: "0",
            data: usdcContract.interface.encodeFunctionData("transfer", [TEST_ADDRESS, ethers.parseUnits("1", 6)]),
            operation: OperationType.Call,
        };

        const safeTransactionBorrow = await safeWallet.createTransaction({
            transactions: [borrowTransactionData, transferTransactionData],
        });

        const safeTxHashBorrow = await safeWallet.executeTransaction(safeTransactionBorrow);
        console.log(`Borrowed on Fluid`);
    }
    describe("switch In", function () {
        it.only("Aave from USDC to USDbC", async function () {
            await supplyAndBorrow(Protocols.AAVE_V3);

            await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDbC_ADDRESS, Protocols.AAVE_V3, Protocols.AAVE_V3);
        });
        // USDbC is not available on Compound anymore
        it.skip("Compound from USDC to USDbC", async function () {
            await supplyAndBorrow(Protocols.COMPOUND);
            await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDbC_ADDRESS, Protocols.COMPOUND, Protocols.COMPOUND);
        });

        it("In Morpho USDC another market", async function () {
            await supplyAndBorrow(Protocols.MORPHO);
            await executeDebtSwap(
                USDC_hyUSD_POOL,
                USDC_ADDRESS,
                USDC_ADDRESS,
                Protocols.MORPHO,
                Protocols.MORPHO,
                cbETH_ADDRESS,
                {
                    morphoFromMarketId: morphoMarket1Id,
                    morphoToMarketId: morphoMarket2Id,
                },
            );
        });

        it("In Moonwell from USDC to DAI", async function () {
            await supplyAndBorrow(Protocols.MOONWELL);
            await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, DAI_ADDRESS, Protocols.MOONWELL, Protocols.MOONWELL);
        });

        // TODO: got 'No routes found with enough liquidity' error from paraswap API. need to figure out why
        it.skip("In Fluid from USDC to sUSDS with cbBTC collateral", async function () {
            await supplyAndBorrowOnFluid();
            await executeDebtSwap(
                USDC_hyUSD_POOL,
                USDC_ADDRESS,
                sUSDS_ADDRESS,
                Protocols.FLUID,
                Protocols.FLUID,
                cbBTC_ADDRESS,
            );
        });

        it("In Fluid from USDC to EURC with cbETH collateral", async function () {
            await supplyAndBorrowOnFluid();
            await executeDebtSwap(
                USDC_hyUSD_POOL,
                USDC_ADDRESS,
                EURC_ADDRESS,
                Protocols.FLUID,
                Protocols.FLUID,
                cbETH_ADDRESS,
                {
                    fluidVaultAddress: FLUID_cbETH_EURC_VAULT,
                },
            );
        });
    });

    it("from Compound to Moonwell", async function () {
        await supplyAndBorrow(Protocols.COMPOUND);
        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.COMPOUND, Protocols.MOONWELL);
    });

    it("from Moonwell to Compound", async function () {
        await supplyAndBorrow(Protocols.MOONWELL);
        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.MOONWELL, Protocols.COMPOUND);
    });

    it("from Fluid to Moonwell", async function () {
        await supplyAndBorrowOnFluid();
        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.FLUID, Protocols.MOONWELL);
    });

    it("from Fluid to Aave", async function () {
        await supplyAndBorrowOnFluid();
        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.FLUID, Protocols.AAVE_V3);
    });

    it("from Fluid to Morpho", async function () {
        await supplyAndBorrowOnFluid();
        await executeDebtSwap(
            USDC_hyUSD_POOL,
            USDC_ADDRESS,
            USDC_ADDRESS,
            Protocols.FLUID,
            Protocols.MORPHO,
            cbETH_ADDRESS,
            {
                morphoToMarketId: morphoMarket2Id,
            },
        );
    });

    it("from Fluid to Compound", async function () {
        await supplyAndBorrowOnFluid();
        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.FLUID, Protocols.COMPOUND);
    });

    it("from Moonwell to Fluid", async function () {
        await supplyAndBorrow(Protocols.MOONWELL);

        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.MOONWELL, Protocols.FLUID);
    });

    it.skip("from Moonwell DAI to Fluid USDC", async function () {
        await supplyAndBorrow(Protocols.MOONWELL, DAI_ADDRESS);
        await executeDebtSwap(DAI_USDC_POOL, DAI_ADDRESS, USDC_ADDRESS, Protocols.MOONWELL, Protocols.FLUID);
    });

    it("from Moonwell to Aave", async function () {
        await supplyAndBorrow(Protocols.MOONWELL);
        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.MOONWELL, Protocols.AAVE_V3);
    });

    it("from Aave to Moonwell", async function () {
        await supplyAndBorrow(Protocols.AAVE_V3);

        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.AAVE_V3, Protocols.MOONWELL);
    });

    it("from Aave to Moonwell with protocol fee", async function () {
        // set protocol fee
        const signers = await ethers.getSigners();
        const contractByOwner = await ethers.getContractAt("SafeModuleDebtSwap", safeModuleAddress, signers[0]);
        const setTx = await contractByOwner.setProtocolFee(10);
        await setTx.wait();

        const setFeeBeneficiaryTx = await contractByOwner.setFeeBeneficiary(TEST_FEE_BENEFICIARY_ADDRESS);
        await setFeeBeneficiaryTx.wait();

        await supplyAndBorrow(Protocols.AAVE_V3);

        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.AAVE_V3, Protocols.MOONWELL);
    });

    it("Set operator address and Call executeDebtSwap by operator", async function () {
        const safeModuleAddress = await safeModuleContract.getAddress();
        const [_, wallet2] = await ethers.getSigners();
        const safeModule = await ethers.getContractAt("SafeModuleDebtSwap", safeModuleAddress);

        await safeModule.setoperator(wallet2.address);

        await supplyAndBorrow(Protocols.MOONWELL);
        await executeDebtSwap(
            USDC_hyUSD_POOL,
            USDC_ADDRESS,
            USDC_ADDRESS,
            Protocols.MOONWELL,
            Protocols.AAVE_V3,
            cbETH_ADDRESS,
            {
                operator: wallet2,
            },
        );
    });

    it("Revert when calling executeDebtSwap by non operator(wallet3)", async function () {
        const safeModuleAddress = await safeModuleContract.getAddress();
        const [_, wallet2, wallet3] = await ethers.getSigners();
        const safeModule = await ethers.getContractAt("SafeModuleDebtSwap", safeModuleAddress);

        // await safeModule.setoperator(wallet2.address);

        await supplyAndBorrow(Protocols.MOONWELL);
        await expect(
            executeDebtSwap(
                USDC_hyUSD_POOL,
                USDC_ADDRESS,
                USDC_ADDRESS,
                Protocols.MOONWELL,
                Protocols.AAVE_V3,
                cbETH_ADDRESS,
                {
                    operator: wallet3,
                },
            ),
        ).to.be.revertedWith("Caller is not authorized");
    });

    it("revert if flashloan pool is not uniswap v3 pool", async function () {
        await supplyAndBorrow(Protocols.MOONWELL);

        await expect(
            executeDebtSwap(
                USDC_ADDRESS, // Using USDC contract address which doesn't have token0() function
                USDC_ADDRESS,
                USDC_ADDRESS,
                Protocols.MOONWELL,
                Protocols.AAVE_V3,
            ),
        ).to.be.revertedWith("Invalid flashloan pool address");
    });

    async function executeDebtSwap(
        flashloanPool: string,
        fromTokenAddress: string,
        toTokenAddress: string,
        fromProtocol: Protocols,
        toProtocol: Protocols,
        collateralTokenAddress = cbETH_ADDRESS,
        options: {
            morphoFromMarketId?: string;
            morphoToMarketId?: string;
            useMaxAmount?: boolean;
            anotherCollateralTokenAddress?: string;
            operator?: HardhatEthersSigner;
            fluidVaultAddress?: string;
        } = { useMaxAmount: true },
    ) {
        const FromHelper = protocolHelperMap.get(fromProtocol)!;
        const fromHelper = new FromHelper(signer);
        const ToHelper = protocolHelperMap.get(toProtocol)!;
        const toHelper = new ToHelper(signer);

        const safeModuleAddress = await safeModuleContract.getAddress();
        const moduleContract = await ethers.getContractAt(
            "SafeModuleDebtSwap",
            safeModuleAddress,
            options.operator || signer,
        );

        const fromDebtAmountParameter =
            fromProtocol === Protocols.MORPHO ? options!.morphoFromMarketId! : fromTokenAddress;

        const toDebtAmountParameter = toProtocol === Protocols.MORPHO ? options!.morphoToMarketId! : toTokenAddress;

        const srcDebtBefore: bigint = await fromHelper.getDebtAmount(fromDebtAmountParameter, safeAddress);
        const dstDebtBefore: bigint = await toHelper.getDebtAmount(toDebtAmountParameter, safeAddress);

        // get paraswap data
        let paraswapData = {
            srcAmount: BigInt(0),
            swapData: "0x",
        };

        if (fromTokenAddress != toTokenAddress) {
            paraswapData = await getParaswapData(fromTokenAddress, toTokenAddress, safeModuleAddress, srcDebtBefore);
        }

        let fromExtraData = "0x";
        let toExtraData = "0x";

        switch (fromProtocol) {
            case Protocols.AAVE_V3:
                // if switch to another protocol, must give approval for aToken
                if (toProtocol != Protocols.AAVE_V3) {
                    const aTokenAddress = await fromHelper.getATokenAddress(cbETH_ADDRESS);

                    const token = new ethers.Contract(aTokenAddress, ERC20_ABI, signer);

                    const approveTransactionData: MetaTransactionData = {
                        to: aTokenAddress,
                        value: "0",
                        data: token.interface.encodeFunctionData("approve", [
                            safeModuleAddress,
                            ethers.parseEther("1"),
                        ]),
                        operation: OperationType.Call,
                    };

                    const safeApproveTransaction = await safeWallet.createTransaction({
                        transactions: [approveTransactionData],
                    });

                    await safeWallet.executeTransaction(safeApproveTransaction);
                    console.log("Safe transaction: Aave approved");
                }
                break;
            case Protocols.COMPOUND:
                const cometAddress = cometAddressMap.get(fromTokenAddress)!;
                const comet = new ethers.Contract(cometAddress, cometAbi, signer);

                const allowTransactionData: MetaTransactionData = {
                    to: cometAddress,
                    value: "0",
                    data: comet.interface.encodeFunctionData("allow", [safeModuleAddress, true]),
                    operation: OperationType.Call,
                };

                const safeAllowTransaction = await safeWallet.createTransaction({
                    transactions: [allowTransactionData],
                });

                await safeWallet.executeTransaction(safeAllowTransaction);
                console.log("Safe transaction: Compound allow");
                break;
            case Protocols.MORPHO:
                await morphoAuthorizeTxBySafe();

                const borrowShares = await fromHelper.getBorrowShares(options!.morphoFromMarketId!, safeAddress);

                fromExtraData = fromHelper.encodeExtraData(options!.morphoFromMarketId!, borrowShares);
                break;
            case Protocols.FLUID:
                const nftId = await fromHelper.getNftId(FLUID_cbETH_USDC_VAULT, safeAddress);
                fromExtraData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256"],
                    [FLUID_cbETH_USDC_VAULT, nftId],
                );
                break;
        }

        switch (toProtocol) {
            case Protocols.AAVE_V3:
                const debtTokenAddress = await toHelper.getDebtTokenAddress(toTokenAddress);
                const aaveDebtToken = new ethers.Contract(debtTokenAddress, aaveDebtTokenJson, signer);

                const authTransactionData: MetaTransactionData = {
                    to: debtTokenAddress,
                    value: "0",
                    data: aaveDebtToken.interface.encodeFunctionData("approveDelegation", [
                        safeModuleAddress,
                        MaxUint256,
                    ]),
                    operation: OperationType.Call,
                };

                const safeTransaction = await safeWallet.createTransaction({
                    transactions: [authTransactionData],
                });

                const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
                console.log("Safe transaction: Aave  approveDelegation");
                break;
            case Protocols.COMPOUND:
                const cometAddress = cometAddressMap.get(toTokenAddress)!;
                const comet = new ethers.Contract(cometAddress, cometAbi, signer);

                const allowTransactionData: MetaTransactionData = {
                    to: cometAddress,
                    value: "0",
                    data: comet.interface.encodeFunctionData("allow", [safeModuleAddress, true]),
                    operation: OperationType.Call,
                };

                const safeAllowTransaction = await safeWallet.createTransaction({
                    transactions: [allowTransactionData],
                });

                await safeWallet.executeTransaction(safeAllowTransaction);
                console.log("Safe transaction: Compound allow");
                break;
            case Protocols.MORPHO:
                // If fromProtocol is not Morpho, authorize Morpho
                const shouldAuthorizeMorpho = fromProtocol !== Protocols.MORPHO;
                if (shouldAuthorizeMorpho) await morphoAuthorizeTxBySafe();

                const borrowShares = await toHelper.getBorrowShares(options!.morphoToMarketId!, safeAddress);

                toExtraData = toHelper.encodeExtraData(options!.morphoToMarketId!, borrowShares);
                break;
            case Protocols.FLUID:
                const vaultAddress = options.fluidVaultAddress || FLUID_cbETH_USDC_VAULT;
                toExtraData = ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [vaultAddress, 0]);
                break;
        }

        let collateralAmount = ethers.parseEther(DEFAULT_SUPPLY_AMOUNT);
        switch (fromProtocol) {
            case Protocols.MOONWELL:
                collateralAmount = await fromHelper.getCollateralAmount(collateralTokenAddress, safeAddress);
                break;
            case Protocols.MORPHO:
                collateralAmount = await fromHelper.getCollateralAmount(options!.morphoFromMarketId!, safeAddress);
                break;
        }

        // simulate waiting for user's confirmation
        await time.increaseTo((await time.latest()) + 60);

        await moduleContract.executeDebtSwap(
            flashloanPool,
            fromProtocol,
            toProtocol,
            fromTokenAddress,
            toTokenAddress,
            MaxUint256,
            [{ asset: collateralTokenAddress, amount: collateralAmount }],
            safeAddress,
            [fromExtraData, toExtraData],
            paraswapData,
            {
                gasLimit: "2000000",
            },
        );

        const srcDebtAfter = await fromHelper.getDebtAmount(fromDebtAmountParameter, safeAddress);
        const dstDebtAfter = await toHelper.getDebtAmount(toDebtAmountParameter, safeAddress);

        const srcDecimals = await getDecimals(fromTokenAddress);
        const dstDecimals = await getDecimals(toTokenAddress);

        console.log(
            `Source ${fromProtocol}, ${fromTokenAddress} Debt Amount:`,
            ethers.formatUnits(srcDebtBefore, srcDecimals),
            " -> ",
            ethers.formatUnits(srcDebtAfter, srcDecimals),
        );

        console.log(
            `Destination ${toProtocol}, ${toTokenAddress} Debt Amount:`,
            ethers.formatUnits(dstDebtBefore, dstDecimals),
            " -> ",
            ethers.formatUnits(dstDebtAfter, dstDecimals),
        );
    }

    async function morphoAuthorizeTxBySafe() {
        const morphoContract = new ethers.Contract(MORPHO_ADDRESS, morphoAbi, signer);

        const authTransactionData: MetaTransactionData = {
            to: MORPHO_ADDRESS,
            value: "0",
            data: morphoContract.interface.encodeFunctionData("setAuthorization", [safeModuleAddress, true]),
            operation: OperationType.Call,
        };

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [authTransactionData],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("Safe transaction: setAuthorization");
    }
});
