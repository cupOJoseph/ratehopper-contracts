// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/safe/ISafe.sol";

import "hardhat/console.sol";

contract SafeModule is Ownable {
    address public safe;

    struct FlashCallbackData {
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

    modifier onlySafe() {
        require(msg.sender == safe, "SafeModule: Caller is not the Safe");
        _;
    }

    constructor(address _safe) {
        safe = _safe;
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
    ) public {
        require(_fromDebtAsset != address(0), "Invalid from asset address");
        require(_toDebtAsset != address(0), "Invalid to asset address");

        IUniswapV3Pool pool = IUniswapV3Pool(_flashloanPool);
        uint256 debtAmount = _amount;

        // if (_amount == type(uint256).max) {
        //     address handler = protocolRegistry.getHandler(_fromProtocol);

        //     debtAmount = IProtocolHandler(handler).getDebtAmount(
        //         _fromDebtAsset,
        //         msg.sender,
        //         _fromExtraData
        //     );
        //     console.log("on-chain debtAmount:", debtAmount);
        // }

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

    // implement endpoint and flashlaon callback

    function executeTransaction(
        address _safeAddr,
        address _target,
        bytes calldata data
    ) external onlySafe returns (bool success) {
        console.log("executing");
        bool success = ISafe(_safeAddr).execTransactionFromModule(
            _target,
            0,
            data,
            ISafe.Operation.Call
        );
        // (success, ) = target.call(data);
        // require(success, "SafeModule: Transaction failed");

        // emit TransactionExecuted(target, data);
    }
}
