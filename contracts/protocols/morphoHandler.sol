// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import {DataTypes} from "../interfaces/aaveV3/DataTypes.sol";
import "../interfaces/morpho/IMorpho.sol";
import {MarketParamsLib} from "../dependencies/morpho/MarketParamsLib.sol";
import "../dependencies/TransferHelper.sol";
import {SharesMathLib} from "../dependencies/morpho/SharesMathLib.sol";
import "./BaseProtocolHandler.sol";
import "../ProtocolRegistry.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MorphoHandler is BaseProtocolHandler, ReentrancyGuard {
    using MarketParamsLib for MarketParams;
    using GPv2SafeERC20 for IERC20;
    using SharesMathLib for uint256;
    
    IMorpho public immutable morpho;
    ProtocolRegistry public immutable registry;

    constructor(address _MORPHO_ADDRESS, address _UNISWAP_V3_FACTORY, address _REGISTRY_ADDRESS) BaseProtocolHandler(_UNISWAP_V3_FACTORY) {
        morpho = IMorpho(_MORPHO_ADDRESS);
        registry = ProtocolRegistry(_REGISTRY_ADDRESS);
    }

    function getDebtAmount(
        address asset,
        address onBehalfOf,
        bytes calldata fromExtraData
    ) public view returns (uint256) {
        (MarketParams memory marketParams, uint256 borrowShares) = abi.decode(fromExtraData, (MarketParams, uint256));
        Id marketId = marketParams.id();
        Market memory m = morpho.market(marketId);
        return borrowShares.toAssetsUp(m.totalBorrowAssets, m.totalBorrowShares) + 1;
    }

    function switchIn(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountTotal,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata fromExtraData,
        bytes calldata toExtraData
    ) external override onlyUniswapV3Pool nonReentrant {
        switchFrom(fromAsset, amount, onBehalfOf, collateralAssets, fromExtraData);
        switchTo(toAsset, amountTotal, onBehalfOf, collateralAssets, toExtraData);
    }

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) public override onlyUniswapV3Pool {
        require(registry.isWhitelisted(fromAsset), "From asset is not whitelisted");
        require(registry.isWhitelisted(collateralAssets[0].asset), "Collateral asset is not whitelisted");
        
        // Morpho only supports one collateral asset
        require(collateralAssets.length == 1, "Morpho supports only one collateral asset");
        require(collateralAssets[0].amount > 0, "Invalid collateral amount");
  
        (MarketParams memory marketParams, uint256 borrowShares) = abi.decode(extraData, (MarketParams, uint256));
        require(marketParams.loanToken == fromAsset, "fromAsset mismatch with marketParams in extraData");

        TransferHelper.safeApprove(fromAsset, address(morpho), amount);
        morpho.repay(marketParams, 0, borrowShares, onBehalfOf, "");
        morpho.withdrawCollateral(marketParams, collateralAssets[0].amount, onBehalfOf, address(this));
        TransferHelper.safeApprove(fromAsset, address(morpho), 0);
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) public override onlyUniswapV3Pool {
        require(registry.isWhitelisted(toAsset), "To asset is not whitelisted");
        require(registry.isWhitelisted(collateralAssets[0].asset), "Collateral asset is not whitelisted");
        
        // Morpho only supports one collateral asset
        require(collateralAssets.length == 1, "Morpho supports only one collateral asset");
        require(collateralAssets[0].amount > 0, "Invalid collateral amount");
        
        (MarketParams memory marketParams, ) = abi.decode(extraData, (MarketParams, uint256));
        require(marketParams.loanToken == toAsset, "toAsset mismatch with marketParams in extraData");

        uint256 currentBalance = IERC20(collateralAssets[0].asset).balanceOf(address(this));
        require(currentBalance > 0, "No collateral balance available");
        require(
                currentBalance < (collateralAssets[0].amount * 101) / 100,
                "Current balance is more than collateral amount + buffer"
            );

        TransferHelper.safeApprove(marketParams.collateralToken, address(morpho), currentBalance);
        morpho.supplyCollateral(marketParams, currentBalance, onBehalfOf, "");

        morpho.borrow(marketParams, amount, 0, onBehalfOf, address(this));
        TransferHelper.safeApprove(marketParams.collateralToken, address(morpho), 0);
    }

    function supply(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external override onlyUniswapV3Pool nonReentrant {
        require(registry.isWhitelisted(asset), "Asset is not whitelisted");
        
        (MarketParams memory marketParams, ) = abi.decode(extraData, (MarketParams, uint256));

        TransferHelper.safeApprove(asset, address(morpho), amount);
        morpho.supplyCollateral(marketParams, amount, onBehalfOf, "");
        TransferHelper.safeApprove(asset, address(morpho), 0);
    }

    function borrow(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external override onlyUniswapV3Pool nonReentrant {
        require(registry.isWhitelisted(asset), "Asset is not whitelisted");
        
        (MarketParams memory marketParams, ) = abi.decode(extraData, (MarketParams, uint256));

        morpho.borrow(marketParams, amount, 0, onBehalfOf, address(this));
    }

    function repay(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) public onlyUniswapV3Pool nonReentrant {
        require(registry.isWhitelisted(asset), "Asset is not whitelisted");
        
        (MarketParams memory marketParams, ) = abi.decode(extraData, (MarketParams, uint256));

        TransferHelper.safeApprove(asset, address(morpho), amount);
        morpho.repay(marketParams, amount, 0, onBehalfOf, "");
        TransferHelper.safeApprove(asset, address(morpho), 0);
    }
}
