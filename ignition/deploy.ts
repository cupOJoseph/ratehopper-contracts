import hre from "hardhat";
import { ethers } from "hardhat";
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { PARASWAP_ROUTER_ADDRESS, PARASWAP_TOKEN_TRANSFER_PROXY_ADDRESS, UNISWAP_V3_FACTORY_ADRESS } from "./constants";
import { getCTokenMappingArrays, getMTokenMappingArrays } from "../contractAddresses";

// Define constants directly in this file to avoid importing from test files
const AAVE_V3_POOL_ADDRESS = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const AAVE_V3_DATA_PROVIDER_ADDRESS = "0xd82a47fdebB5bf5329b09441C3DaB4b5df2153Ad";
const MORPHO_ADDRESS = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

// Define Protocol enum directly
enum Protocol {
    AAVE_V3,
    COMPOUND,
    MORPHO,
    FLUID,
    MOONWELL,
}

// First define ProtocolRegistry module
const ProtocolRegistryModule = buildModule("ProtocolRegistry", (m) => {
    const registry = m.contract("ProtocolRegistry", []);
    return { registry };
});

// Handler modules will depend on the registry address
const AaveV3Module = buildModule("AaveV3Handler", (m) => {
    // Get the registry from the ProtocolRegistry module
    const { registry } = m.useModule(ProtocolRegistryModule);

    // Pass registry address to AaveV3Handler constructor
    const aaveV3Handler = m.contract("AaveV3Handler", [
        AAVE_V3_POOL_ADDRESS,
        AAVE_V3_DATA_PROVIDER_ADDRESS,
        UNISWAP_V3_FACTORY_ADRESS,
        registry,
    ]);

    return { aaveV3Handler };
});

const CompoundModule = buildModule("CompoundHandler", (m) => {
    // Get the registry from the ProtocolRegistry module
    const { registry } = m.useModule(ProtocolRegistryModule);

    // Pass registry address to CompoundHandler constructor
    const compoundHandler = m.contract("CompoundHandler", [registry, UNISWAP_V3_FACTORY_ADRESS]);

    return { compoundHandler };
});

const MorphoModule = buildModule("MorphoHandler", (m) => {
    // Get the registry from the ProtocolRegistry module
    const { registry } = m.useModule(ProtocolRegistryModule);

    // Pass registry address to MorphoHandler constructor
    const morphoHandler = m.contract("MorphoHandler", [MORPHO_ADDRESS, UNISWAP_V3_FACTORY_ADRESS, registry]);

    return { morphoHandler };
});

async function main() {
    try {
        // Deploy the registry first
        const { registry } = await hre.ignition.deploy(ProtocolRegistryModule);
        const registryAddress = await registry.getAddress();
        console.log(`ProtocolRegistry deployed to: ${registryAddress}`);

        const [mTokens, mContracts] = getMTokenMappingArrays();
        await registry.batchSetTokenMContracts(mTokens, mContracts);
        console.log("Moonwell token mappings set in ProtocolRegistry");

        const [cTokens, cContracts] = getCTokenMappingArrays();
        await registry.batchSetTokenCContracts(cTokens, cContracts);
        console.log("Compound token mappings set in ProtocolRegistry");

        // Now deploy all handlers (they will use the registry)
        console.log("Deploying AaveV3Handler...");
        const { aaveV3Handler } = await hre.ignition.deploy(AaveV3Module);
        const aaveV3HandlerAddress = await aaveV3Handler.getAddress();
        console.log(`AaveV3Handler deployed to: ${aaveV3HandlerAddress}`);

        console.log("Deploying CompoundHandler...");
        const { compoundHandler } = await hre.ignition.deploy(CompoundModule);
        const compoundHandlerAddress = await compoundHandler.getAddress();
        console.log(`CompoundHandler deployed to: ${compoundHandlerAddress}`);

        console.log("Deploying MorphoHandler...");
        const { morphoHandler } = await hre.ignition.deploy(MorphoModule);
        const morphoHandlerAddress = await morphoHandler.getAddress();
        console.log(`MorphoHandler deployed to: ${morphoHandlerAddress}`);

        // Add tokens to whitelist in the registry
        console.log("Adding tokens to whitelist in registry...");

        // token addresses
        const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
        const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Circle
        const USDbC_ADDRESS = "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA"; // Coinbase
        const cbETH_ADDRESS = "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22";
        const cbBTC_ADDRESS = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
        const eUSD_ADDRESS = "0xCfA3Ef56d303AE4fAabA0592388F19d7C3399FB4";
        const MAI_ADDRESS = "0xbf1aeA8670D2528E08334083616dD9C5F3B087aE";
        const DAI_ADDRESS = "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb";
        const sUSDS_ADDRESS = "0x5875eee11cf8398102fdad704c9e96607675467a";
        const AERO_ADDRESS = "0x940181a94a35a4569e4529a3cdfb74e38fd98631";
        const wstETH_ADDRESS = "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452";
        const rETH_ADDRESS = "0xB6fe221Fe9EeF5aBa221c348bA20A1Bf5e73624c";
        const weETH_ADDRESS = "0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A";
        const EURC_ADDRESS = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42";
        const wrsETH_ADDRESS = "0xedfa23602d0ec14714057867a78d01e94176bea0";
        const WELL_ADDRESS = "0xA88594D404727625A9437C3f886C7643872296AE";
        const USDS_ADDRESS = "0x820c137fa70c8691f0e44dc420a5e53c168921dc";
        const tBTC_ADDRESS = "0x236aa50979d5f3de3bd1eeb40e81137f22ab794b";
        const LBTC_ADDRESS = "0xecAc9C5F704e954931349Da37F60E39f515c11c1";
        const VIRTUAL_ADDRESS = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";

        await registry.addToWhitelistBatch([
            USDC_ADDRESS,
            cbETH_ADDRESS,
            WETH_ADDRESS,
            USDbC_ADDRESS,
            cbBTC_ADDRESS,
            eUSD_ADDRESS,
            MAI_ADDRESS,
            DAI_ADDRESS,
            sUSDS_ADDRESS,
            AERO_ADDRESS,
            wstETH_ADDRESS,
            rETH_ADDRESS,
            weETH_ADDRESS,
            EURC_ADDRESS,
            wrsETH_ADDRESS,
            WELL_ADDRESS,
            USDS_ADDRESS,
            tBTC_ADDRESS,
            LBTC_ADDRESS,
            VIRTUAL_ADDRESS,
        ]);
        console.log("Tokens added to whitelist");

        // Deploy DebtSwap directly using ethers
        console.log("Deploying DebtSwap directly...");
        const DebtSwapFactory = await ethers.getContractFactory("DebtSwap");

        const protocols = [Protocol.AAVE_V3, Protocol.COMPOUND, Protocol.MORPHO];
        const handlers = [aaveV3HandlerAddress, compoundHandlerAddress, morphoHandlerAddress];

        const debtSwap = await DebtSwapFactory.deploy(UNISWAP_V3_FACTORY_ADRESS, protocols, handlers);
        await debtSwap.waitForDeployment();

        console.log(`DebtSwap deployed to: ${await debtSwap.getAddress()}`);

        await debtSwap.setParaswapAddresses(PARASWAP_TOKEN_TRANSFER_PROXY_ADDRESS, PARASWAP_ROUTER_ADDRESS);
        console.log("Paraswap addresses set");
    } catch (error) {
        console.error("Deployment error:", error);
    }
}

main().catch(console.error);
