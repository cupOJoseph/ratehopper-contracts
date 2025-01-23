// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { UNISWAP_V3_FACTORY_ADRESS, UNISWAP_V3_SWAP_ROUTER_ADDRESS } from "../../test/constants";

const DebtSwapModule = buildModule("DebtSwap", (m) => {
    const uniswap_v3_factory_address = m.getParameter(
        "UNISWAP_V3_FACTORY_ADDRESS",
        UNISWAP_V3_FACTORY_ADRESS,
    );

    const uniswap_v3_swap_router_address = m.getParameter(
        "UNISWAP_V3_SWAP_ROUTER_ADDRESS",
        UNISWAP_V3_SWAP_ROUTER_ADDRESS,
    );

    const debtSwap = m.contract(
        "DebtSwap",
        [uniswap_v3_factory_address, uniswap_v3_swap_router_address],
        {},
    );

    return { debtSwap };
});

export default DebtSwapModule;
