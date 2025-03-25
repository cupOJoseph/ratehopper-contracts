# RateHopper Contracts

RateHopper Contracts is a smart contract system that enables users to automatically switch their borrowing positions between different DeFi lending protocols (such as Aave and Compound) to take advantage of the best borrowing rates. This helps users optimize their borrowing costs by seamlessly moving their debt between protocols when better rates are available.

## Key Features

- **Multi-Protocol Support**: Currently supports borrowing from:
  - Aave V3
  - Compound
  - Morpho
  - Fluid (in development)

- **Flash Loan Integration**: Uses flash loans to facilitate debt position transfers without requiring users to have the full repayment amount upfront.

- **Collateral Management**: Handles collateral assets across different protocols during debt transfers.

- **Slippage Protection**: Includes configurable slippage parameters to protect users during token swaps.

- **UniswapV3 Integration**: Uses Uniswap V3 for efficient token swaps when needed.

## Architecture

The system consists of several key components:

1. **DebtSwap.sol**: The main contract that orchestrates the debt switching process.
2. **Protocol Handlers**: Individual handlers for each supported lending protocol:
   - `AaveV3Handler.sol`
   - `CompoundHandler.sol`
   - `MorphoHandler.sol`
   - `FluidHandler.sol`
3. **ProtocolRegistry.sol**: Manages the registry of supported protocols and their handlers.

## Key Functions

### DebtSwap Contract

- `executeDebtSwap`: Main entry point for initiating a debt position transfer
- `setRegistry`: Admin function to set the protocol registry address

### Protocol Handlers

Each protocol handler implements the `IProtocolHandler` interface with these key functions:
- `getDebtAmount`: Retrieves current debt amount for a user
- `switchIn`: Handles borrowing on the new protocol
- `switchFrom`: Handles debt repayment on the old protocol

## Setup

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

## Development

The project uses:
- Solidity version 0.8.27
- Hardhat for development and testing
- OpenZeppelin contracts for standard implementations
- Uniswap V3 for token swaps

## Testing

Comprehensive tests are available in the `/test` directory covering:
- Individual protocol handlers
- Complete debt switching flows
- Edge cases and error conditions

Run tests with:
```bash
npm run test
```

For detailed traces:
```bash
npm run trace
```

## Security

The contracts include several security features:
- Slippage protection
- Access control via Ownable
- Safe ERC20 operations
- Flash loan validations

## License

MIT
