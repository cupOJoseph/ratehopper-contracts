import hre from "hardhat";
import { ethers } from "hardhat";
import {
    AAVE_V3_DATA_PROVIDER_ADDRESS,
    AAVE_V3_POOL_ADDRESS,
    cbETH_ADDRESS,
    DAI_ADDRESS,
    PARASWAP_ROUTER_ADDRESS,
    PARASWAP_TOKEN_TRANSFER_PROXY_ADDRESS,
    Protocols,
    UNISWAP_V3_FACTORY_ADRESS,
    USDC_ADDRESS,
} from "./constants";
import { MORPHO_ADDRESS } from "./protocols/morpho";
import { COMPTROLLER_ADDRESS, mcbETH, mDAI, mUSDC } from "./protocols/moonwell";
import { deployProtocolRegistry } from "./deployProtocolRegistry";
import { FLUID_VAULT_RESOLVER } from "./protocols/fluid";

async function deployMaliciousContract() {
    const [_, maliciousAddress] = await ethers.getSigners();
    const MaliciousContract = await hre.ethers.getContractFactory("MaliciousContract");
    const maliciousContract = await MaliciousContract.deploy(maliciousAddress.address);
    await maliciousContract.waitForDeployment();
    console.log("MaliciousContract deployed to:", await maliciousContract.getAddress());
    return maliciousContract;
}

export async function deployHandlers() {
    const AaveV3Handler = await hre.ethers.getContractFactory("AaveV3Handler");
    const aaveV3Handler = await AaveV3Handler.deploy(
        AAVE_V3_POOL_ADDRESS,
        AAVE_V3_DATA_PROVIDER_ADDRESS,
        UNISWAP_V3_FACTORY_ADRESS,
        await getGasOptions(),
    );
    console.log("AaveV3Handler deployed to:", await aaveV3Handler.getAddress());

    const protocolRegistry = await deployProtocolRegistry();
    const registryAddress = await protocolRegistry.getAddress();

    const CompoundHandler = await hre.ethers.getContractFactory("CompoundHandler");
    const compoundHandler = await CompoundHandler.deploy(registryAddress, await getGasOptions());
    await compoundHandler.waitForDeployment();
    console.log("CompoundHandler deployed to:", await compoundHandler.getAddress());

    const MoonwellHandler = await hre.ethers.getContractFactory("MoonwellHandler");
    const moonwellHandler = await MoonwellHandler.deploy(COMPTROLLER_ADDRESS, registryAddress, await getGasOptions());
    console.log("MoonwellHandler deployed to:", await moonwellHandler.getAddress());

    const FluidHandler = await hre.ethers.getContractFactory("FluidSafeHandler");
    const fluidHandler = await FluidHandler.deploy(FLUID_VAULT_RESOLVER, await getGasOptions());
    console.log("FluidHandler deployed to:", await fluidHandler.getAddress());

    const MorphoHandler = await hre.ethers.getContractFactory("MorphoHandler");
    const morphoHandler = await MorphoHandler.deploy(MORPHO_ADDRESS, await getGasOptions());
    console.log("MorphoHandler deployed to:", await morphoHandler.getAddress());

    return {
        aaveV3Handler,
        compoundHandler,
        moonwellHandler,
        fluidHandler,
        morphoHandler,
    };
}

// We define a fixture to reuse the same setup in every test.
// We use loadFixture to run this setup once, snapshot that state,
// and reset Hardhat Network to that snapshot in every test.
export async function deployDebtSwapContractWithMaliciousHandlerFixture() {
    const maliciousContract = await deployMaliciousContract();
    const DebtSwap = await hre.ethers.getContractFactory("DebtSwap");
    const debtSwapMalicious = await DebtSwap.deploy(
        UNISWAP_V3_FACTORY_ADRESS,
        [Protocols.AAVE_V3],
        [maliciousContract.getAddress()],
        await getGasOptions(),
    );
    console.log("DebtSwapMalicious deployed to:", await debtSwapMalicious.getAddress());

    debtSwapMalicious.setParaswapAddresses(PARASWAP_TOKEN_TRANSFER_PROXY_ADDRESS, PARASWAP_ROUTER_ADDRESS);

    return debtSwapMalicious;
}

// We define a fixture to reuse the same setup in every test.
// We use loadFixture to run this setup once, snapshot that state,
// and reset Hardhat Network to that snapshot in every test.
export async function deployDebtSwapContractFixture() {
    const { aaveV3Handler, compoundHandler, moonwellHandler, fluidHandler, morphoHandler } = await deployHandlers();
    const DebtSwap = await hre.ethers.getContractFactory("DebtSwap");
    const debtSwap = await DebtSwap.deploy(
        UNISWAP_V3_FACTORY_ADRESS,
        [Protocols.AAVE_V3, Protocols.COMPOUND, Protocols.MORPHO],
        [aaveV3Handler.getAddress(), compoundHandler.getAddress(), morphoHandler.getAddress()],
        await getGasOptions(),
    );
    console.log("DebtSwap deployed to:", await debtSwap.getAddress());

    debtSwap.setParaswapAddresses(PARASWAP_TOKEN_TRANSFER_PROXY_ADDRESS, PARASWAP_ROUTER_ADDRESS);

    return debtSwap;
}

export async function deployLeveragedPositionContractFixture() {
    // Contracts are deployed using the first signer/account by default
    // const [owner, otherAccount] = await hre.ethers.getSigners();

    const { aaveV3Handler, compoundHandler, moonwellHandler, fluidHandler, morphoHandler } = await deployHandlers();

    const LeveragedPosition = await hre.ethers.getContractFactory("LeveragedPosition");
    const leveragedPosition = await LeveragedPosition.deploy(
        UNISWAP_V3_FACTORY_ADRESS,
        [Protocols.AAVE_V3, Protocols.COMPOUND, Protocols.MORPHO, Protocols.MOONWELL, Protocols.FLUID],
        [
            aaveV3Handler.getAddress(),
            compoundHandler.getAddress(),
            morphoHandler.getAddress(),
            moonwellHandler.getAddress(),
            fluidHandler.getAddress(),
        ],
        await getGasOptions(),
    );

    console.log("LeveragedPosition deployed to:", await leveragedPosition.getAddress());

    leveragedPosition.setParaswapAddresses(PARASWAP_TOKEN_TRANSFER_PROXY_ADDRESS, PARASWAP_ROUTER_ADDRESS);
    return leveragedPosition;
}

export async function deploySafeContractFixture() {
    const { aaveV3Handler, compoundHandler, moonwellHandler, fluidHandler, morphoHandler } = await deployHandlers();

    const SafeModule = await hre.ethers.getContractFactory("SafeModuleDebtSwap");
    const [owner, _, __, pauser] = await ethers.getSigners();
    const safeModule = await SafeModule.deploy(
        UNISWAP_V3_FACTORY_ADRESS,
        [Protocols.AAVE_V3, Protocols.COMPOUND, Protocols.MORPHO, Protocols.MOONWELL, Protocols.FLUID],
        [
            aaveV3Handler.getAddress(),
            compoundHandler.getAddress(),
            morphoHandler.getAddress(),
            moonwellHandler.getAddress(),
            fluidHandler.getAddress(),
        ],
        pauser.address,
        await getGasOptions(),
    );

    console.log("SafeModule deployed to:", await safeModule.getAddress());

    safeModule.setParaswapAddresses(PARASWAP_TOKEN_TRANSFER_PROXY_ADDRESS, PARASWAP_ROUTER_ADDRESS);

    return safeModule;
}

export async function getGasOptions() {
    const feeData = await ethers.provider.getFeeData();
    // Fallbacks in case values are undefined
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? ethers.parseUnits("1", "gwei");
    const baseFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits("1", "gwei");
    // Add a buffer (e.g. +20%) to avoid being too close to the base fee
    const maxFeePerGas = (baseFeePerGas * 12n) / 10n + maxPriorityFeePerGas;
    return {
        maxFeePerGas,
        maxPriorityFeePerGas,
    };
}
