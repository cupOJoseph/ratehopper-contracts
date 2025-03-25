# RateHopper Contracts

RateHopper Contracts is a smart contract system that enables users to automatically switch their borrowing positions between different DeFi lending protocols to take advantage of the best borrowing rates. This helps users optimize their borrowing costs by seamlessly moving their debt between protocols when better rates are available.

## Deployed Contract

**Base Network**: [0x0f4ba1e061823830d42350e410513727e7125171](https://basescan.org/address/0x0f4ba1e061823830d42350e410513727e7125171)

## Key Features

- **Multi-Protocol Support**: Currently supports borrowing from:
  - Aave V3
  - Compound
  - Morpho
  - Moonwell
  - Fluid

- **Flash Loan Integration**: Uses Uniswap V3 flash loans to facilitate debt position transfers without requiring users to have the full repayment amount upfront.

- **Collateral Management**: Handles multiple collateral assets across different protocols during debt transfers.

- **Paraswap Integration**: Uses Paraswap for efficient token swaps when debt assets differ between protocols.

- **Protocol Fee**: Configurable protocol fee system with a designated fee beneficiary.

- **Safe Module Integration**: Supports Gnosis Safe integration through dedicated Safe modules.

- **Leveraged Positions**: Enables creation of leveraged positions across supported protocols.

## Architecture

The system consists of several key components:

1. **DebtSwap.sol**: The main contract that orchestrates the debt switching process using flash loans.

2. **Protocol Handlers**: Individual handlers for each supported lending protocol:
   - `AaveV3Handler.sol`: Handles interactions with Aave V3 protocol
   - `CompoundHandler.sol`: Handles interactions with Compound protocol
   - `MorphoHandler.sol`: Handles interactions with Morpho protocol
   - `MoonwellHandler.sol`: Handles interactions with Moonwell protocol
   - `FluidSafeHandler.sol`: Handles interactions with Fluid protocol through Safe

3. **Safe Modules**: Modules for Gnosis Safe integration:
   - `SafeModuleDebtSwap.sol`: Enables debt swaps through Gnosis Safe
   - `SafeModuleDebtSwapUpgradeable.sol`: Upgradeable version of the Safe module

4. **LeveragedPosition.sol**: Facilitates creation of leveraged positions across protocols.

## Key Functions

### DebtSwap Contract

- `executeDebtSwap`: Main entry point for initiating a debt position transfer
- `uniswapV3FlashCallback`: Handles the flash loan callback from Uniswap V3
- `setProtocolFee`: Sets the protocol fee percentage (basis points)
- `setFeeBeneficiary`: Sets the address that receives protocol fees
- `getHandler`: Retrieves the handler address for a specific protocol
- `emergencyWithdraw`: Allows the owner to withdraw tokens in case of emergency

### Protocol Handlers

Each protocol handler implements the following key functions:
- `getDebtAmount`: Retrieves current debt amount for a user
- `switchIn`: Handles debt switching within the same protocol
- `switchFrom`: Handles debt repayment on the original protocol
- `switchTo`: Handles borrowing on the new protocol
- `repay`: Handles repayment of remaining balances

## Integration Guide

### Debt Swap Parameters

To execute a debt swap, you'll need to provide the following parameters:

```solidity
function executeDebtSwap(
    address _flashloanPool,       // Uniswap V3 pool address for flash loan
    Protocol _fromProtocol,       // Source protocol enum (COMPOUND, AAVE_V3, MORPHO, FLUID, MOONWELL)
    Protocol _toProtocol,         // Destination protocol enum
    address _fromDebtAsset,       // Debt asset address on source protocol
    address _toDebtAsset,         // Debt asset address on destination protocol
    uint256 _amount,              // Amount to swap (use type(uint256).max for full debt)
    uint256 _srcAmount,           // Source amount for swap (0 for automatic calculation)
    CollateralAsset[] calldata _collateralAssets,  // Array of collateral assets
    bytes calldata _fromExtraData,  // Extra data for source protocol
    bytes calldata _toExtraData,    // Extra data for destination protocol
    ParaswapParams calldata _paraswapParams  // Paraswap parameters for token swaps
)
```

### Collateral Asset Structure

```solidity
struct CollateralAsset {
    address asset;   // Collateral asset address
    uint256 amount;  // Collateral amount
}
```

### Paraswap Parameters

```solidity
struct ParaswapParams {
    address router;             // Paraswap router address
    address tokenTransferProxy; // Paraswap token transfer proxy
    bytes swapData;             // Encoded swap data
}
```

## Setup and Development

1. Install dependencies:
```bash
npm install
```

2. Compile contracts:
```bash
npm run compile
```

3. Run tests:
```bash
npm run test
```

The project uses:
- Solidity version 0.8.28
- Hardhat for development and testing
- OpenZeppelin contracts for standard implementations
- Uniswap V3 for flash loans
- Paraswap for token swaps

## Testing

Comprehensive tests are available in the `/test` directory covering:
- Individual protocol handlers
- Cross-protocol debt switching flows
- Multiple collateral asset scenarios
- Safe module integration
- Leveraged position creation

Run tests with:
```bash
npm run test
```

## Security Features

The contracts include several security features:
- Non-reentrant function protection
- Access control via Ownable pattern
- Safe ERC20 operations using GPv2SafeERC20
- Flash loan validation
- Emergency withdrawal functionality
- Protocol fee limits (max 1%)

## License

MIT
