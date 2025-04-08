import Safe from "@safe-global/protocol-kit";
import { MetaTransactionData, OperationType } from "@safe-global/types-kit";
import dotenv from "dotenv";
dotenv.config();
import { ethers } from "ethers";
import cometAbi from "../../externalAbi/compound/comet.json";

const safeAddress = "0x169EeC0c73a76a520e4cFd8Bb982c5237C3f4977";
const safeModuleAddress = "0xe551d6cd14b3b193818513267f41119a04092575";
//usdbc comet
const cometAddress = "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf";

async function main() {
    const safeWallet = await Safe.init({
        provider: "https://base.llamarpc.com",
        signer: process.env.MY_SAFE_OWNER_KEY!,
        safeAddress,
    });

    const signer = new ethers.Wallet(process.env.MY_SAFE_OWNER_KEY!);

    const comet = new ethers.Contract(cometAddress, cometAbi, signer);

    const allowTransactionData: MetaTransactionData = {
        to: cometAddress,
        value: "0",
        data: comet.interface.encodeFunctionData("allow", [safeModuleAddress, true]),
        operation: OperationType.Call,
    };

    const safeTransaction = await safeWallet.createTransaction({
        transactions: [allowTransactionData],
    });

    const safeTxHash = await safeWallet.executeTransaction(safeTransaction);

    console.log("Safe transaction hash:", safeTxHash);
}

main().catch((error) => {
    console.error("Error executing Safe:", error);
});
