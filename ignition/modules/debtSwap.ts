// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DebtSwapModule = buildModule("DebtSwap", (m) => {
    const aaveV3PoolAddress = m.getParameter(
        "aaveV3PoolAddress",
        "0x794a61358d6845594f94dc1db02a252b5b4814ad",
    );

    const UNISWAP_V3_SWAP_ROUTER_ADDRESS = m.getParameter(
        "UNISWAP_V3_SWAP_ROUTER_ADDRESS",
        "0x2626664c2603336E57B271c5C0b26F421741e481",
    );

    const DebtSwap = m.contract(
        "DebtSwap",
        [aaveV3PoolAddress, UNISWAP_V3_SWAP_ROUTER_ADDRESS],
        {},
    );

    return { DebtSwap };
});

export default DebtSwapModule;
