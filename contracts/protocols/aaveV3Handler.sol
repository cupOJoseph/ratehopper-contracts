// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import {IPoolV3} from "../interfaces/aaveV3/IPoolV3.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import {DataTypes} from "../interfaces/aaveV3/DataTypes.sol";
import {IAaveProtocolDataProvider} from "../interfaces/aaveV3/IAaveProtocolDataProvider.sol";
import "../dependencies/TransferHelper.sol";
import "./BaseProtocolHandler.sol";
import "../ProtocolRegistry.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AaveV3Handler is BaseProtocolHandler, ReentrancyGuard {
    using GPv2SafeERC20 for IERC20;

    IPoolV3 public immutable aaveV3Pool;
    IAaveProtocolDataProvider public immutable dataProvider;
    ProtocolRegistry public immutable registry;
    
    constructor(address _AAVE_V3_POOL_ADDRESS, address _AAVE_V3_DATA_PROVIDER_ADDRESS, address _UNISWAP_V3_FACTORY_ADDRESS, address _REGISTRY_ADDRESS) 
        BaseProtocolHandler(_UNISWAP_V3_FACTORY_ADDRESS) 
    {
        aaveV3Pool = IPoolV3(_AAVE_V3_POOL_ADDRESS);
        dataProvider = IAaveProtocolDataProvider(_AAVE_V3_DATA_PROVIDER_ADDRESS);
        registry = ProtocolRegistry(_REGISTRY_ADDRESS);
    }

    function getDebtAmount(
        address asset,
        address onBehalfOf,
        bytes calldata fromExtraData
    ) public view returns (uint256) {
        (, , uint256 currentVariableDebt, , , , , , ) = dataProvider.getUserReserveData(asset, onBehalfOf);
        return currentVariableDebt;
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
        TransferHelper.safeApprove(fromAsset, address(aaveV3Pool), amount);
        aaveV3Pool.repay(fromAsset, amount, 2, onBehalfOf);

        aaveV3Pool.borrow(address(toAsset), amountTotal, 2, 0, onBehalfOf);
        TransferHelper.safeApprove(fromAsset, address(aaveV3Pool), 0);
    }

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override onlyUniswapV3Pool nonReentrant {
        _validateCollateralAssets(collateralAssets);
        require(registry.isWhitelisted(fromAsset), "From asset is not whitelisted");

        TransferHelper.safeApprove(fromAsset, address(aaveV3Pool), amount);
        aaveV3Pool.repay(fromAsset, amount, 2, onBehalfOf);
        TransferHelper.safeApprove(fromAsset, address(aaveV3Pool), 0);

        for (uint256 i = 0; i < collateralAssets.length; i++) {
            require(registry.isWhitelisted(collateralAssets[i].asset), "Collateral asset is not whitelisted");

            DataTypes.ReserveData memory reserveData = aaveV3Pool.getReserveData(collateralAssets[i].asset);
            require(reserveData.aTokenAddress != address(0), "Asset not supported by Aave");
      
            IERC20(reserveData.aTokenAddress).safeTransferFrom(onBehalfOf, address(this), collateralAssets[i].amount);
            aaveV3Pool.withdraw(collateralAssets[i].asset, collateralAssets[i].amount, address(this));
        }
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override onlyUniswapV3Pool nonReentrant {
        _validateCollateralAssets(collateralAssets);
        
        require(registry.isWhitelisted(toAsset), "To asset is not whitelisted");
        
        for (uint256 i = 0; i < collateralAssets.length; i++) {
            require(registry.isWhitelisted(collateralAssets[i].asset), "Collateral asset is not whitelisted");

            // Validate asset is supported by Aave
            DataTypes.ReserveData memory reserveData = aaveV3Pool.getReserveData(collateralAssets[i].asset);
            require(reserveData.aTokenAddress != address(0), "Asset not supported by Aave");
            
            uint256 currentBalance = IERC20(collateralAssets[i].asset).balanceOf(address(this));
            require(currentBalance > 0, "No collateral balance available");
            require(
                currentBalance < (collateralAssets[i].amount * 101) / 100,
                "Current balance is more than collateral amount + buffer"
            );
        

            TransferHelper.safeApprove(collateralAssets[i].asset, address(aaveV3Pool), currentBalance);
            aaveV3Pool.supply(collateralAssets[i].asset, currentBalance, onBehalfOf, 0);
            IERC20(collateralAssets[i].asset).approve(address(aaveV3Pool), 0);
        }
        
        aaveV3Pool.borrow(toAsset, amount, 2, 0, onBehalfOf);
    }

    function supply(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external override onlyUniswapV3Pool nonReentrant {
        TransferHelper.safeApprove(asset, address(aaveV3Pool), amount);
        aaveV3Pool.supply(asset, amount, onBehalfOf, 0);
    }

    function borrow(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external override onlyUniswapV3Pool nonReentrant {
        aaveV3Pool.borrow(asset, amount, 2, 0, onBehalfOf);
    }

    function repay(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) public onlyUniswapV3Pool nonReentrant {
        TransferHelper.safeApprove(asset, address(aaveV3Pool), amount);
        aaveV3Pool.repay(asset, amount, 2, onBehalfOf);
        TransferHelper.safeApprove(asset, address(aaveV3Pool), 0);
    }
}
