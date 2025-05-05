// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import "./dependencies/uniswapV3/CallbackValidation.sol";
import {PoolAddress} from "./dependencies/uniswapV3/PoolAddress.sol";
import {IERC20} from "./dependencies/IERC20.sol";
import {GPv2SafeERC20} from "./dependencies/GPv2SafeERC20.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IProtocolHandler} from "./interfaces/IProtocolHandler.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Types.sol";

import "hardhat/console.sol";

contract LeveragedPosition is Ownable, ReentrancyGuard {
    using GPv2SafeERC20 for IERC20;
    uint8 public protocolFee;
    address public feeBeneficiary;
    address public uniswapV3Factory;
    mapping(Protocol => address) public protocolHandlers;

    struct FlashCallbackData {
        address flashloanPool;
        Protocol protocol;
        address collateralAsset;
        address debtAsset;
        uint256 principleCollateralAmount;
        uint256 targetCollateralAmount;
        uint256 srcAmount;
        address onBehalfOf;
        bytes extraData;
        ParaswapParams paraswapParams;
    }

    event LeveragedPositionCreated(
        address indexed onBehalfOf,
        Protocol protocol,
        address collateralAsset,
        uint256 principleCollateralAmount,
        uint256 targetCollateralAmount,
        address debtAsset
    );

    constructor(address _uniswapV3Factory, Protocol[] memory protocols, address[] memory handlers) Ownable(msg.sender) {
        require(protocols.length == handlers.length, "Protocols and handlers length mismatch");
        uniswapV3Factory = _uniswapV3Factory;

        for (uint256 i = 0; i < protocols.length; i++) {
            require(handlers[i] != address(0), "Invalid handler address");
            protocolHandlers[protocols[i]] = handlers[i];
        }
    }

    function setProtocolFee(uint8 _fee) public onlyOwner {
        require(_fee <= 100, "_fee cannot be greater than 1%");
        protocolFee = _fee;
    }

    function setFeeBeneficiary(address _feeBeneficiary) public onlyOwner {
        require(_feeBeneficiary != address(0), "_feeBeneficiary cannot be zero address");
        feeBeneficiary = _feeBeneficiary;
    }

    function createLeveragedPosition(
        address _flashloanPool,
        Protocol _protocol,
        address _collateralAsset,
        uint256 _principleCollateralAmount,
        uint256 _targetCollateralAmount,
        address _debtAsset,
        uint256 _srcAmount,
        bytes calldata _extraData,
        ParaswapParams calldata _paraswapParams
    ) public nonReentrant {
        require(_collateralAsset != address(0), "Invalid collateral asset address");
        require(_debtAsset != address(0), "Invalid debt asset address");

        IERC20(_collateralAsset).transferFrom(msg.sender, address(this), _principleCollateralAmount);

        IUniswapV3Pool pool = IUniswapV3Pool(_flashloanPool);

        uint256 flashloanBorrowAmount = _targetCollateralAmount - _principleCollateralAmount;

        address token0;
        try pool.token0() returns (address result) {
            token0 = result;
        } catch {
            revert("Invalid flashloan pool address");
        }

        uint256 amount0 = _collateralAsset == token0 ? flashloanBorrowAmount : 0;
        uint256 amount1 = _collateralAsset == token0 ? 0 : flashloanBorrowAmount;

        bytes memory data = abi.encode(
            FlashCallbackData({
                flashloanPool: _flashloanPool,
                protocol: _protocol,
                collateralAsset: _collateralAsset,
                debtAsset: _debtAsset,
                principleCollateralAmount: _principleCollateralAmount,
                targetCollateralAmount: _targetCollateralAmount,
                srcAmount: _srcAmount,
                onBehalfOf: msg.sender,
                extraData: _extraData,
                paraswapParams: _paraswapParams
            })
        );

        pool.flash(address(this), amount0, amount1, data);
    }

    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
        FlashCallbackData memory decoded = abi.decode(data, (FlashCallbackData));

        // verify callback
        IUniswapV3Pool pool = IUniswapV3Pool(msg.sender);
        PoolAddress.PoolKey memory poolKey = PoolAddress.getPoolKey(pool.token0(), pool.token1(), pool.fee());
        CallbackValidation.verifyCallback(uniswapV3Factory, poolKey);

        uint256 flashloanBorrowAmount = decoded.targetCollateralAmount - decoded.principleCollateralAmount;

        // suppose either of fee0 or fee1 is 0
        uint totalFee = fee0 + fee1;

        uint256 amountInMax = decoded.srcAmount + 1;

        address handler = protocolHandlers[decoded.protocol];

        (bool successSupply, ) = handler.delegatecall(
            abi.encodeCall(
                IProtocolHandler.supply,
                (decoded.collateralAsset, decoded.targetCollateralAmount, decoded.onBehalfOf, decoded.extraData)
            )
        );
        require(successSupply, "Supply failed");

        (bool successBorrow, ) = handler.delegatecall(
            abi.encodeCall(
                IProtocolHandler.borrow,
                (decoded.debtAsset, amountInMax, decoded.onBehalfOf, decoded.extraData)
            )
        );
        require(successBorrow, "Borrow failed");

        swapByParaswap(
            decoded.debtAsset,
            decoded.paraswapParams.tokenTransferProxy,
            decoded.paraswapParams.router,
            decoded.paraswapParams.swapData
        );

        // repay flashloan
        IERC20 collateralToken = IERC20(decoded.collateralAsset);
        collateralToken.safeTransfer(msg.sender, flashloanBorrowAmount + totalFee);

        // transfer dust amount back to user
        uint256 remainingCollateralBalance = IERC20(decoded.collateralAsset).balanceOf(address(this));
        collateralToken.safeTransfer(decoded.onBehalfOf, remainingCollateralBalance);

        // repay remaining debt amount
        uint256 remainingBalance = IERC20(decoded.debtAsset).balanceOf(address(this));
        (bool successRepay, ) = handler.delegatecall(
            abi.encodeCall(
                IProtocolHandler.repay,
                (decoded.debtAsset, remainingBalance, decoded.onBehalfOf, decoded.extraData)
            )
        );

        require(successRepay, "Repay remaining amount failed");

        emit LeveragedPositionCreated(
            decoded.onBehalfOf,
            decoded.protocol,
            decoded.collateralAsset,
            decoded.principleCollateralAmount,
            decoded.targetCollateralAmount,
            decoded.debtAsset
        );
    }

    function swapByParaswap(address asset, address tokenTransferProxy, address router, bytes memory _txParams) public {
        IERC20(asset).approve(tokenTransferProxy, type(uint256).max);
        (bool success, bytes memory returnData) = router.call(_txParams);
        require(success, "Token swap failed");
    }
}
