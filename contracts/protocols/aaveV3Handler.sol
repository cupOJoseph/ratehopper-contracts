// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IProtocolHandler.sol";
import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import {IPoolV3} from "../interfaces/aaveV3/IPoolV3.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import {DataTypes} from "../interfaces/aaveV3/DataTypes.sol";
import {IAaveProtocolDataProvider} from "../interfaces/aaveV3/IAaveProtocolDataProvider.sol";
import "../dependencies/TransferHelper.sol";
import {PoolAddress} from "../dependencies/uniswapV3/PoolAddress.sol";
import "../dependencies/uniswapV3/CallbackValidation.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract AaveV3Handler is IProtocolHandler {
    using GPv2SafeERC20 for IERC20;

    IPoolV3 public immutable aaveV3Pool;
    IAaveProtocolDataProvider public immutable dataProvider;
    address public immutable uniswapV3Factory;
    
    modifier onlyUniswapV3Pool() {
        // verify msg.sender is Uniswap V3 pool
        IUniswapV3Pool pool = IUniswapV3Pool(msg.sender);
        PoolAddress.PoolKey memory poolKey = PoolAddress.getPoolKey(pool.token0(), pool.token1(), pool.fee());
        // require statement is defined in verifyCallback()
        CallbackValidation.verifyCallback(uniswapV3Factory, poolKey);
        _;
    }

    constructor(address _AAVE_V3_POOL_ADDRESS, address _AAVE_V3_DATA_PROVIDER_ADDRESS, address _UNISWAP_V3_FACTORY_ADDRESS) {
        aaveV3Pool = IPoolV3(_AAVE_V3_POOL_ADDRESS);
        dataProvider = IAaveProtocolDataProvider(_AAVE_V3_DATA_PROVIDER_ADDRESS);
        uniswapV3Factory = _UNISWAP_V3_FACTORY_ADDRESS;
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
    ) external override onlyUniswapV3Pool {
        repay(address(fromAsset), amount, onBehalfOf, fromExtraData);
        aaveV3Pool.borrow(address(toAsset), amountTotal, 2, 0, onBehalfOf);
    }

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override onlyUniswapV3Pool {
        repay(address(fromAsset), amount, onBehalfOf, extraData);

        for (uint256 i = 0; i < collateralAssets.length; i++) {
            require(collateralAssets[i].amount > 0, "Invalid collateral amount");

            DataTypes.ReserveData memory reserveData = aaveV3Pool.getReserveData(collateralAssets[i].asset);

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
    ) external override onlyUniswapV3Pool {
        for (uint256 i = 0; i < collateralAssets.length; i++) {
            uint256 currentBalance = IERC20(collateralAssets[i].asset).balanceOf(address(this));

            TransferHelper.safeApprove(collateralAssets[i].asset, address(aaveV3Pool), currentBalance);
            aaveV3Pool.supply(collateralAssets[i].asset, currentBalance, onBehalfOf, 0);
        }
        aaveV3Pool.borrow(toAsset, amount, 2, 0, onBehalfOf);
    }

    function supply(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external override onlyUniswapV3Pool {
        TransferHelper.safeApprove(asset, address(aaveV3Pool), amount);
        aaveV3Pool.supply(asset, amount, onBehalfOf, 0);
    }

    function borrow(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external override onlyUniswapV3Pool {
        aaveV3Pool.borrow(asset, amount, 2, 0, onBehalfOf);
    }

    function repay(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) public onlyUniswapV3Pool {
        TransferHelper.safeApprove(asset, address(aaveV3Pool), amount);
        aaveV3Pool.repay(asset, amount, 2, onBehalfOf);
    }
}
