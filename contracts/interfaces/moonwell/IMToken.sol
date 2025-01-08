pragma solidity =0.8.27;

interface IMToken {
    function borrow(uint256 borrowAmount) external returns (uint256);

    function repayBorrowBehalf(
        address borrower,
        uint repayAmount
    ) external virtual returns (uint);

    function underlying() external view returns (address);
}
