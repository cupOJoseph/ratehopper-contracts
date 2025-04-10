const hre = require("hardhat");

async function main() {
    const contractAddress = "0xbe986C4e4C716f37c424E9Ff8c7E544Ba9cE119E";

    // Define the constructor arguments
    const protocols = [0, 1, 2]; // AAVE_V3, COMPOUND, MORPHO
    const handlers = [
        "0x3ea412D1d7D7414693f2355D107dbF40440Ff040", // AaveV3Handler
        "0x7410abF1e92187A1ded8d615A866541cF92dE74B", // CompoundHandler
        "0x18c2fB450f34e3089a6E5a9E501aA2692cE5d63e", // MorphoHandler
    ];

    console.log("Verifying DebtSwap contract...");

    try {
        await hre.run("verify:verify", {
            address: contractAddress,
            constructorArguments: [protocols, handlers],
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
