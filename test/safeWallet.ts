import { zeroAddress } from "viem";
import { ethers } from "hardhat";
import { MaxInt256, ZeroAddress } from "ethers";
import dotenv from "dotenv";
dotenv.config();
import Safe, {
    Eip1193Provider,
    PredictedSafeProps,
    RequestArguments,
    SafeAccountConfig,
    SafeDeploymentConfig,
    SafeTransactionOptionalProps,
} from "@safe-global/protocol-kit";
import {
    AAVE_V3_POOL_ADDRESS,
    cbETH_ADDRESS,
    DAI_ADDRESS,
    DEFAULT_SUPPLY_AMOUNT,
    Protocols,
    sUSDS_ADDRESS,
    TEST_ADDRESS,
    USDbC_ADDRESS,
    USDC_ADDRESS,
    USDC_hyUSD_POOL,
} from "../test/constants";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import aaveV3PoolJson from "../externalAbi/aaveV3/aaveV3Pool.json";
import ComptrollerAbi from "../externalAbi/moonwell/comptroller.json";
import cometAbi from "../externalAbi/compound/comet.json";
import morphoAbi from "../externalAbi/morpho/morpho.json";
import { MetaTransactionData, OperationType } from "@safe-global/types-kit";
import { MaxUint256 } from "ethers";

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
    approve,
    deployContractFixture,
    deploySafeContractFixture,
    formatAmount,
    getParaswapData,
    protocolHelperMap,
} from "./utils";
import { mcbETH, mDAI, mUSDC } from "./moonwellDebtSwap";
import { COMPTROLLER_ADDRESS, mContractAddressMap, MoonwellHelper } from "./protocols/moonwell";
import { FLUID_cbETH_USDC_VAULT, FluidHelper } from "./protocols/fluid";
import { cometAddressMap, USDC_COMET_ADDRESS } from "./protocols/compound";
import { marketParamsMap, MORPHO_ADDRESS, morphoMarket1Id, morphoMarket2Id } from "./protocols/morpho";
import MErc20DelegatorAbi from "../externalAbi/moonwell/MErc20Delegator.json";
import FluidVaultAbi from "../externalAbi/fluid/fluidVaultT1.json";
import aaveDebtTokenJson from "../externalAbi/aaveV3/aaveDebtToken.json";

export const eip1193Provider: Eip1193Provider = {
    request: async (args: RequestArguments) => {
        const { method, params } = args;
        return ethers.provider.send(method, Array.isArray(params) ? params : []);
    },
};

describe.only("Safe wallet", function () {
    const safeAddress = "0x2f9054Eb6209bb5B94399115117044E4f150B2De";

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

        const { safeModule } = await loadFixture(deploySafeContractFixture);
        safeModuleContract = safeModule;
        safeModuleAddress = await safeModuleContract.getAddress();

        await fundETH();
        await setSafeOwner();
    });

    async function fundETH() {
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, ethers.provider); // Replace with a funded Hardhat account

        const tx = await wallet.sendTransaction({
            to: safeAddress,
            value: ethers.parseEther("0.001"),
        });

        console.log("Transaction Hash:", tx.hash);

        const balance = await ethers.provider.getBalance(safeAddress);
        console.log(`Balance:`, ethers.formatEther(balance), "ETH");
    }

    async function setSafeOwner() {
        const enableModuleTx = await safeWallet.createEnableModuleTx(
            safeModuleAddress,
            // options // Optional
        );
        const safeTxHash = await safeWallet.executeTransaction(enableModuleTx);
        console.log("Safe enable module transaction hash:", safeTxHash);

        console.log("Modules:", await safeWallet.getModules());

        const moduleContract = await ethers.getContractAt("SafeModule", safeModuleAddress, signer);

        const setSafeTransactionData: MetaTransactionData = {
            to: safeModuleAddress,
            value: "0",
            data: moduleContract.interface.encodeFunctionData("setSafe", []),
            operation: OperationType.Call,
        };

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [setSafeTransactionData],
        });
        const setSafeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("Safe setSafe transaction hash:", setSafeTxHash);
    }

    async function supplyAndBorrowOnMoonwell() {
        const cbETHContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, signer);
        const tx = await cbETHContract.transfer(safeAddress, ethers.parseEther("0.001"));
        await tx.wait();

        const balance = await cbETHContract.balanceOf(safeAddress);
        console.log(`Balance:`, ethers.formatEther(balance), "cbETH");

        const approveTransactionData: MetaTransactionData = {
            to: cbETH_ADDRESS,
            value: "0",
            data: cbETHContract.interface.encodeFunctionData("approve", [mcbETH, ethers.parseEther("1")]),
            operation: OperationType.Call,
        };

        const cbETHmToken = new ethers.Contract(mcbETH, MErc20DelegatorAbi, signer);

        const supplyTransactionData: MetaTransactionData = {
            to: mcbETH,
            value: "0",
            data: cbETHmToken.interface.encodeFunctionData("mint", [ethers.parseEther(DEFAULT_SUPPLY_AMOUNT)]),
            operation: OperationType.Call,
        };

        const comptroller = new ethers.Contract(COMPTROLLER_ADDRESS, ComptrollerAbi, signer);

        const enableTransactionData: MetaTransactionData = {
            to: COMPTROLLER_ADDRESS,
            value: "0",
            data: comptroller.interface.encodeFunctionData("enterMarkets", [[mcbETH]]),
            operation: OperationType.Call,
        };

        const USDCmToken = new ethers.Contract(mUSDC, MErc20DelegatorAbi, signer);

        const borrowTransactionData: MetaTransactionData = {
            to: mUSDC,
            value: "0",
            data: USDCmToken.interface.encodeFunctionData("borrow", [ethers.parseUnits("1", 6)]),
            operation: OperationType.Call,
        };

        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

        const transferTransactionData: MetaTransactionData = {
            to: USDC_ADDRESS,
            value: "0",
            data: usdcContract.interface.encodeFunctionData("transfer", [TEST_ADDRESS, ethers.parseUnits("1", 6)]),
            operation: OperationType.Call,
        };

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [
                approveTransactionData,
                supplyTransactionData,
                enableTransactionData,
                borrowTransactionData,
                transferTransactionData,
            ],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("Safe transaction hash:", safeTxHash);

        const balanceAfter = await cbETHContract.balanceOf(safeAddress);
        console.log(`Balance after:`, ethers.formatEther(balanceAfter), "cbETH");

        const moonwellHelper = new MoonwellHelper(signer);

        const collateral = await moonwellHelper.getCollateralAmount(mcbETH, safeAddress);

        const debt = await moonwellHelper.getDebtAmount(USDC_ADDRESS, safeAddress);
        console.log("debt:", ethers.formatUnits(debt, 6));

        const usdcBalance = await usdcContract.balanceOf(safeAddress);
        console.log("USDC Balance on Safe:", ethers.formatUnits(usdcBalance, 6));

        const userUsdcBalance = await usdcContract.balanceOf(TEST_ADDRESS);
        console.log("USDC Balance on user:", ethers.formatUnits(userUsdcBalance, 6));
    }

    async function supplyAndBorrowOnFluid() {
        const cbETHContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, signer);
        const tx = await cbETHContract.transfer(safeAddress, ethers.parseEther("0.001"));
        await tx.wait();

        // const balance = await cbETHContract.balanceOf(safeAddress);
        // console.log(`Balance:`, ethers.formatEther(balance), "cbETH");

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
        console.log("Safe transaction hash:", safeTxHash);

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

        // const transferTransactionData: MetaTransactionData = {
        //     to: USDC_ADDRESS,
        //     value: "0",
        //     data: usdcContract.interface.encodeFunctionData("transfer", [TEST_ADDRESS, ethers.parseUnits("1", 6)]),
        //     operation: OperationType.Call,
        // };

        const safeTransaction2 = await safeWallet.createTransaction({
            transactions: [borrowTransactionData],
        });

        const safeTxHash2 = await safeWallet.executeTransaction(safeTransaction2);
        console.log("Safe transaction hash:", safeTxHash2);

        // const approveTransactionData2: MetaTransactionData = {
        //     to: USDC_ADDRESS,
        //     value: "0",
        //     data: usdcContract.interface.encodeFunctionData("approve", [
        //         FLUID_cbETH_USDC_VAULT,
        //         ethers.parseUnits("10", 6),
        //     ]),
        //     operation: OperationType.Call,
        // };

        // const beforeFluidDebt = await fluidHelper.getDebtAmount(FLUID_cbETH_USDC_VAULT, safeAddress);

        // const repayTransactionData: MetaTransactionData = {
        //     to: FLUID_cbETH_USDC_VAULT,
        //     value: "0",
        //     // data: fluidVault.interface.encodeFunctionData("operate", [nftId, 0, -MaxInt256, safeAddress]),
        //     data: fluidVault.interface.encodeFunctionData("operate", [
        //         nftId,
        //         0,
        //         // -ethers.parseUnits("0.1", 6),
        //         -1000004,
        //         safeAddress,
        //     ]),
        //     operation: OperationType.Call,
        // };

        // const safeTransaction3 = await safeWallet.createTransaction({
        //     transactions: [approveTransactionData2, repayTransactionData],
        // });

        // const safeTxHash3 = await safeWallet.executeTransaction(safeTransaction3);
        // console.log("Safe transaction hash3:", safeTxHash3);
    }

    async function supplyAndBorrowOnAave() {
        const cbETHContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, signer);
        const tx = await cbETHContract.transfer(safeAddress, ethers.parseEther("0.001"));
        await tx.wait();

        const approveTransactionData: MetaTransactionData = {
            to: cbETH_ADDRESS,
            value: "0",
            data: cbETHContract.interface.encodeFunctionData("approve", [AAVE_V3_POOL_ADDRESS, ethers.parseEther("1")]),
            operation: OperationType.Call,
        };

        const aavePool = new ethers.Contract(AAVE_V3_POOL_ADDRESS, aaveV3PoolJson, signer);

        const supplyTransactionData: MetaTransactionData = {
            to: AAVE_V3_POOL_ADDRESS,
            value: "0",
            data: aavePool.interface.encodeFunctionData("supply", [
                cbETH_ADDRESS,
                ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
                safeAddress,
                0,
            ]),
            operation: OperationType.Call,
        };

        const borrowTransactionData: MetaTransactionData = {
            to: AAVE_V3_POOL_ADDRESS,
            value: "0",
            data: aavePool.interface.encodeFunctionData("borrow", [
                USDC_ADDRESS,
                ethers.parseUnits("1", 6),
                2,
                0,
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

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [
                approveTransactionData,
                supplyTransactionData,
                borrowTransactionData,
                transferTransactionData,
            ],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("Safe transaction hash:", safeTxHash);
    }

    async function supplyAndBorrowOnCompound() {
        const cbETHContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, signer);
        const tx = await cbETHContract.transfer(safeAddress, ethers.parseEther("0.001"));
        await tx.wait();

        const approveTransactionData: MetaTransactionData = {
            to: cbETH_ADDRESS,
            value: "0",
            data: cbETHContract.interface.encodeFunctionData("approve", [USDC_COMET_ADDRESS, ethers.parseEther("1")]),
            operation: OperationType.Call,
        };

        const cometContract = new ethers.Contract(USDC_COMET_ADDRESS, cometAbi, signer);

        const supplyTransactionData: MetaTransactionData = {
            to: USDC_COMET_ADDRESS,
            value: "0",
            data: cometContract.interface.encodeFunctionData("supply", [
                cbETH_ADDRESS,
                ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
            ]),
            operation: OperationType.Call,
        };

        const borrowTransactionData: MetaTransactionData = {
            to: USDC_COMET_ADDRESS,
            value: "0",
            data: cometContract.interface.encodeFunctionData("withdraw", [USDC_ADDRESS, ethers.parseUnits("1", 6)]),
            operation: OperationType.Call,
        };

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [approveTransactionData, supplyTransactionData, borrowTransactionData],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("supplied and borrowed on Compound");
    }

    async function supplyAndBorrowOnMorpho() {
        const cbETHContract = new ethers.Contract(cbETH_ADDRESS, ERC20_ABI, signer);
        const tx = await cbETHContract.transfer(safeAddress, ethers.parseEther("0.001"));
        await tx.wait();

        const approveTransactionData: MetaTransactionData = {
            to: cbETH_ADDRESS,
            value: "0",
            data: cbETHContract.interface.encodeFunctionData("approve", [MORPHO_ADDRESS, ethers.parseEther("1")]),
            operation: OperationType.Call,
        };

        const morphoContract = new ethers.Contract(MORPHO_ADDRESS, morphoAbi, signer);
        const marketParams = marketParamsMap.get(morphoMarket1Id)!;

        const supplyTransactionData: MetaTransactionData = {
            to: MORPHO_ADDRESS,
            value: "0",
            data: morphoContract.interface.encodeFunctionData("supplyCollateral", [
                marketParams,
                ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
                safeAddress,
                "0x",
            ]),
            operation: OperationType.Call,
        };

        const amount = ethers.parseUnits("1", 6);
        const borrowTransactionData: MetaTransactionData = {
            to: MORPHO_ADDRESS,
            value: "0",
            data: morphoContract.interface.encodeFunctionData("borrow", [
                marketParams,
                amount,
                0,
                safeAddress,
                safeAddress,
            ]),
            operation: OperationType.Call,
        };

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [approveTransactionData, supplyTransactionData, borrowTransactionData],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("supplied and borrowed on Morpho");
    }

    it("In Compound", async function () {
        await supplyAndBorrowOnCompound();
        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDbC_ADDRESS, Protocols.COMPOUND, Protocols.COMPOUND);
    });

    it("from Compound to Moonwell", async function () {
        await supplyAndBorrowOnCompound();
        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.COMPOUND, Protocols.MOONWELL);
    });

    it("from Moonwell to Compound", async function () {
        await supplyAndBorrowOnMoonwell();
        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.MOONWELL, Protocols.COMPOUND);
    });

    it("In Morpho", async function () {
        await supplyAndBorrowOnMorpho();
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

    // TODO:
    it.skip("On Fluid from USDC to sUSDS with cbBTC collateral", async function () {
        await supplyAndBorrowOnFluid();
        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, sUSDS_ADDRESS, Protocols.FLUID, Protocols.MOONWELL);
    });

    it("from Fluid to Moonwell", async function () {
        await supplyAndBorrowOnFluid();
        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.FLUID, Protocols.MOONWELL);
    });

    it("from Moonwell to Fluid", async function () {
        await supplyAndBorrowOnMoonwell();

        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.MOONWELL, Protocols.FLUID);
    });

    it.skip("from Moonwell USDbC to Fluid USDC", async function () {
        await supplyAndBorrowOnMoonwell();
        await executeDebtSwap(USDC_hyUSD_POOL, USDbC_ADDRESS, USDC_ADDRESS, Protocols.MOONWELL, Protocols.FLUID);
    });

    it("In Aave", async function () {
        await supplyAndBorrowOnAave();

        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDbC_ADDRESS, Protocols.AAVE_V3, Protocols.AAVE_V3);
    });

    it("on Moonwell from USDC to DAI", async function () {
        await supplyAndBorrowOnMoonwell();
        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, DAI_ADDRESS, Protocols.MOONWELL, Protocols.MOONWELL);
    });

    it("from Moonwell to Aave", async function () {
        await supplyAndBorrowOnMoonwell();
        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.MOONWELL, Protocols.AAVE_V3);
    });

    it.only("from Aave to Moonwell", async function () {
        await supplyAndBorrowOnAave();

        await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.AAVE_V3, Protocols.MOONWELL);
    });

    it.skip("Should repay switched debt and withdraw collateral", async function () {
        const daiContract = new ethers.Contract(DAI_ADDRESS, ERC20_ABI, signer);
        const daiBalance = await daiContract.balanceOf(TEST_ADDRESS);

        console.log("DAI balance:", ethers.formatEther(daiBalance));

        const moonwellHelper = new MoonwellHelper(signer);
        const DAIdebtAmount = await moonwellHelper.getDebtAmount(mDAI, safeAddress);
        console.log("DAI debt amount:", ethers.formatEther(DAIdebtAmount));

        const DAImToken = new ethers.Contract(mDAI, MErc20DelegatorAbi, signer);

        await daiContract.transfer(safeAddress, DAIdebtAmount);

        const approveTransactionData: MetaTransactionData = {
            to: DAI_ADDRESS,
            value: "0",
            data: daiContract.interface.encodeFunctionData("approve", [mDAI, MaxUint256]),
            operation: OperationType.Call,
        };

        const repayTransactionData: MetaTransactionData = {
            to: mDAI,
            value: "0",
            data: DAImToken.interface.encodeFunctionData("repayBorrow", [DAIdebtAmount]),
            operation: OperationType.Call,
        };

        const cbETHmToken = new ethers.Contract(mcbETH, MErc20DelegatorAbi, signer);

        const withdrawTransactionData: MetaTransactionData = {
            to: mcbETH,
            value: "0",
            data: cbETHmToken.interface.encodeFunctionData("redeemUnderlying", [
                ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
            ]),
            operation: OperationType.Call,
        };

        const safeTransaction = await safeWallet.createTransaction({
            transactions: [approveTransactionData, repayTransactionData, withdrawTransactionData],
        });

        const safeTxHash = await safeWallet.executeTransaction(safeTransaction);
        console.log("Safe transaction hash:", safeTxHash);

        const DAIdebtAmountAfter = await moonwellHelper.getDebtAmount(mDAI, safeAddress);
        console.log("DAI debt amount after:", ethers.formatEther(DAIdebtAmountAfter));

        const cbETHCollateralAfter = await moonwellHelper.getCollateralAmount(mcbETH, safeAddress);
        console.log("cbETH Collateral after:", ethers.formatEther(cbETHCollateralAfter));
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
        } = { useMaxAmount: true },
    ) {
        const FromHelper = protocolHelperMap.get(fromProtocol)!;
        const fromHelper = new FromHelper(signer);
        const ToHelper = protocolHelperMap.get(toProtocol)!;
        const toHelper = new ToHelper(signer);

        const safeModuleAddress = await safeModuleContract.getAddress();
        const moduleContract = await ethers.getContractAt("SafeModule", safeModuleAddress, signer);

        const fromDebtAmountParameter =
            fromProtocol === Protocols.MORPHO ? options!.morphoFromMarketId! : fromTokenAddress;

        const toDebtAmountParameter = toProtocol === Protocols.MORPHO ? options!.morphoToMarketId! : toTokenAddress;

        const srcDebtBefore: bigint = await fromHelper.getDebtAmount(fromDebtAmountParameter, safeAddress);
        const dstDebtBefore: bigint = await toHelper.getDebtAmount(toDebtAmountParameter, safeAddress);

        // get paraswap data
        let srcAmount = BigInt(0);

        let paraswapData = {
            router: zeroAddress,
            tokenTransferProxy: zeroAddress,
            swapData: "0x",
        };

        if (fromTokenAddress != toTokenAddress) {
            [srcAmount, paraswapData] = await getParaswapData(
                fromTokenAddress,
                toTokenAddress,
                safeModuleAddress,
                srcDebtBefore,
            );
        }

        // add 2% slippage(must be set by user)
        const amountPlusSlippage = (BigInt(srcAmount) * 1020n) / 1000n;

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

                const fromCometAddress = cometAddressMap.get(fromTokenAddress)!;
                fromExtraData = fromHelper.encodeExtraData(fromCometAddress);
                break;
            case Protocols.MORPHO:
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

                const borrowShares = await fromHelper.getBorrowShares(options!.morphoFromMarketId!, safeAddress);

                fromExtraData = fromHelper.encodeExtraData(options!.morphoFromMarketId!, borrowShares);
                break;
            case Protocols.MOONWELL:
                const mContract = mContractAddressMap.get(fromTokenAddress)!;
                fromExtraData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "address[]"],
                    [mContract, [mcbETH]],
                );
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
                // await toHelper.approveDelegation(debtTokenAddress, safeModuleAddress);
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

                const toCometAddress = cometAddressMap.get(toTokenAddress)!;
                toExtraData = toHelper.encodeExtraData(toCometAddress);
                break;
            case Protocols.MORPHO:
                const borrowShares = await toHelper.getBorrowShares(options!.morphoToMarketId!, safeAddress);

                toExtraData = toHelper.encodeExtraData(options!.morphoToMarketId!, borrowShares);
                break;
            case Protocols.MOONWELL:
                const mContract = mContractAddressMap.get(toTokenAddress)!;
                toExtraData = ethers.AbiCoder.defaultAbiCoder().encode(["address", "address[]"], [mContract, [mcbETH]]);
                break;
            case Protocols.FLUID:
                toExtraData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256"],
                    [FLUID_cbETH_USDC_VAULT, 0],
                );
                break;
        }

        let collateralAmount = ethers.parseEther(DEFAULT_SUPPLY_AMOUNT);
        switch (fromProtocol) {
            case Protocols.MOONWELL:
                collateralAmount = await fromHelper.getCollateralAmount(mcbETH, safeAddress);
                break;
            case Protocols.MORPHO:
                collateralAmount = await fromHelper.getCollateralAmount(options!.morphoFromMarketId!, safeAddress);
                break;
        }

        await moduleContract.executeDebtSwap(
            flashloanPool,
            fromProtocol,
            toProtocol,
            fromTokenAddress,
            toTokenAddress,
            MaxUint256,
            amountPlusSlippage,
            [{ asset: collateralTokenAddress, amount: collateralAmount }],
            fromExtraData,
            toExtraData,
            paraswapData,
            {
                gasLimit: "2000000",
            },
        );

        const srcDebtAfter = await fromHelper.getDebtAmount(fromDebtAmountParameter, safeAddress);
        const dstDebtAfter = await toHelper.getDebtAmount(toDebtAmountParameter, safeAddress);

        console.log(
            `Source ${fromProtocol}, ${fromTokenAddress} Debt Amount:`,
            formatAmount(srcDebtBefore),
            " -> ",
            formatAmount(srcDebtAfter),
        );

        console.log(
            `Destination ${toProtocol}, ${toTokenAddress} Debt Amount:`,
            formatAmount(dstDebtBefore),
            " -> ",
            formatAmount(dstDebtAfter),
        );
    }
});
