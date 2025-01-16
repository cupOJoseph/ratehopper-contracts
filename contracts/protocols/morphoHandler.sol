// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

import "../interfaces/IProtocolHandler.sol";
import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import "hardhat/console.sol";
import {DataTypes} from "../interfaces/aaveV3/DataTypes.sol";
import "../interfaces/morpho/IMorpho.sol";

contract MorphoHandler is IProtocolHandler {
    using GPv2SafeERC20 for IERC20;
    IMorphoBase public morpho;

    constructor(address _MORPHO_ADDRESS) {
        morpho = IMorpho(_MORPHO_ADDRESS);
    }

    function switchIn(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountInMaximum,
        uint256 totalFee,
        address onBehalfOf,
        bytes calldata extraData
    ) external override {}

    function supply(
        MarketParams calldata marketParams,
        address fromAsset,
        uint256 amount,
        address onBehalfOf
    ) public {
        IERC20(fromAsset).safeTransferFrom(onBehalfOf, address(this), amount);
        IERC20(fromAsset).approve(address(morpho), amount);
        morpho.supplyCollateral(marketParams, amount, onBehalfOf, "");
        morpho.borrow(marketParams, 10000, 0, onBehalfOf, onBehalfOf);

        IERC20(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913).safeTransferFrom(
            onBehalfOf,
            address(this),
            10000
        );
        IERC20(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913).approve(
            address(morpho),
            10000
        );
        morpho.repay(marketParams, 10000, 0, onBehalfOf, "");

        morpho.withdrawCollateral(
            marketParams,
            amount / 2,
            onBehalfOf,
            onBehalfOf
        );
    }

    function switchFrom(
        address fromAsset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external override {}

    function switchTo(
        address toAsset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external override {}

    function repay(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) public {}
}
