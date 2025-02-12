// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

import "../interfaces/safe/ISafe.sol";
import "../interfaces/moonwell/IMToken.sol";
import "../Types.sol";
import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import {IPoolV3} from "../interfaces/aaveV3/IPoolV3.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import {DataTypes} from "../interfaces/aaveV3/DataTypes.sol";
import {IAaveProtocolDataProvider} from "../interfaces/aaveV3/IAaveProtocolDataProvider.sol";
import "../interfaces/IProtocolHandler.sol";

import "hardhat/console.sol";

contract AaveV3SafeHandler is IProtocolHandler {
    using GPv2SafeERC20 for IERC20;

    IPoolV3 public immutable aaveV3Pool;
    address public immutable aaveV3PoolAddress;
    IAaveProtocolDataProvider public immutable dataProvider;

    constructor(address _AAVE_V3_POOL_ADDRESS, address _AAVE_V3_DATA_PROVIDER_ADDRESS) {
        aaveV3PoolAddress = _AAVE_V3_POOL_ADDRESS;
        aaveV3Pool = IPoolV3(_AAVE_V3_POOL_ADDRESS);
        dataProvider = IAaveProtocolDataProvider(_AAVE_V3_DATA_PROVIDER_ADDRESS);
    }

    function getDebtAmount(
        address asset,
        address onBehalfOf,
        bytes calldata fromExtraData
    ) external view returns (uint256) {
        (, , uint256 currentVariableDebt, , , , , , ) = dataProvider.getUserReserveData(asset, onBehalfOf);
        return currentVariableDebt;
    }

    function switchIn(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountInMax,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata fromExtraData,
        bytes calldata toExtraData
    ) external override {}

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override {
        repay(address(fromAsset), amount, onBehalfOf, extraData);

        for (uint256 i = 0; i < collateralAssets.length; i++) {
            DataTypes.ReserveData memory reserveData = aaveV3Pool.getReserveData(collateralAssets[i].asset);

            bool successWithdraw = ISafe(onBehalfOf).execTransactionFromModule(
                aaveV3PoolAddress,
                0,
                abi.encodeCall(IPoolV3.withdraw, (collateralAssets[i].asset, collateralAssets[i].amount, onBehalfOf)),
                ISafe.Operation.Call
            );
        }
    }

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        CollateralAsset[] memory collateralAssets,
        bytes calldata extraData
    ) external override {
        for (uint256 i = 0; i < collateralAssets.length; i++) {
            bool successApprove = ISafe(onBehalfOf).execTransactionFromModule(
                collateralAssets[i].asset,
                0,
                abi.encodeCall(IERC20.approve, (address(aaveV3Pool), collateralAssets[i].amount)),
                ISafe.Operation.Call
            );

            bool successSupply = ISafe(onBehalfOf).execTransactionFromModule(
                aaveV3PoolAddress,
                0,
                abi.encodeCall(IPoolV3.supply, (collateralAssets[i].asset, collateralAssets[i].amount, onBehalfOf, 0)),
                ISafe.Operation.Call
            );
        }

        bool successBorrow = ISafe(onBehalfOf).execTransactionFromModule(
            aaveV3PoolAddress,
            0,
            abi.encodeCall(IPoolV3.borrow, (toAsset, amount, 2, 0, onBehalfOf)),
            ISafe.Operation.Call
        );

        bool successTransfer = ISafe(onBehalfOf).execTransactionFromModule(
            toAsset,
            0,
            abi.encodeCall(IERC20.transfer, (address(this), amount)),
            ISafe.Operation.Call
        );
    }

    function repay(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) public override {
        IERC20(asset).approve(address(aaveV3Pool), amount);
        aaveV3Pool.repay(asset, amount, 2, onBehalfOf);
    }

    function supply(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external {
        IERC20(asset).approve(address(this), type(uint256).max);
    }

    function borrow(address asset, uint256 amount, address onBehalfOf, bytes calldata extraData) external {
        IERC20(asset).approve(address(this), type(uint256).max);
    }
}
