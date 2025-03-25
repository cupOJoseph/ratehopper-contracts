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

## Sample Usage

Below are examples of how to integrate with the RateHopper contracts for different protocols.

### Common Integration Pattern

```javascript
// 1. Initialize protocol helpers
const aaveV3Helper = new AaveV3Helper(signer);
const compoundHelper = new CompoundHelper(signer);
const morphoHelper = new MorphoHelper(signer);
const moonwellHelper = new MoonwellHelper(signer);

// 2. Set up a borrowing position in the source protocol
// Example: Supply collateral and borrow from Aave V3
await aaveV3Helper.supply(collateralTokenAddress);
await aaveV3Helper.borrow(debtTokenAddress);

// 3. Execute the debt swap
await debtSwapContract.executeDebtSwap(
  flashloanPool,            // Uniswap V3 pool address for flash loan
  fromProtocol,             // Source protocol enum
  toProtocol,               // Destination protocol enum
  fromDebtAsset,            // Debt asset address on source protocol
  toDebtAsset,              // Debt asset address on destination protocol
  amount,                   // Amount to swap (MaxUint256 for full debt)
  slippageAdjustedAmount,   // Source amount with slippage adjustment
  collateralAssets,         // Array of collateral assets
  fromExtraData,            // Protocol-specific data for source
  toExtraData,              // Protocol-specific data for destination
  paraswapParams            // Parameters for token swaps if needed
);
```

### Protocol-Specific Integration Notes

#### Aave V3

```javascript
// When switching from Aave V3 to another protocol
// 1. Get and approve aToken for the collateral
const aTokenAddress = await aaveV3Helper.getATokenAddress(collateralTokenAddress);
await approve(aTokenAddress, debtSwapContractAddress, signer);

// 2. Approve delegation for variable debt tokens when Aave is the destination
await aaveV3Helper.approveDelegation(debtTokenAddress, debtSwapContractAddress);

// 3. No extra data needed for Aave V3
// Set this as fromExtraData when Aave is the source protocol
// Set this as toExtraData when Aave is the destination protocol
const aaveExtraData = "0x";
```

#### Compound V3

```javascript
// When using Compound V3
// 1. Allow the DebtSwap contract to manage positions
await compoundHelper.allow(tokenAddress, debtSwapContractAddress);

// 2. Encode the Comet address as extra data (REQUIRED)
const cometAddress = cometAddressMap.get(tokenAddress);

// Set this as fromExtraData when Compound is the source protocol
// Set this as toExtraData when Compound is the destination protocol
const compoundExtraData = compoundHelper.encodeExtraData(cometAddress);
// This encodes: ethers.AbiCoder.defaultAbiCoder().encode(["address"], [cometAddress])
```

#### Morpho

```javascript
// When using Morpho
// 1. Set authorization for the DebtSwap contract
const morphoContract = new ethers.Contract(MORPHO_ADDRESS, morphoAbi, signer);
await morphoContract.setAuthorization(debtSwapContractAddress, true);

// 2. Get borrow shares for the market
const borrowShares = await morphoHelper.getBorrowShares(marketId);

// 3. Encode market parameters and borrow shares as extra data (REQUIRED)
// Set this as fromExtraData when Morpho is the source protocol
// Set this as toExtraData when Morpho is the destination protocol
const morphoExtraData = morphoHelper.encodeExtraData(marketId, borrowShares);
// This encodes the market parameters (loan token, collateral token, oracle, etc.) and borrow shares
```

#### Moonwell

```javascript
// When using Moonwell
// 1. For supplying collateral
await moonwellHelper.supply(mTokenAddress);

// 2. Enable collateral for borrowing
await moonwellHelper.enableCollateral(mTokenAddress);

// 3. For borrowing
await moonwellHelper.borrow(mTokenAddress);

// 4. No extra data needed for Moonwell
// Set this as fromExtraData when Moonwell is the source protocol
// Set this as toExtraData when Moonwell is the destination protocol
const moonwellExtraData = "0x";
```

#### Fluid

```javascript
// When using Fluid (through Safe)
// 1. Get the vault address for the token
const vaultAddress = fluidVaultMap.get(tokenAddress);

// 2. Supply collateral to the vault
await fluidHelper.supply(vaultAddress);

// 3. Get NFT ID for the position
const nftId = await fluidHelper.getNftId(vaultAddress, userAddress);

// 4. Borrow from the vault
await fluidHelper.borrow(vaultAddress, tokenAddress, userAddress);
```

### Multiple Collaterals Example

```javascript
// When using multiple collateral assets
const collateralArray = [
  { asset: collateralToken1Address, amount: collateralAmount1 },
  { asset: collateralToken2Address, amount: collateralAmount2 }
];

// Pass the collateral array to executeDebtSwap
await debtSwapContract.executeDebtSwap(
  // ... other parameters
  collateralArray,
  // ... remaining parameters
);
```

### Cross-Protocol Debt Swap Example

```javascript
// Example: Switch debt from Aave V3 to Compound
// 1. Set up position in Aave
await aaveV3Helper.supply(collateralTokenAddress);
await aaveV3Helper.borrow(debtTokenAddress);

// 2. Prepare for the swap
// Approve aToken transfer
const aTokenAddress = await aaveV3Helper.getATokenAddress(collateralTokenAddress);
await approve(aTokenAddress, debtSwapContractAddress, signer);

// Allow Compound management
await compoundHelper.allow(toDebtTokenAddress, debtSwapContractAddress);

// Prepare extra data
const fromExtraData = "0x"; // No extra data for Aave
const toCometAddress = cometAddressMap.get(toDebtTokenAddress);
const toExtraData = compoundHelper.encodeExtraData(toCometAddress);

// 3. Execute the swap
await debtSwapContract.executeDebtSwap(
  flashloanPool,
  Protocols.AAVE_V3,
  Protocols.COMPOUND,
  fromDebtTokenAddress,
  toDebtTokenAddress,
  MaxUint256, // Swap full debt
  slippageAdjustedAmount,
  [{ asset: collateralTokenAddress, amount: collateralAmount }],
  fromExtraData,
  toExtraData,
  paraswapParams
);
```

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
