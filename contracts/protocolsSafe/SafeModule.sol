// SPDX-License-Identifier: MIT
pragma solidity =0.8.27;

import {IERC20} from "../dependencies/IERC20.sol";
import {GPv2SafeERC20} from "../dependencies/GPv2SafeERC20.sol";
import {IFlashLoanSimpleReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";
import {IPoolV3} from "../interfaces/aaveV3/IPoolV3.sol";

import {IDebtToken} from "../interfaces/aaveV3/IDebtToken.sol";
import {IAaveProtocolDataProvider} from "../interfaces/aaveV3/IAaveProtocolDataProvider.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IMToken} from "../interfaces/moonwell/IMToken.sol";
import {ISwapRouter02} from "../interfaces/uniswapV3/ISwapRouter02.sol";
import {IV3SwapRouter} from "../interfaces/uniswapV3/IV3SwapRouter.sol";
import {PoolAddress} from "../dependencies/uniswapV3/PoolAddress.sol";
import {ProtocolRegistry} from "../ProtocolRegistry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../Types.sol";
import "../interfaces/safe/ISafe.sol";
import {IProtocolHandler} from "../interfaces/IProtocolHandler.sol";

import "hardhat/console.sol";

contract SafeModule {
    ISwapRouter02 public immutable swapRouter;
    ProtocolRegistry public protocolRegistry;
    address public immutable moonwellHandler;

    mapping(address => address) public ownerToSafe;

    struct FlashCallbackData {
        address safe;
        address flashloanPool;
        Protocol fromProtocol;
        Protocol toProtocol;
        address fromAsset;
        address toAsset;
        uint256 amount;
        uint256 allowedSlippage;
        CollateralAsset[] collateralAssets;
        address onBehalfOf;
        bytes fromExtraData;
        bytes toExtraData;
    }

    event TransactionExecuted(address indexed target, bytes data);

    modifier onlySafeOwner() {
        require(ownerToSafe[msg.sender] != address(0), "SafeModule: Caller is not the Safe owner");
        _;
    }

    constructor(address _uniswap_v3_swap_router, address _protocol_registry) {
        swapRouter = ISwapRouter02(_uniswap_v3_swap_router);
        protocolRegistry = ProtocolRegistry(_protocol_registry);
    }

    // suppose this function is called from Safe wallet
    function setSafe() public {
        ISafe safe = ISafe(msg.sender);
        address[] memory owners = safe.getOwners();
        ownerToSafe[owners[0]] = msg.sender;
    }

    function executeDebtSwap(
        address _flashloanPool,
        Protocol _fromProtocol,
        Protocol _toProtocol,
        address _fromDebtAsset,
        address _toDebtAsset,
        uint256 _amount,
        uint16 _allowedSlippage,
        CollateralAsset[] calldata _collateralAssets,
        bytes calldata _fromExtraData,
        bytes calldata _toExtraData
    ) public onlySafeOwner {
        require(_fromDebtAsset != address(0), "Invalid from asset address");
        require(_toDebtAsset != address(0), "Invalid to asset address");

        IUniswapV3Pool pool = IUniswapV3Pool(_flashloanPool);
        uint256 debtAmount = _amount;

        if (_amount == type(uint256).max) {
            address handler = protocolRegistry.getHandler(_fromProtocol);

            debtAmount = IProtocolHandler(handler).getDebtAmount(
                _fromDebtAsset,
                ownerToSafe[msg.sender],
                _fromExtraData
            );
            console.log("on-chain debtAmount:", debtAmount);
        }

        address token0;
        try pool.token0() returns (address result) {
            token0 = result;
        } catch {
            revert("Invalid flashloan pool address");
        }

        uint256 amount0 = _fromDebtAsset == token0 ? debtAmount : 0;
        uint256 amount1 = _fromDebtAsset == token0 ? 0 : debtAmount;

        bytes memory data = abi.encode(
            FlashCallbackData({
                safe: ownerToSafe[msg.sender],
                flashloanPool: _flashloanPool,
                fromProtocol: _fromProtocol,
                toProtocol: _toProtocol,
                fromAsset: _fromDebtAsset,
                toAsset: _toDebtAsset,
                amount: debtAmount,
                allowedSlippage: _allowedSlippage,
                onBehalfOf: msg.sender,
                collateralAssets: _collateralAssets,
                fromExtraData: _fromExtraData,
                toExtraData: _toExtraData
            })
        );

        pool.flash(address(this), amount0, amount1, data);
    }

    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
        FlashCallbackData memory decoded = abi.decode(data, (FlashCallbackData));

        // implement the same logic as CallbackValidation.verifyCallback()
        require(msg.sender == address(decoded.flashloanPool), "Caller is not flashloan pool");

        // suppose either of fee0 or fee1 is 0
        uint totalFee = fee0 + fee1;

        uint8 fromDecimals = IERC20(decoded.fromAsset).decimals();
        uint8 toDecimals = IERC20(decoded.toAsset).decimals();
        uint8 decimalDiff = fromDecimals > toDecimals ? fromDecimals - toDecimals : toDecimals - fromDecimals;

        uint256 amountInMax = (decoded.amount * (10 ** 4 + decoded.allowedSlippage)) / 10 ** 4;

        if (decimalDiff > 0) {
            amountInMax = amountInMax * 10 ** decimalDiff;
        }
        console.log("amountInMax:", amountInMax);

        if (decoded.fromProtocol == decoded.toProtocol) {
            address handler = protocolRegistry.getHandler(decoded.fromProtocol);

            handler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.switchIn,
                    (
                        decoded.fromAsset,
                        decoded.toAsset,
                        decoded.amount,
                        amountInMax,
                        totalFee,
                        address(decoded.safe),
                        decoded.collateralAssets,
                        decoded.fromExtraData,
                        decoded.toExtraData
                    )
                )
            );
        } else {
            address fromHandler = protocolRegistry.getHandler(decoded.fromProtocol);
            fromHandler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.switchFrom,
                    (
                        decoded.fromAsset,
                        decoded.amount,
                        address(decoded.safe),
                        decoded.collateralAssets,
                        decoded.fromExtraData
                    )
                )
            );

            address toHandler = protocolRegistry.getHandler(decoded.toProtocol);
            toHandler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.switchTo,
                    (
                        decoded.toAsset,
                        amountInMax + totalFee,
                        address(decoded.safe),
                        decoded.collateralAssets,
                        decoded.toExtraData
                    )
                )
            );
        }

        if (decoded.fromAsset != decoded.toAsset) {
            swapToken(address(decoded.toAsset), address(decoded.fromAsset), decoded.amount + totalFee, amountInMax);
        }

        // repay flashloan
        IERC20(decoded.fromAsset).transfer(address(decoded.flashloanPool), decoded.amount + totalFee);

        // repay remaining amount
        IERC20 toToken = IERC20(decoded.toAsset);
        uint256 remainingBalance = toToken.balanceOf(address(this));
        console.log("remainingBalance:", remainingBalance);

        if (remainingBalance > 0) {
            address handler = protocolRegistry.getHandler(decoded.toProtocol);

            (bool success, bytes memory returnData) = handler.delegatecall(
                abi.encodeCall(
                    IProtocolHandler.repay,
                    (decoded.toAsset, remainingBalance, address(decoded.safe), decoded.toExtraData)
                )
            );

            require(success);
        }

        uint256 remainingBalanceAfter = toToken.balanceOf(address(this));
        console.log("remainingBalanceAfter:", remainingBalanceAfter);
    }

    function swapToken(address inputToken, address outputToken, uint256 amountOut, uint256 amountInMaximum) internal {
        IERC20(inputToken).approve(address(swapRouter), type(uint256).max);

        IV3SwapRouter.ExactOutputSingleParams memory params = IV3SwapRouter.ExactOutputSingleParams({
            tokenIn: inputToken,
            tokenOut: outputToken,
            fee: 100,
            recipient: address(this),
            amountOut: amountOut,
            amountInMaximum: amountInMaximum,
            sqrtPriceLimitX96: 0
        });

        uint256 amountIn = swapRouter.exactOutputSingle(params);

        console.log("swap from ", inputToken, " to ", outputToken);
    }
}
