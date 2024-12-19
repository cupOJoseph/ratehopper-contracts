// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ApLoanSwitchModule = buildModule("ApLoanSwitch", (m) => {
  const aaveV3PoolAddress = m.getParameter(
    "aaveV3PoolAddress",
    "0x794a61358d6845594f94dc1db02a252b5b4814ad"
  );

  const aaveV3DebtToken = m.getParameter(
    "aaveV3DebtToken",
    // USDT debt token
    "0xfb00ac187a8eb5afae4eace434f493eb62672df7"
  );

  const comet = m.getParameter(
    "compoundV3",
    "0x2e44e174f7D53F0212823acC11C01A11d58c5bCB"
  );

  const ApLoanSwitch = m.contract(
    "ApLoanSwitch",
    [aaveV3PoolAddress, aaveV3DebtToken, comet],
    {}
  );

  return { ApLoanSwitch };
});

export default ApLoanSwitchModule;
