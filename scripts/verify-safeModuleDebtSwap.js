const hre = require("hardhat");

async function main() {
    const contractAddress = "0x3F52CD8E0566E28C0C6CAA106BcCD9D28D6460a6";

    // Define the constructor arguments
    const UNISWAP_V3_FACTORY_ADRESS = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
    const protocols = [0, 1, 2, 3, 4];
    const handlers = [
        "0x3ea412D1d7D7414693f2355D107dbF40440Ff040", // AaveV3Handler
        "0xAe427721B0c0EB2321Ee475F4147Aaa1E65013d7", // CompoundHandler
        "0x18c2fB450f34e3089a6E5a9E501aA2692cE5d63e", // MorphoHandler
        "0x2a578C41B816ba895885e31031db1E3a539660B9", // FluidSafeHandler
        "0x12084Ee0Ae2D12ae622E995Fc174aae8e7178B19", // MoonwellHandler
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
