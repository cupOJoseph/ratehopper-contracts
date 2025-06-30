import dotenv from "dotenv";
import { ethers } from "ethers";
dotenv.config();

async function main() {
    const ourContractAddress = "0x492340D1797c509617Ee66Ae5FB90528492aB2D6";
    const provider = new ethers.JsonRpcProvider("https://base.llamarpc.com");
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

    const safeModuleAbi = ["function setExecutor(address _executor)"];
    const safeModuleContract = new ethers.Contract(ourContractAddress, safeModuleAbi, signer);

    const executorAddress = "0xE549DE35b4D370B76c0A777653aD85Aef6eb8Fa4";

    console.log(`Setting executor to ${executorAddress}...`);
    const tx = await safeModuleContract.setExecutor(executorAddress);
    await tx.wait();
    console.log(`Executor set successfully in tx: ${tx.hash}`);
}

main().catch((error) => {
    console.error("Error executing Safe:", error);
});
