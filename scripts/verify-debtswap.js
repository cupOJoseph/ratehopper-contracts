const hre = require("hardhat");

async function main() {
  const contractAddress = "0xbC6928382109A321227dDbc4385Dc3061443dA35";
  
  // Define the constructor arguments
  const protocols = [0, 1, 2]; // AAVE_V3, COMPOUND, MORPHO
  const handlers = [
    "0x3ea412D1d7D7414693f2355D107dbF40440Ff040", // AaveV3Handler
    "0x4D230ab22c49BB5D2C62d62aB7F3F19fa7B3E099", // CompoundHandler
    "0x18c2fB450f34e3089a6E5a9E501aA2692cE5d63e"  // MorphoHandler
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
