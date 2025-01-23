import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { AAVE_V3_POOL_ADDRESS, AAVE_V3_DATA_PROVIDER_ADDRESS } from "../../test/constants";
import { MORPHO_ADDRESS } from "../../test/protocols/morpho";

export const AaveV3Module = buildModule("AaveV3Handler", (m) => {
    const aAVE_V3_POOL_ADDRESS = m.getParameter("AAVE_V3_POOL_ADDRESS", AAVE_V3_POOL_ADDRESS);
    const aAVE_V3_DATA_PROVIDER_ADDRESS = m.getParameter(
        "AAVE_V3_DATA_PROVIDER_ADDRESS",
        AAVE_V3_DATA_PROVIDER_ADDRESS,
    );

    const aaveV3Handler = m.contract(
        "AaveV3Handler",
        [aAVE_V3_POOL_ADDRESS, aAVE_V3_DATA_PROVIDER_ADDRESS],
        {},
    );

    return { aaveV3Handler };
});

export const CompoundModule = buildModule("CompoundHandler", (m) => {
    const compoundHandler = m.contract("CompoundHandler", [], {});

    return { compoundHandler };
});

export const MorphoModule = buildModule("MorphoHandler", (m) => {
    const morpho_address = m.getParameter("MORPHO_ADDRESS", MORPHO_ADDRESS);

    const morphoHandler = m.contract("MorphoHandler", [morpho_address], {});

    return { morphoHandler };
});
