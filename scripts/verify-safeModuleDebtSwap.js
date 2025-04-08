const hre = require("hardhat");

async function main() {
    const contractAddress = "0xe551D6Cd14B3b193818513267f41119A04092575";

    // Define the constructor arguments
    const protocols = [0, 1, 2, 3, 4];
    const handlers = [
        "0x3ea412D1d7D7414693f2355D107dbF40440Ff040", // AaveV3Handler
        "0x4D230ab22c49BB5D2C62d62aB7F3F19fa7B3E099", // CompoundHandler
        "0x18c2fB450f34e3089a6E5a9E501aA2692cE5d63e", // MorphoHandler
        "0x252BcD8D00f13d930dFa936b24a99720002d46f3", // FluidSafeHandler
        "0xc4A57e04093Df2C8eE08B19D810E73C6CB579Cc4", // MoonwellHandler
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
