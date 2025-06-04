// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IProtocolHandler.sol";
import {PoolAddress} from "../dependencies/uniswapV3/PoolAddress.sol";
import "../dependencies/uniswapV3/CallbackValidation.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

/**
 * @title BaseProtocolHandler
 * @dev Base abstract contract for protocol handlers with Uniswap V3 pool validation
 * @notice This contract provides common functionality and security modifiers for all protocol handlers
 */
abstract contract BaseProtocolHandler is IProtocolHandler {
    
    /// @notice The Uniswap V3 factory address used for pool validation
    address public immutable uniswapV3Factory;
    
    /**
     * @dev Modifier to ensure only legitimate Uniswap V3 pools can call protected functions
     * @notice Validates that msg.sender is a pool deployed by the official Uniswap V3 factory
     */
    modifier onlyUniswapV3Pool() {
        // verify msg.sender is Uniswap V3 pool
        IUniswapV3Pool pool = IUniswapV3Pool(msg.sender);
        PoolAddress.PoolKey memory poolKey = PoolAddress.getPoolKey(pool.token0(), pool.token1(), pool.fee());
        // require statement is defined in verifyCallback()
        CallbackValidation.verifyCallback(uniswapV3Factory, poolKey);
        _;
    }
    
    /**
     * @dev Constructor for base protocol handler
     * @param _uniswapV3Factory The address of the Uniswap V3 factory
     */
    constructor(address _uniswapV3Factory) {
        require(_uniswapV3Factory != address(0), "Invalid Uniswap V3 factory address");
        uniswapV3Factory = _uniswapV3Factory;
    }
    
    /**
     * @dev Internal function to validate collateral assets array
     * @param collateralAssets Array of collateral assets to validate
     */
    function _validateCollateralAssets(CollateralAsset[] memory collateralAssets) internal pure {
        require(collateralAssets.length > 0, "No collateral assets provided");
        require(collateralAssets.length <= 20, "Too many collateral assets");
        
        for (uint256 i = 0; i < collateralAssets.length; i++) {
            require(collateralAssets[i].asset != address(0), "Invalid collateral asset address");
            require(collateralAssets[i].amount > 0, "Invalid collateral amount");
        }
    }
} 