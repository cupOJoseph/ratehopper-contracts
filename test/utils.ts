import hre from "hardhat";
import { ethers } from "hardhat";
import {
    AAVE_V3_DATA_PROVIDER_ADDRESS,
    AAVE_V3_POOL_ADDRESS,
    Protocols,
    TEST_ADDRESS,
    UNISWAP_V3_FACTORY_ADRESS,
    UNISWAP_V3_SWAP_ROUTER_ADDRESS,
    WETH_ADDRESS,
} from "./constants";
import { abi as ERC20_ABI } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { Contract, MaxUint256 } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import WETH_ABI from "../externalAbi/weth.json";
import { MORPHO_ADDRESS } from "./protocols/morpho";
import { AaveV3Helper } from "./protocols/aaveV3";
import { CompoundHelper } from "./protocols/compound";
import { MorphoHelper } from "./protocols/morpho";

export const protocolHelperMap = new Map<Protocols, any>([
    [Protocols.AAVE_V3, AaveV3Helper],
    [Protocols.COMPOUND, CompoundHelper],
    [Protocols.MORPHO, MorphoHelper],
]);

// We define a fixture to reuse the same setup in every test.
// We use loadFixture to run this setup once, snapshot that state,
// and reset Hardhat Network to that snapshot in every test.
export async function deployContractFixture() {
    // Contracts are deployed using the first signer/account by default
    // const [owner, otherAccount] = await hre.ethers.getSigners();
    const feeData = await ethers.provider.getFeeData();
    const gasPrice = feeData.gasPrice!;

    const SafeModule = await hre.ethers.getContractFactory("SafeModule");
    const safeModule = await SafeModule.deploy(TEST_ADDRESS);

    const TargetContract = await hre.ethers.getContractFactory("TargetContract");
    const targetContract = await TargetContract.deploy();

    console.log("SafeModule deployed to:", await safeModule.getAddress());

    const AaveV3Handler = await hre.ethers.getContractFactory("AaveV3Handler");
    const aaveV3Handler = await AaveV3Handler.deploy(
        AAVE_V3_POOL_ADDRESS,
        AAVE_V3_DATA_PROVIDER_ADDRESS,
        {
            maxFeePerGas: gasPrice * BigInt(5),
        },
    );

    const CompoundHandler = await hre.ethers.getContractFactory("CompoundHandler");
    const compoundHandler = await CompoundHandler.deploy();

    const MorphoHandler = await hre.ethers.getContractFactory("MorphoHandler");
    const morphoHandler = await MorphoHandler.deploy(MORPHO_ADDRESS);

    // const FluidHandler = await hre.ethers.getContractFactory("FluidHandler");
    // const fluidHandler = await FluidHandler.deploy();

    const ProtocolRegistry = await hre.ethers.getContractFactory("ProtocolRegistry");
    const protocolRegistry = await ProtocolRegistry.deploy();

    await protocolRegistry.setHandler(Protocols.AAVE_V3, aaveV3Handler.getAddress());
    await protocolRegistry.setHandler(Protocols.COMPOUND, compoundHandler.getAddress());
    await protocolRegistry.setHandler(Protocols.MORPHO, morphoHandler.getAddress());

    const DebtSwap = await hre.ethers.getContractFactory("DebtSwap");
    const debtSwap = await DebtSwap.deploy(
        UNISWAP_V3_FACTORY_ADRESS,
        UNISWAP_V3_SWAP_ROUTER_ADDRESS,
        {
            maxFeePerGas: gasPrice * BigInt(5),
        },
    );
    console.log("DebtSwap deployed to:", await debtSwap.getAddress());
    await debtSwap.setRegistry(protocolRegistry.getAddress());

    const LeveragedPosition = await hre.ethers.getContractFactory("LeveragedPosition");
    const leveragedPosition = await LeveragedPosition.deploy(
        UNISWAP_V3_FACTORY_ADRESS,
        UNISWAP_V3_SWAP_ROUTER_ADDRESS,
    );

    console.log("LeveragedPosition deployed to:", await leveragedPosition.getAddress());
    await leveragedPosition.setRegistry(protocolRegistry.getAddress());

    return {
        debtSwap,
        leveragedPosition,
        safeModule,
        targetContract,
    };
}

export async function approve(
    tokenAddress: string,
    spenderAddress: string,
    signer: HardhatEthersSigner,
) {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const approveTx = await token.approve(spenderAddress, MaxUint256);
    await approveTx.wait();
    console.log("approve:" + tokenAddress + "token to " + spenderAddress);
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

export async function wrapETH(amountIn: string, signer: HardhatEthersSigner) {
    const wethContract = new ethers.Contract(WETH_ADDRESS, WETH_ABI, signer);

    const amount = ethers.parseEther(amountIn);
    const tx = await wethContract.deposit({ value: amount });
    await tx.wait();
    console.log("Wrapped ETH to WETH:", amount);
}
