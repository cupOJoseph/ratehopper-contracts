const hre = require("hardhat");

async function main() {
    const contractAddress = "0x85C434815d00352BBab9a90b884D1c299aEf9969";

    // Define the constructor arguments
    const protocols = [0, 1, 2, 3, 4];
    const handlers = [
        "0x3ea412D1d7D7414693f2355D107dbF40440Ff040", // AaveV3Handler
        "0x7410abF1e92187A1ded8d615A866541cF92dE74B", // CompoundHandler
        "0x18c2fB450f34e3089a6E5a9E501aA2692cE5d63e", // MorphoHandler
        "0xB6e7cDF6Cc57308a1a996704D85C351aBc317f1A", // FluidSafeHandler
        "0xCAaC42dCab2F28095D02F07A4fF9Db7b508F93fB", // MoonwellHandler
    ];
    const pauserAddress = "0x9E073c36F63BF1c611026fdA1fF6007A81932231";

    console.log("Verifying SafeModuleDebtSwap contract...");

    try {
        await hre.run("verify:verify", {
            address: contractAddress,
            constructorArguments: [protocols, handlers, pauserAddress],
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
