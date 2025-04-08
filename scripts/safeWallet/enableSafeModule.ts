import Safe from "@safe-global/protocol-kit";
import dotenv from "dotenv";
dotenv.config();

async function main() {
    const safeWallet = await Safe.init({
        provider: "https://base.llamarpc.com",
        signer: process.env.MY_SAFE_OWNER_KEY!,
        safeAddress: "0x169EeC0c73a76a520e4cFd8Bb982c5237C3f4977",
        // safeAddress: "0x2f9054Eb6209bb5B94399115117044E4f150B2De",
    });

    const enableModuleTx = await safeWallet.createEnableModuleTx("0xe551D6Cd14B3b193818513267f41119A04092575");
    const safeTxHash = await safeWallet.executeTransaction(enableModuleTx);
    console.log("Safe enable module transaction");

    console.log("Modules:", await safeWallet.getModules());
}

main().catch((error) => {
    console.error("Error executing Safe:", error);
});
