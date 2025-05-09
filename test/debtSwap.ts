import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";

import "dotenv/config";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap } from "../typechain-types";
import morphoAbi from "../externalAbi/morpho/morpho.json";

import { approve, formatAmount, getParaswapData, protocolHelperMap, wrapETH } from "./utils";
import {
    USDC_ADDRESS,
    USDbC_ADDRESS,
    TEST_ADDRESS,
    USDC_hyUSD_POOL,
    ETH_USDbC_POOL,
    Protocols,
    cbETH_ADDRESS,
    WETH_ADDRESS,
    DEFAULT_SUPPLY_AMOUNT,
    ETH_USDC_POOL,
    TEST_FEE_BENEFICIARY_ADDRESS,
    MAI_ADDRESS,
    MAI_USDC_POOL,
    UNISWAP_V3_FACTORY_ADRESS,
} from "./constants";

import { AaveV3Helper } from "./protocols/aaveV3";
import {
    cometAddressMap,
    CompoundHelper,
    USDbC_COMET_ADDRESS,
    USDC_COMET_ADDRESS,
    WETH_COMET_ADDRESS,
} from "./protocols/compound";
import { MORPHO_ADDRESS, MorphoHelper, morphoMarket1Id, morphoMarket2Id, morphoMarket3Id } from "./protocols/morpho";
import { MaxUint256 } from "ethers";
import { zeroAddress } from "viem";
import { deployDebtSwapContractFixture, getGasOptions } from "./deployUtils";

describe("DebtSwap should switch", function () {
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

        const debtSwap = await loadFixture(deployDebtSwapContractFixture);
        deployedContractAddress = await debtSwap.getAddress();

        myContract = await ethers.getContractAt("DebtSwap", deployedContractAddress, impersonatedSigner);
    });

    describe("In Aave", function () {
        it("from USDC to USDbC, cbETH Collateral", async function () {
            await aaveV3Helper.supply(cbETH_ADDRESS);
            await aaveV3Helper.borrow(USDC_ADDRESS);

            await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDbC_ADDRESS, Protocols.AAVE_V3, Protocols.AAVE_V3);
        });

        it("from USDC to USDbC with amount, cbETH Collateral", async function () {
            await aaveV3Helper.supply(cbETH_ADDRESS);
            await aaveV3Helper.borrow(USDC_ADDRESS);

            await executeDebtSwap(
                USDC_hyUSD_POOL,
                USDC_ADDRESS,
                USDbC_ADDRESS,
                Protocols.AAVE_V3,
                Protocols.AAVE_V3,
                cbETH_ADDRESS,
                { useMaxAmount: false },
            );
        });

        it("from USDbC to USDC, cbETH Collateral", async function () {
            await aaveV3Helper.supply(cbETH_ADDRESS);
            await aaveV3Helper.borrow(USDbC_ADDRESS);

            await executeDebtSwap(ETH_USDbC_POOL, USDbC_ADDRESS, USDC_ADDRESS, Protocols.AAVE_V3, Protocols.AAVE_V3);
        });

        it("from USDC to USDbC, WETH Collateral", async function () {
            await wrapETH(DEFAULT_SUPPLY_AMOUNT, impersonatedSigner);
            await aaveV3Helper.supply(WETH_ADDRESS);
            await aaveV3Helper.borrow(USDC_ADDRESS);

            await executeDebtSwap(
                USDC_hyUSD_POOL,
                USDC_ADDRESS,
                USDbC_ADDRESS,
                Protocols.AAVE_V3,
                Protocols.AAVE_V3,
                WETH_ADDRESS,
            );
        });

        it("from USDbC to USDC, WETH Collateral", async function () {
            await wrapETH(DEFAULT_SUPPLY_AMOUNT, impersonatedSigner);
            await aaveV3Helper.supply(WETH_ADDRESS);
            await aaveV3Helper.borrow(USDbC_ADDRESS);

            await executeDebtSwap(
                ETH_USDbC_POOL,
                USDbC_ADDRESS,
                USDC_ADDRESS,
                Protocols.AAVE_V3,
                Protocols.AAVE_V3,
                WETH_ADDRESS,
            );
        });
    });

    // compound USDbC is no longer supported
    // https://www.tally.xyz/gov/compound/proposal/428?govId=eip155:1:0x309a862bbC1A00e45506cB8A802D1ff10004c8C0
    describe.skip("In Compound", function () {
        it("from USDbC to USDC, cbETH Collateral", async function () {
            await compoundHelper.supply(USDbC_COMET_ADDRESS, cbETH_ADDRESS);
            await compoundHelper.borrow(USDbC_ADDRESS);

            await executeDebtSwap(ETH_USDbC_POOL, USDbC_ADDRESS, USDC_ADDRESS, Protocols.COMPOUND, Protocols.COMPOUND);
        });

        it("from USDC to USDbC, WETH Collateral", async function () {
            await wrapETH(DEFAULT_SUPPLY_AMOUNT, impersonatedSigner);
            await compoundHelper.supply(USDC_COMET_ADDRESS, WETH_ADDRESS);
            await compoundHelper.borrow(USDC_ADDRESS);

            await executeDebtSwap(
                USDC_hyUSD_POOL,
                USDC_ADDRESS,
                USDbC_ADDRESS,
                Protocols.COMPOUND,
                Protocols.COMPOUND,
                WETH_ADDRESS,
            );
        });

        it("from USDbC to USDC, WETH Collateral", async function () {
            await wrapETH(DEFAULT_SUPPLY_AMOUNT, impersonatedSigner);
            await compoundHelper.supply(USDbC_COMET_ADDRESS, WETH_ADDRESS);
            await compoundHelper.borrow(USDbC_ADDRESS);

            await executeDebtSwap(
                ETH_USDbC_POOL,
                USDbC_ADDRESS,
                USDC_ADDRESS,
                Protocols.COMPOUND,
                Protocols.COMPOUND,
                WETH_ADDRESS,
            );
        });

        it("from USDC to USDbC, Multiple Collaterals(cbETH and WETH)", async function () {
            await wrapETH(DEFAULT_SUPPLY_AMOUNT, impersonatedSigner);
            await compoundHelper.supply(USDC_COMET_ADDRESS, WETH_ADDRESS);
            await compoundHelper.supply(USDC_COMET_ADDRESS, cbETH_ADDRESS);
            await compoundHelper.borrow(USDC_ADDRESS);

            await executeDebtSwap(
                USDC_hyUSD_POOL,
                USDC_ADDRESS,
                USDbC_ADDRESS,
                Protocols.COMPOUND,
                Protocols.COMPOUND,
                cbETH_ADDRESS,
                {
                    anotherCollateralTokenAddress: WETH_ADDRESS,
                },
            );

            const WETHAmountInUSDC = await compoundHelper.getCollateralAmount(USDC_COMET_ADDRESS, WETH_ADDRESS);
            console.log("WETH collateralAmountInUSDC:", ethers.formatEther(WETHAmountInUSDC));
            const WETHAmountInUSDbC = await compoundHelper.getCollateralAmount(USDbC_COMET_ADDRESS, WETH_ADDRESS);
            console.log("WETH collateralAmountInUSDbC:", ethers.formatEther(WETHAmountInUSDbC));

            const cbETHAmountInUSDC = await compoundHelper.getCollateralAmount(USDC_COMET_ADDRESS, cbETH_ADDRESS);
            console.log("cbETH collateralAmountInUSDC:", ethers.formatEther(cbETHAmountInUSDC));
            const cbETHAmountInUSDbC = await compoundHelper.getCollateralAmount(USDbC_COMET_ADDRESS, cbETH_ADDRESS);
            console.log("cbETH collateralAmountInUSDbC:", ethers.formatEther(cbETHAmountInUSDbC));
        });
    });

    describe("In Morpho", function () {
        it("from market 1 to market 2", async function () {
            await morphoHelper.supply(cbETH_ADDRESS, morphoMarket1Id);
            await morphoHelper.borrow(morphoMarket1Id);

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

        it("from market 2 to market 1", async function () {
            await morphoHelper.supply(cbETH_ADDRESS, morphoMarket2Id);
            await morphoHelper.borrow(morphoMarket2Id);

            await executeDebtSwap(
                USDC_hyUSD_POOL,
                USDC_ADDRESS,
                USDC_ADDRESS,
                Protocols.MORPHO,
                Protocols.MORPHO,
                cbETH_ADDRESS,
                {
                    morphoFromMarketId: morphoMarket2Id,
                    morphoToMarketId: morphoMarket1Id,
                },
            );
        });

        it("from market 1 to market 3(MAI, 18 decimals)", async function () {
            await morphoHelper.supply(cbETH_ADDRESS, morphoMarket1Id);
            await morphoHelper.borrow(morphoMarket1Id);

            await executeDebtSwap(
                USDC_hyUSD_POOL,
                USDC_ADDRESS,
                MAI_ADDRESS,
                Protocols.MORPHO,
                Protocols.MORPHO,
                cbETH_ADDRESS,
                {
                    morphoFromMarketId: morphoMarket1Id,
                    morphoToMarketId: morphoMarket3Id,
                },
            );
        });
        it("from market 3(MAI, 18 decimals) to market 1", async function () {
            await morphoHelper.supply(cbETH_ADDRESS, morphoMarket3Id);
            await morphoHelper.borrow(morphoMarket3Id, 18);

            await executeDebtSwap(
                MAI_USDC_POOL,
                MAI_ADDRESS,
                USDC_ADDRESS,
                Protocols.MORPHO,
                Protocols.MORPHO,
                cbETH_ADDRESS,
                {
                    morphoFromMarketId: morphoMarket3Id,
                    morphoToMarketId: morphoMarket1Id,
                    flashloanFee: 5n,
                },
            );
        });
    });

    describe("protocol", function () {
        it("USDC debt from Aave to Compound", async function () {
            await aaveV3Helper.supply(cbETH_ADDRESS);
            await aaveV3Helper.borrow(USDC_ADDRESS);

            await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.AAVE_V3, Protocols.COMPOUND);
        });

        it("should switch USDC debt from Aave to Compound with protocol fee", async function () {
            // set protocol fee
            const signers = await ethers.getSigners();
            const contractByOwner = await ethers.getContractAt("DebtSwap", deployedContractAddress, signers[0]);
            const setTx = await contractByOwner.setProtocolFee(10);
            await setTx.wait();

            const setFeeBeneficiaryTx = await contractByOwner.setFeeBeneficiary(TEST_FEE_BENEFICIARY_ADDRESS);
            await setFeeBeneficiaryTx.wait();

            await aaveV3Helper.supply(cbETH_ADDRESS);
            await aaveV3Helper.borrow(USDC_ADDRESS);

            await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDC_ADDRESS, Protocols.AAVE_V3, Protocols.COMPOUND);
        });

        it("USDC debt from Compound to Aave", async function () {
            await compoundHelper.supply(USDC_COMET_ADDRESS, cbETH_ADDRESS);
            await compoundHelper.borrow(USDC_ADDRESS);

            await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDbC_ADDRESS, Protocols.COMPOUND, Protocols.AAVE_V3);
        });

        it.skip("USDC debt on Aave to USDbC on Compound", async function () {
            await aaveV3Helper.supply(cbETH_ADDRESS);
            await aaveV3Helper.borrow(USDC_ADDRESS);

            await executeDebtSwap(USDC_hyUSD_POOL, USDC_ADDRESS, USDbC_ADDRESS, Protocols.AAVE_V3, Protocols.COMPOUND);
        });

        it("USDbC debt on Aave to USDC on Compound", async function () {
            await aaveV3Helper.supply(cbETH_ADDRESS);
            await aaveV3Helper.borrow(USDbC_ADDRESS);

            await executeDebtSwap(ETH_USDbC_POOL, USDbC_ADDRESS, USDC_ADDRESS, Protocols.AAVE_V3, Protocols.COMPOUND);
        });

        it("WETH debt on Aave to Compound", async function () {
            await aaveV3Helper.supply(cbETH_ADDRESS);
            await aaveV3Helper.borrow(WETH_ADDRESS, ethers.parseEther("0.0005"));

            await executeDebtSwap(ETH_USDC_POOL, WETH_ADDRESS, WETH_ADDRESS, Protocols.AAVE_V3, Protocols.COMPOUND);
        });

        it("USDC debt on Aave to USDC on Morpho", async function () {
            await aaveV3Helper.supply(cbETH_ADDRESS);
            await aaveV3Helper.borrow(USDC_ADDRESS);

            await executeDebtSwap(
                USDC_hyUSD_POOL,
                USDC_ADDRESS,
                USDC_ADDRESS,
                Protocols.AAVE_V3,
                Protocols.MORPHO,
                cbETH_ADDRESS,
                {
                    morphoToMarketId: morphoMarket1Id,
                },
            );
        });

        it("USDC debt on Morpho to USDC on Aave", async function () {
            await morphoHelper.supply(cbETH_ADDRESS, morphoMarket1Id);
            await morphoHelper.borrow(morphoMarket1Id);

            await executeDebtSwap(
                USDC_hyUSD_POOL,
                USDC_ADDRESS,
                USDC_ADDRESS,
                Protocols.MORPHO,
                Protocols.AAVE_V3,
                cbETH_ADDRESS,
                {
                    morphoFromMarketId: morphoMarket1Id,
                },
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
                cbETH_ADDRESS,
                {
                    morphoFromMarketId: morphoMarket1Id,
                },
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
                cbETH_ADDRESS,
                {
                    morphoFromMarketId: morphoMarket1Id,
                },
            );
        });

        it("Multiple collateral case from Aave to Compound", async function () {
            await aaveV3Helper.supply(cbETH_ADDRESS);
            await wrapETH(DEFAULT_SUPPLY_AMOUNT, impersonatedSigner);
            await aaveV3Helper.supply(WETH_ADDRESS);
            await aaveV3Helper.borrow(USDC_ADDRESS);

            const WETHAmountInAaveBefore = await aaveV3Helper.getCollateralAmount(WETH_ADDRESS);
            console.log("WETH collateralAmountInAaveBefore:", ethers.formatEther(WETHAmountInAaveBefore));
            const WETHAmountInCompoundBefore = await compoundHelper.getCollateralAmount(
                USDC_COMET_ADDRESS,
                WETH_ADDRESS,
            );
            console.log("WETH collateralAmountInCompoundBefore:", ethers.formatEther(WETHAmountInCompoundBefore));

            const cbETHAmountInAaveBefore = await aaveV3Helper.getCollateralAmount(cbETH_ADDRESS);
            console.log("cbETH collateralAmountInAaveBefore:", ethers.formatEther(cbETHAmountInAaveBefore));
            const cbETHAmountInCompoundBefore = await compoundHelper.getCollateralAmount(
                USDC_COMET_ADDRESS,
                cbETH_ADDRESS,
            );
            console.log("cbETH collateralAmountInCompoundBefore:", ethers.formatEther(cbETHAmountInCompoundBefore));

            await executeDebtSwap(
                USDC_hyUSD_POOL,
                USDC_ADDRESS,
                USDC_ADDRESS,
                Protocols.AAVE_V3,
                Protocols.COMPOUND,
                cbETH_ADDRESS,
                { anotherCollateralTokenAddress: WETH_ADDRESS },
            );

            const WETHAmountInAave = await aaveV3Helper.getCollateralAmount(WETH_ADDRESS);
            console.log("WETH collateralAmountInAave:", ethers.formatEther(WETHAmountInAave));
            const WETHAmountInCompound = await compoundHelper.getCollateralAmount(USDbC_COMET_ADDRESS, WETH_ADDRESS);
            console.log("WETH collateralAmountInCompound:", ethers.formatEther(WETHAmountInCompound));

            const cbETHAmountInAave = await aaveV3Helper.getCollateralAmount(cbETH_ADDRESS);
            console.log("cbETH collateralAmountInAave:", ethers.formatEther(cbETHAmountInAave));
            const cbETHAmountInCompound = await compoundHelper.getCollateralAmount(USDbC_COMET_ADDRESS, cbETH_ADDRESS);
            console.log("cbETH collateralAmountInCompound:", ethers.formatEther(cbETHAmountInCompound));
        });

        it("Multiple collateral case from Compound to Aave", async function () {
            await compoundHelper.supply(USDC_COMET_ADDRESS, cbETH_ADDRESS);
            await wrapETH(DEFAULT_SUPPLY_AMOUNT, impersonatedSigner);
            await compoundHelper.supply(USDC_COMET_ADDRESS, WETH_ADDRESS);
            await compoundHelper.borrow(USDC_ADDRESS);

            await executeDebtSwap(
                USDC_hyUSD_POOL,
                USDC_ADDRESS,
                USDbC_ADDRESS,
                Protocols.COMPOUND,
                Protocols.AAVE_V3,
                cbETH_ADDRESS,
                { anotherCollateralTokenAddress: WETH_ADDRESS },
            );

            const WETHAmountInAave = await aaveV3Helper.getCollateralAmount(WETH_ADDRESS);
            console.log("WETH collateralAmountInAave:", ethers.formatEther(WETHAmountInAave));
            const WETHAmountInCompound = await compoundHelper.getCollateralAmount(USDC_COMET_ADDRESS, WETH_ADDRESS);
            console.log("WETH collateralAmountInCompound:", ethers.formatEther(WETHAmountInCompound));

            const cbETHAmountInAave = await aaveV3Helper.getCollateralAmount(cbETH_ADDRESS);
            console.log("cbETH collateralAmountInAave:", ethers.formatEther(cbETHAmountInAave));
            const cbETHAmountInCompound = await compoundHelper.getCollateralAmount(USDC_COMET_ADDRESS, cbETH_ADDRESS);
            console.log("cbETH collateralAmountInCompound:", ethers.formatEther(cbETHAmountInCompound));
        });
    });

    describe("Util function", function () {
        it("emergency withdraw", async function () {
            const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
            const transfer = await usdcContract.transfer(deployedContractAddress, ethers.parseUnits("1", 6));
            await transfer.wait();

            const signers = await ethers.getSigners();
            const contract = await ethers.getContractAt("DebtSwap", deployedContractAddress, signers[0]);
            await contract.emergencyWithdraw(USDC_ADDRESS, ethers.parseUnits("1", 6));
            const balance = await usdcContract.balanceOf(signers[0]);
            console.log(`Balance:`, ethers.formatUnits(balance, 6));
        });
    });

    describe("should revert", function () {
        it("if flashloan pool is not uniswap v3 pool", async function () {
            await aaveV3Helper.supply(cbETH_ADDRESS);
            await aaveV3Helper.borrow(USDC_ADDRESS);

            await expect(
                executeDebtSwap(
                    "0x1e88f23864a8FE784eB152967AccDb394D3b88AD",
                    USDC_ADDRESS,
                    USDC_ADDRESS,
                    Protocols.AAVE_V3,
                    Protocols.COMPOUND,
                ),
            ).to.be.reverted;
        });

        it("if non-owner call setProtocolFee()", async function () {
            const signers = await ethers.getSigners();
            const contractByNotOwner = await ethers.getContractAt("DebtSwap", deployedContractAddress, signers[1]);
            await expect(contractByNotOwner.setProtocolFee(100)).to.be.reverted;
        });

        it("Call uniswapV3FlashCallback() directly with invalid callback data", async function () {
            const signers = await ethers.getSigners();
            const contractByNotOwner = await ethers.getContractAt("DebtSwap", deployedContractAddress, signers[1]);
            await expect(contractByNotOwner.uniswapV3FlashCallback(100, 100, "0x")).to.be.reverted;
        });

        it("call non-existing handler", async function () {
            await aaveV3Helper.supply(cbETH_ADDRESS);
            await aaveV3Helper.borrow(USDC_ADDRESS);

            await expect(
                myContract.executeDebtSwap(
                    USDC_hyUSD_POOL,
                    Protocols.AAVE_V3,
                    9,
                    USDC_ADDRESS,
                    USDC_ADDRESS,
                    MaxUint256,
                    [{ asset: cbETH_ADDRESS, amount: ethers.parseEther(DEFAULT_SUPPLY_AMOUNT) }],
                    "0x",
                    "0x",
                    { srcAmount: 0n, swapData: "0x" },
                ),
            ).to.be.reverted;
        });

        it("call with invalid paraswap data", async function () {
            await aaveV3Helper.supply(cbETH_ADDRESS);
            await aaveV3Helper.borrow(USDC_ADDRESS);

            await expect(
                executeDebtSwap(
                    USDC_hyUSD_POOL,
                    USDC_ADDRESS,
                    USDbC_ADDRESS,
                    Protocols.AAVE_V3,
                    Protocols.COMPOUND,
                    cbETH_ADDRESS,
                    {
                        dummyParaswapData: {
                            srcAmount: 0n,
                            swapData:
                                "0x2298207a0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000d9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000000000000000000000000000000000000000055d6e0000000000000000000000000000000000000000000000000000000000054fca0000000000000000000000000000000000000000000000000000000000054fd400000000000000000000000000000000000000000000000000000000000001e0000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002e0000000000000000000000000000000000000000000000000000000000000034000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000038000000000000000000000000000000000000000000000000000000000681dc1b6cb3922b608b5411ba764134f07fb76d70000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000007a8d53466144e1f75de2e70ec908e18f771b49fb0000000000000000000000000000000000000000000000000000000000000084c31b8d7a00000000000000000000000059c7c832e96d2568bea6db468c1aadcbbda08a520000000000000000000000000000000000000000000000000000000000000000fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffab036000000000000000000000000fffd8963efd1fc6a506488495d951d5263988d2500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000084000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
                        },
                    },
                ),
            ).to.be.reverted;
        });
        it("deployed malicious contract as handelr ", async function () {
            // Deploy a malicious contract that could be used as a handler
            const MaliciousContract = await ethers.getContractFactory("MaliciousContract");
            const maliciousContract = await MaliciousContract.deploy();
            await maliciousContract.waitForDeployment();
            const maliciousAddress = await maliciousContract.getAddress();

            // Try to deploy DebtSwap with the malicious contract as a handler
            const DebtSwap = await ethers.getContractFactory("DebtSwap");
            await expect(
                DebtSwap.deploy(
                    UNISWAP_V3_FACTORY_ADRESS,
                    [Protocols.AAVE_V3],
                    [maliciousAddress],
                    await getGasOptions(),
                ),
            ).to.be.revertedWith("Invalid handler address");
        });
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
            flashloanFee?: bigint;
            dummyParaswapData?: { srcAmount: bigint; swapData: string };
        } = { useMaxAmount: true, flashloanFee: 1n },
    ) {
        const FromHelper = protocolHelperMap.get(fromProtocol)!;
        const fromHelper = new FromHelper(impersonatedSigner);
        const ToHelper = protocolHelperMap.get(toProtocol)!;
        const toHelper = new ToHelper(impersonatedSigner);

        const fromDebtAmountParameter =
            fromProtocol === Protocols.MORPHO ? options!.morphoFromMarketId! : fromTokenAddress;
        const beforeFromProtocolDebt: bigint = await fromHelper.getDebtAmount(fromDebtAmountParameter);

        // Add 0.001% of initial amount (rounded up)
        const debtAmount = options.useMaxAmount
            ? MaxUint256
            : beforeFromProtocolDebt + (beforeFromProtocolDebt * 1n + 9_999n) / 1_000_000n;

        const toDebtAmountParameter = toProtocol === Protocols.MORPHO ? options!.morphoToMarketId! : toTokenAddress;
        const beforeToProtocolDebt: bigint = await toHelper.getDebtAmount(toDebtAmountParameter);

        const fromTokenContract = new ethers.Contract(fromTokenAddress, ERC20_ABI, impersonatedSigner);
        const fromTokenBalance = await fromTokenContract.balanceOf(TEST_ADDRESS);

        const collateralContract = new ethers.Contract(collateralTokenAddress, ERC20_ABI, impersonatedSigner);
        const collateralBalance = await collateralContract.balanceOf(TEST_ADDRESS);

        let collateralAmount: bigint;
        switch (fromProtocol) {
            case Protocols.AAVE_V3:
                collateralAmount = await aaveV3Helper.getCollateralAmount(collateralTokenAddress);
                break;
            case Protocols.COMPOUND:
                const cometAddress = cometAddressMap.get(fromTokenAddress)!;
                collateralAmount = await compoundHelper.getCollateralAmount(cometAddress, collateralTokenAddress);
                break;
            case Protocols.MORPHO:
                collateralAmount = await morphoHelper.getCollateralAmount(options!.morphoFromMarketId!);
                break;
            default:
                throw new Error("Unsupported protocol");
        }
        console.log("collateralAmount:", ethers.formatEther(collateralAmount));

        // build extraData and send approval tx for each protocol
        let fromExtraData = "0x";
        let toExtraData = "0x";

        switch (fromProtocol) {
            case Protocols.AAVE_V3:
                // if switch to another protocol, must give approval for aToken
                if (toProtocol != Protocols.AAVE_V3) {
                    const aTokenAddress = await aaveV3Helper.getATokenAddress(cbETH_ADDRESS);
                    await approve(aTokenAddress, deployedContractAddress, impersonatedSigner);

                    if (options!.anotherCollateralTokenAddress) {
                        const anotherATokenAddress = await aaveV3Helper.getATokenAddress(
                            options!.anotherCollateralTokenAddress,
                        );
                        await approve(anotherATokenAddress, deployedContractAddress, impersonatedSigner);
                    }
                }
                break;
            case Protocols.COMPOUND:
                await compoundHelper.allow(fromTokenAddress, deployedContractAddress);
                break;

            case Protocols.MORPHO:
                const morphoContract = new ethers.Contract(MORPHO_ADDRESS, morphoAbi, impersonatedSigner);
                await morphoContract.setAuthorization(deployedContractAddress, true);
                const borrowShares = await morphoHelper.getBorrowShares(options!.morphoFromMarketId!);

                fromExtraData = morphoHelper.encodeExtraData(options!.morphoFromMarketId!, borrowShares);
                break;
        }

        switch (toProtocol) {
            case Protocols.AAVE_V3:
                await aaveV3Helper.approveDelegation(toTokenAddress, deployedContractAddress);
                break;

            case Protocols.COMPOUND:
                await compoundHelper.allow(toTokenAddress, deployedContractAddress);
                break;

            case Protocols.MORPHO:
                if (fromProtocol != Protocols.MORPHO) {
                    const morphoContract = new ethers.Contract(MORPHO_ADDRESS, morphoAbi, impersonatedSigner);
                    await morphoContract.setAuthorization(deployedContractAddress, true);
                }
                const borrowShares = await morphoHelper.getBorrowShares(options!.morphoToMarketId!);

                toExtraData = morphoHelper.encodeExtraData(options!.morphoToMarketId!, borrowShares);
                break;
        }

        const collateralArray = options.anotherCollateralTokenAddress
            ? [
                  { asset: collateralTokenAddress, amount: collateralAmount },
                  {
                      asset: options!.anotherCollateralTokenAddress,
                      amount: ethers.parseEther(DEFAULT_SUPPLY_AMOUNT),
                  },
              ]
            : [{ asset: collateralTokenAddress, amount: collateralAmount }];

        // get paraswap data
        let paraswapData = {
            srcAmount: BigInt(0),
            swapData: "0x",
        };

        if (fromTokenAddress !== toTokenAddress) {
            paraswapData = await getParaswapData(
                fromTokenAddress,
                toTokenAddress,
                deployedContractAddress,
                beforeFromProtocolDebt,
                options.flashloanFee,
            );
        }

        // simulate waiting for user's confirmation
        await time.increaseTo((await time.latest()) + 60);

        const tx = await myContract.executeDebtSwap(
            flashloanPool,
            fromProtocol,
            toProtocol,
            fromTokenAddress,
            toTokenAddress,
            debtAmount,
            collateralArray,
            fromExtraData,
            toExtraData,
            options.dummyParaswapData ? options.dummyParaswapData : paraswapData,
        );
        await tx.wait();

        // check debt is switched as expected
        const afterFromProtocolDebt = await fromHelper.getDebtAmount(fromDebtAmountParameter);
        const afterToProtocolDebt = await toHelper.getDebtAmount(toDebtAmountParameter);
        console.log(
            `Before Protocol ${Protocols[fromProtocol]}, asset: ${fromTokenAddress} Debt Amount:`,
            formatAmount(beforeFromProtocolDebt),
            " -> ",
            formatAmount(afterFromProtocolDebt),
        );
        expect(afterFromProtocolDebt).to.be.lt(beforeFromProtocolDebt);

        console.log(
            `To Protocol ${Protocols[toProtocol]}, asset: ${toTokenAddress} Debt Amount:`,
            formatAmount(beforeToProtocolDebt),
            " -> ",
            formatAmount(afterToProtocolDebt),
        );
        expect(afterToProtocolDebt).to.be.gt(beforeToProtocolDebt);

        // check token balance in user's wallet is as expected
        const fromTokenBalanceAfter = await fromTokenContract.balanceOf(TEST_ADDRESS);
        const collateralBalanceAfter = await collateralContract.balanceOf(TEST_ADDRESS);
        expect(fromTokenBalanceAfter).to.be.gte(fromTokenBalance);
        expect(collateralBalanceAfter).to.be.equal(collateralBalance);

        // check there is no remaining token balance on contract
        const toToken = new ethers.Contract(toTokenAddress, ERC20_ABI, impersonatedSigner);
        const remainingBalance = await toToken.balanceOf(deployedContractAddress);
        expect(remainingBalance).to.be.equal(0n);

        const fromToken = new ethers.Contract(fromTokenAddress, ERC20_ABI, impersonatedSigner);
        const fromRemainingBalance = await fromToken.balanceOf(deployedContractAddress);
        expect(fromRemainingBalance).to.be.equal(0n);
    }
});
