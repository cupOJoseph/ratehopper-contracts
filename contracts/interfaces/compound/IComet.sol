pragma solidity =0.8.27;

interface IComet {
    function supply(address asset, uint amount) external virtual;
    function supplyFrom(
        address from,
        address dst,
        address asset,
        uint amount
    ) external virtual;
    function withdrawFrom(
        address src,
        address to,
        address asset,
        uint amount
    ) external;
    function withdraw(address asset, uint amount) external;
}
