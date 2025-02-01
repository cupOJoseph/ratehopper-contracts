import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, MaxUint256 } from "ethers";
import { cbBTC_ADDRESS, DEFAULT_SUPPLY_AMOUNT, TEST_ADDRESS } from "../constants";

import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { approve, formatAmount } from "../utils";

const MErc20DelegatorAbi = require("../../externalAbi/moonwell/MErc20Delegator.json");
const ComptrollerAbi = require("../../externalAbi/moonwell/comptroller.json");
const ViewAbi = require("../../externalAbi/moonwell/moonwellViewsV3.json");
const comptroller_address = "0xfbb21d0380bee3312b33c4353c8936a0f13ef26c";
const view_address = "0x821ff3a967b39bcbe8a018a9b1563eaf878bad39";

export class MoonwellHelper {
    constructor(private signer: HardhatEthersSigner | any) {}

    async getCollateralAmount(mContractAddress: string, userAddress?: string): Promise<bigint> {
        const viewContract = new ethers.Contract(view_address, ViewAbi, this.signer);
        const collaterals = await viewContract.getUserBalances(userAddress || TEST_ADDRESS);

        const collateralEntry = collaterals.find(
            (collateral) => collateral[1].toLowerCase() === mContractAddress,
        );

        const mToken = new ethers.Contract(mContractAddress, MErc20DelegatorAbi, this.signer);
        const exchangeRate = await mToken.exchangeRateStored();
        const rate = ethers.formatEther(exchangeRate);

        const collateralAmount = collateralEntry
            ? collateralEntry[0] * BigInt(Number(rate).toFixed())
            : 0;

        console.log("collateralAmount:", ethers.formatUnits(collateralAmount, 18));
        return BigInt(collateralAmount);
    }

    async getDebtAmount(mContractAddress: string, userAddress?: string): Promise<bigint> {
        const viewContract = new ethers.Contract(view_address, ViewAbi, this.signer);
        const borrows = await viewContract.getUserBorrowsBalances(userAddress || TEST_ADDRESS);

        const debtEntry = borrows.find((borrow) => borrow[1].toLowerCase() === mContractAddress);
        const debtAmount = debtEntry ? debtEntry[0] : BigInt(0);

        console.log("debtAmount:", ethers.formatUnits(debtAmount, 6));
        return debtAmount;
    }

    async supply(mContractAddress: string) {
        const amount = ethers.parseUnits(DEFAULT_SUPPLY_AMOUNT.toString(), 18);
        const mToken = new ethers.Contract(mContractAddress, MErc20DelegatorAbi, this.signer);

        const tx = await mToken.mint(amount);
        await tx.wait();
        console.log("supply on moonwell:", amount);
    }

    async enableCollateral(mContractAddress: string) {
        const comptroller = new ethers.Contract(comptroller_address, ComptrollerAbi, this.signer);
        const tx = await comptroller.enterMarkets([mContractAddress]);
        await tx.wait();
        console.log("enabled collateral on moonwell:", mContractAddress);
    }

    async borrow(mContractAddress: string) {
        const amount = ethers.parseUnits("1", 6);
        const mToken = new ethers.Contract(mContractAddress, MErc20DelegatorAbi, this.signer);
        const tx = await mToken.borrow(amount);
        await tx.wait();
        console.log("borrow on moonwell:", amount);
    }

    async repay(mContractAddress: string, amount: string) {
        const repayAmount = ethers.parseUnits(amount, 6);
        const mToken = new ethers.Contract(mContractAddress, MErc20DelegatorAbi, this.signer);
        const tx = await mToken.repayBorrow(repayAmount);
        await tx.wait();
        console.log("repaid debt on moonwell:", repayAmount);
    }

    async withdrawCollateral(mContractAddress: string, amount: string) {
        const withdrawAmount = ethers.parseUnits(amount, 18);
        const mToken = new ethers.Contract(mContractAddress, MErc20DelegatorAbi, this.signer);
        const tx = await mToken.redeemUnderlying(withdrawAmount);
        // const tx = await mToken.redeem();
        await tx.wait();
        console.log("withdrawn collateral from moonwell:", withdrawAmount);
    }
}
