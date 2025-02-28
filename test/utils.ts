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
import { COMPTROLLER_ADDRESS } from "./protocols/moonwell";
import { FLUID_VAULT_RESOLVER } from "./protocols/fluid";
import axios from "axios";

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

    const AaveV3Handler = await hre.ethers.getContractFactory("AaveV3Handler");
    const aaveV3Handler = await AaveV3Handler.deploy(AAVE_V3_POOL_ADDRESS, AAVE_V3_DATA_PROVIDER_ADDRESS, {
        maxFeePerGas: gasPrice * BigInt(5),
    });
    console.log("AaveV3Handler deployed to:", await aaveV3Handler.getAddress());

    const CompoundHandler = await hre.ethers.getContractFactory("CompoundHandler");
    const compoundHandler = await CompoundHandler.deploy({
        maxFeePerGas: gasPrice * BigInt(5),
    });

    const MorphoHandler = await hre.ethers.getContractFactory("MorphoHandler");
    const morphoHandler = await MorphoHandler.deploy(MORPHO_ADDRESS);

    const DebtSwap = await hre.ethers.getContractFactory("DebtSwap");
    const debtSwap = await DebtSwap.deploy(
        [Protocols.AAVE_V3, Protocols.COMPOUND, Protocols.MORPHO],
        [aaveV3Handler.getAddress(), compoundHandler.getAddress(), morphoHandler.getAddress()],
        {
            maxFeePerGas: gasPrice * BigInt(5),
        },
    );
    console.log("DebtSwap deployed to:", await debtSwap.getAddress());

    const LeveragedPosition = await hre.ethers.getContractFactory("LeveragedPosition");
    const leveragedPosition = await LeveragedPosition.deploy(
        [Protocols.AAVE_V3, Protocols.COMPOUND, Protocols.MORPHO],
        [aaveV3Handler.getAddress(), compoundHandler.getAddress(), morphoHandler.getAddress()],
        {
            maxFeePerGas: gasPrice * BigInt(5),
        },
    );

    console.log("LeveragedPosition deployed to:", await leveragedPosition.getAddress());

    return {
        debtSwap,
        leveragedPosition,
    };
}

export async function deploySafeContractFixture() {
    const feeData = await ethers.provider.getFeeData();
    const gasPrice = feeData.gasPrice!;
    const ProtocolRegistry = await hre.ethers.getContractFactory("ProtocolRegistry");
    const protocolRegistry = await ProtocolRegistry.deploy({
        maxFeePerGas: gasPrice * BigInt(5),
    });

    const AaveV3SafeHandler = await hre.ethers.getContractFactory("AaveV3SafeHandler");
    const aaveV3Handler = await AaveV3SafeHandler.deploy(AAVE_V3_POOL_ADDRESS, AAVE_V3_DATA_PROVIDER_ADDRESS, {
        maxFeePerGas: gasPrice * BigInt(5),
    });
    console.log("AaveV3Handler deployed to:", await aaveV3Handler.getAddress());

    const MoonwellHandler = await hre.ethers.getContractFactory("MoonwellHandler");
    const moonwellHandler = await MoonwellHandler.deploy(COMPTROLLER_ADDRESS, {
        maxFeePerGas: gasPrice * BigInt(5),
    });
    console.log("MoonwellHandler deployed to:", await moonwellHandler.getAddress());

    const FluidHandler = await hre.ethers.getContractFactory("FluidSafeHandler");
    const fluidHandler = await FluidHandler.deploy(FLUID_VAULT_RESOLVER);
    console.log("FluidHandler deployed to:", await fluidHandler.getAddress());

    const SafeModule = await hre.ethers.getContractFactory("SafeModule");
    const safeModule = await SafeModule.deploy(   
        [Protocols.AAVE_V3, Protocols.MOONWELL, Protocols.FLUID],
        [aaveV3Handler.getAddress(), moonwellHandler.getAddress(), fluidHandler.getAddress()],, {
        maxFeePerGas: gasPrice * BigInt(5),
    });

    console.log("SafeModule deployed to:", await safeModule.getAddress());

    return {
        safeModule,
    };
}

export async function approve(tokenAddress: string, spenderAddress: string, signer: HardhatEthersSigner) {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const approveTx = await token.approve(spenderAddress, MaxUint256, { maxFeePerGas: 40_000_000 });
    await approveTx.wait();
    console.log("approve:" + tokenAddress + "token to " + spenderAddress);
}

export async function getDecimals(tokenAddress: string, signer: HardhatEthersSigner): Promise<number> {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    return await tokenContract.decimals();
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

export async function getParaswapData(
    destToken: string,
    srcToken: string,
    contractAddress: string,
    amount: bigint,
    srcDecimals = 6,
    destDecimals = 6,
) {
    const url = "https://api.paraswap.io/swap";

    // suppose flashloan fee is 0.01%, must be fetched dynamically
    // use the Ceiling Division formula
    const amountPlusFee = amount + (amount * 1n + 9999n) / 10000n;

    // deal with debt amount is slightly increased after getting quote from Dex aggregator
    const amountPlusBuffer = (BigInt(amountPlusFee) * 100001n) / 100000n;

    const params = {
        srcToken,
        srcDecimals,
        destToken,
        destDecimals,
        amount: amountPlusBuffer,
        // side must be BUY to use exactAmountOutSwap
        side: "BUY",
        network: "8453",
        // 2% slippage, should be passed by user dynamically
        slippage: "200",
        userAddress: contractAddress,
        // exclude Uniswap V3 to avoid conflict with flashloan pool. More sophisticated mechanism should be implemented
        excludeDEXS: "UniswapV3",
    };

    try {
        const response = await axios.get(url, { params });
        if (!response?.data?.txParams || !response?.data?.priceRoute) {
            throw new Error("Invalid response from ParaSwap API");
        }

        console.log("selected dex:", response.data.priceRoute.bestRoute[0].swaps[0].swapExchanges[0].exchange);

        return [
            response.data.priceRoute.srcAmount,
            {
                router: response.data.txParams.to,
                tokenTransferProxy: response.data.priceRoute.tokenTransferProxy,
                swapData: response.data.txParams.data,
            },
        ];
    } catch (error) {
        console.error("Error fetching data from ParaSwap API:", error);
        throw new Error("Failed to fetch ParaSwap data");
    }
}
