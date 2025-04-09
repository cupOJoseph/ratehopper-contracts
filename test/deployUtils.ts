import hre from "hardhat";
import { ethers } from "hardhat";
import {
    AAVE_V3_DATA_PROVIDER_ADDRESS,
    AAVE_V3_POOL_ADDRESS,
    cbETH_ADDRESS,
    DAI_ADDRESS,
    Protocols,
    USDC_ADDRESS,
} from "./constants";
import { MORPHO_ADDRESS } from "./protocols/morpho";
import { COMPTROLLER_ADDRESS, mcbETH, mDAI, mUSDC } from "./protocols/moonwell";
import { FLUID_VAULT_RESOLVER } from "./protocols/fluid";

async function deployHandlers() {
    const gasOptions = await getGasOptions();

    const AaveV3Handler = await hre.ethers.getContractFactory("AaveV3Handler");
    const aaveV3Handler = await AaveV3Handler.deploy(AAVE_V3_POOL_ADDRESS, AAVE_V3_DATA_PROVIDER_ADDRESS, gasOptions);
    console.log("AaveV3Handler deployed to:", await aaveV3Handler.getAddress());

    const CompoundHandler = await hre.ethers.getContractFactory("CompoundHandler");
    const compoundHandler = await CompoundHandler.deploy(gasOptions);

    const MoonwellHandler = await hre.ethers.getContractFactory("MoonwellHandler");
    const moonwellHandler = await MoonwellHandler.deploy(COMPTROLLER_ADDRESS, gasOptions);
    console.log("MoonwellHandler deployed to:", await moonwellHandler.getAddress());

    await moonwellHandler.setTokenMContract(cbETH_ADDRESS, mcbETH);
    await moonwellHandler.setTokenMContract(USDC_ADDRESS, mUSDC);
    await moonwellHandler.setTokenMContract(DAI_ADDRESS, mDAI);
    console.log("MoonwellHandler token mContracts set");

    console.log("mUSDC address:", await moonwellHandler.tokenToMContract(USDC_ADDRESS));

    const FluidHandler = await hre.ethers.getContractFactory("FluidSafeHandler");
    const fluidHandler = await FluidHandler.deploy(FLUID_VAULT_RESOLVER);
    console.log("FluidHandler deployed to:", await fluidHandler.getAddress());

    const MorphoHandler = await hre.ethers.getContractFactory("MorphoHandler");
    const morphoHandler = await MorphoHandler.deploy(MORPHO_ADDRESS);
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
export async function deployDebtSwapContractFixture() {
    const { aaveV3Handler, compoundHandler, moonwellHandler, fluidHandler, morphoHandler } = await deployHandlers();
    const DebtSwap = await hre.ethers.getContractFactory("DebtSwap");
    const debtSwap = await DebtSwap.deploy(
        [Protocols.AAVE_V3, Protocols.COMPOUND, Protocols.MORPHO],
        [aaveV3Handler.getAddress(), compoundHandler.getAddress(), morphoHandler.getAddress()],
        await getGasOptions(),
    );
    console.log("DebtSwap deployed to:", await debtSwap.getAddress());

    return debtSwap;
}

export async function deployLeveragedPositionContractFixture() {
    // Contracts are deployed using the first signer/account by default
    // const [owner, otherAccount] = await hre.ethers.getSigners();

    const { aaveV3Handler, compoundHandler, moonwellHandler, fluidHandler, morphoHandler } = await deployHandlers();

    const LeveragedPosition = await hre.ethers.getContractFactory("LeveragedPosition");
    const leveragedPosition = await LeveragedPosition.deploy(
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
    return leveragedPosition;
}

export async function deploySafeContractFixture() {
    const { aaveV3Handler, compoundHandler, moonwellHandler, fluidHandler, morphoHandler } = await deployHandlers();

    const SafeModule = await hre.ethers.getContractFactory("SafeModuleDebtSwap");
    const [owner, _, __, pauser] = await ethers.getSigners();
    const safeModule = await SafeModule.deploy(
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

    return safeModule;
}

async function getGasOptions() {
    const feeData = await ethers.provider.getFeeData();
    const gasPrice = feeData.gasPrice!;
    return {
        maxFeePerGas: gasPrice * BigInt(5),
    };
}
