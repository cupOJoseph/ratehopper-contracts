import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
const { expect } = require("chai");
import { ethers } from "hardhat";
const aaveV3PoolJson = require("../externalAbi/aaveV3/aaveV3Pool.json");

import "dotenv/config";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { DebtSwap } from "../typechain-types";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { approve, deployContractFixture, formatAmount, getAmountInMax, wrapETH } from "./utils";
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

describe.only("ParaSwap", function () {
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
        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, impersonatedSigner);
        const beforeBalance = await usdcContract.balanceOf(TEST_ADDRESS);

        const provider = ethers.provider;
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
        const senderAddress = signer.address;

        // const providerOptionsEtherV6 = {
        //     ethersV6ProviderOrSigner: signer,
        //     EthersV6Contract: ethers.Contract,
        //     account: senderAddress,
        // };

        // const paraSwap = constructSimpleSDK({ chainId: 8453, axios }, providerOptionsEtherV6);

        const amount = ethers.parseUnits("0.1", 6).toString();

        // const quote = await paraSwap.quote.getQuote({
        //     srcToken: USDC_ADDRESS,
        //     destToken: USDbC_ADDRESS,
        //     amount,
        //     // userAddress: deployedContractAddress,
        //     srcDecimals: 6,
        //     destDecimals: 6,
        //     mode: "market",
        //     side: SwapSide.BUY,
        // });

        // console.log("quote:", quote);

        // const txHash = await paraSwap.swap.approveToken(quote.market.srcAmount, USDC_ADDRESS);

        // await provider.waitForTransaction(txHash);
        // console.log("txHash:", txHash);

        const url = "https://api.paraswap.io/swap";
        const params = {
            srcToken: "USDC",
            destToken: "USDbC",
            amount,
            side: "BUY",
            network: "8453",
            slippage: "1000",
            userAddress: deployedContractAddress,
        };
        const response = await axios.get(url, { params });

        const afterBalance = await usdcContract.balanceOf(TEST_ADDRESS);
        console.log("beforeBalance:", beforeBalance);
        console.log("afterBalance:", afterBalance);

        const contractBalance = await usdcContract.balanceOf(deployedContractAddress);
        console.log("contractBalance:", contractBalance);

        // const txParams = await paraSwap.swap.buildTx({
        //     srcToken: USDC_ADDRESS,
        //     srcDecimals: 6,
        //     destToken: USDbC_ADDRESS,
        //     destDecimals: 6,
        //     srcAmount: quote.market.srcAmount,
        //     destAmount: quote.market.destAmount,
        //     priceRoute: quote.market,
        //     userAddress: senderAddress,
        //     txOrigin: deployedContractAddress,
        // });

        const tx = await usdcContract.transfer(deployedContractAddress, ethers.parseUnits("3", 6));
        await tx.wait();

        await myContract.swapByParaswap(
            response.data.priceRoute.tokenTransferProxy,
            response.data.txParams.to,
            response.data.txParams.data,
        );

        const usdbcContract = new ethers.Contract(USDbC_ADDRESS, ERC20_ABI, impersonatedSigner);

        const afterContractBalance = await usdcContract.balanceOf(deployedContractAddress);
        console.log("source token Contract Balance:", afterContractBalance);

        const outputContractBalance = await usdbcContract.balanceOf(deployedContractAddress);
        console.log("output token Contract Balance:", outputContractBalance);
    });
});
