// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DebtSwapModule = buildModule("DebtSwap", (m) => {
    const debtSwap = m.contract("DebtSwap", [], {});

    return { debtSwap };
});

export default DebtSwapModule;
