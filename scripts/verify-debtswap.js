const hre = require("hardhat");

async function main() {
    const contractAddress = "0x7c60013D3ad4C4696F80f56FF42f806c6fB11e69";

    // Define the constructor arguments
    // Prepare constructor arguments
    const UNISWAP_V3_FACTORY_ADRESS = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
    const protocols = [0, 1, 2]; // AAVE_V3, COMPOUND, MORPHO
    const handlers = [
        "0x7f1be446C938c9046206eCbf803405A0B7741D3f", // AaveV3Handler
        "0xAc7DE99B36a0Eedac192a94d9da5A295439A3a5d", // CompoundHandler
        "0xb03B40507829d4Ec4b5681d566eA64CE0264Bf48", // MorphoHandler
    ];

    console.log("Verifying DebtSwap contract...");

    try {
        await hre.run("verify:verify", {
            address: contractAddress,
            constructorArguments: [UNISWAP_V3_FACTORY_ADRESS, protocols, handlers],
        });
        console.log("Verification successful!");
    } catch (error) {
        console.error("Verification failed:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
