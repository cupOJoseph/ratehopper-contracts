pragma solidity =0.8.27;

import "../interfaces/IProtocolHandler.sol";
import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import {IPoolV3} from "../interfaces/aaveV3/IPoolV3.sol";
import {IERC20} from "../dependencies/IERC20.sol";
import "hardhat/console.sol";

contract AaveV3Handler is IProtocolHandler {
    using GPv2SafeERC20 for IERC20;

    IPoolV3 public immutable aaveV3Pool;

    constructor(address _AAVE_V3_POOL_ADDRESS) {
        aaveV3Pool = IPoolV3(_AAVE_V3_POOL_ADDRESS);
    }

    function debtSwap(
        address fromAsset,
        address toAsset,
        uint256 amount,
        uint256 amountInMaximum,
        uint256 totalFee,
        address onBehalfOf,
        bytes calldata extraData // Not used for AAVE V3, but kept for compatibility
    ) external override {
        aaveV3Repay(address(fromAsset), amount, onBehalfOf);
        aaveV3Pool.borrow(
            address(toAsset),
            amountInMaximum + totalFee,
            2,
            0,
            onBehalfOf
        );
    }

    function repayRemainingBalance(
        address asset,
        uint256 amount,
        address onBehalfOf,
        bytes calldata extraData
    ) external {
        aaveV3Repay(asset, amount, onBehalfOf);
    }

    function aaveV3Supply(
        address asset,
        uint256 amount,
        address onBehalfOf
    ) internal {
        IERC20(asset).safeTransferFrom(onBehalfOf, address(this), amount);
        IERC20(asset).approve(address(aaveV3Pool), amount);
        aaveV3Pool.supply(asset, amount, onBehalfOf, 0);
    }

    function aaveV3Repay(
        address asset,
        uint256 amount,
        address onBehalfOf
    ) internal returns (uint256) {
        IERC20(asset).approve(address(aaveV3Pool), amount);
        return aaveV3Pool.repay(asset, amount, 2, onBehalfOf);
    }
}
