import hre from "hardhat";
import { ethers } from "hardhat";
import {
    AAVE_V3_POOL_ADDRESS,
    UNISWAP_V3_FACTORY_ADRESS,
    UNISWAP_V3_SWAP_ROUTER_ADDRESS,
} from "./constants";

// We define a fixture to reuse the same setup in every test.
// We use loadFixture to run this setup once, snapshot that state,
// and reset Hardhat Network to that snapshot in every test.
export async function deployContractFixture() {
    // Contracts are deployed using the first signer/account by default
    // const [owner, otherAccount] = await hre.ethers.getSigners();
    const AaveV3Handler = await hre.ethers.getContractFactory("AaveV3Handler");
    const aaveV3Handler = await AaveV3Handler.deploy(AAVE_V3_POOL_ADDRESS);

    const CompoundHandler = await hre.ethers.getContractFactory("CompoundHandler");
    const compoundHandler = await CompoundHandler.deploy();

    const ProtocolRegistry = await hre.ethers.getContractFactory("ProtocolRegistry");
    const protocolRegistry = await ProtocolRegistry.deploy(
        aaveV3Handler.getAddress(),
        compoundHandler.getAddress(),
    );

    const DebtSwap = await hre.ethers.getContractFactory("DebtSwap");
    const debtSwap = await DebtSwap.deploy(
        protocolRegistry.getAddress(),
        UNISWAP_V3_FACTORY_ADRESS,
        UNISWAP_V3_SWAP_ROUTER_ADDRESS,
    );

    return {
        debtSwap,
    };
}

export function getAmountInMax(amountOut: bigint): bigint {
    // Suppose 1% slippage is allowed. must be fetched from quote to get actual slippage
    const slippage = 1.01;
    const scaleFactor = 100n;
    const multiplier = BigInt(slippage * Number(scaleFactor));
    return (amountOut * multiplier) / scaleFactor;
}

export function formatAmount(amount: bigint): string {
    return ethers.formatUnits(String(amount), 6);
}
