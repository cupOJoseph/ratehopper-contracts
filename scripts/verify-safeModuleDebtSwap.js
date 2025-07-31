const hre = require("hardhat");

async function main() {
    const contractAddress = "0x492340D1797c509617Ee66Ae5FB90528492aB2D6";

    // Define the constructor arguments
    const UNISWAP_V3_FACTORY_ADRESS = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
    const protocols = [0, 1, 2, 3, 4];
    const handlers = [
        "0x7f1be446C938c9046206eCbf803405A0B7741D3f", // AaveV3Handler
        "0xAc7DE99B36a0Eedac192a94d9da5A295439A3a5d", // CompoundHandler
        "0xb03B40507829d4Ec4b5681d566eA64CE0264Bf48", // MorphoHandler
        "0x00A2d752fD13743B236d5E4B77Db09E0bD132282", // FluidSafeHandler
        "0x61e1Da5Df8374BbF7209A38152EE1F73D755D809", // MoonwellHandler
    ];
    const pauserAddress = "0x9E073c36F63BF1c611026fdA1fF6007A81932231";

    console.log("Verifying SafeModuleDebtSwap contract...");

    try {
        await hre.run("verify:verify", {
            address: contractAddress,
            constructorArguments: [UNISWAP_V3_FACTORY_ADRESS, protocols, handlers, pauserAddress],
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
