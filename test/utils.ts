export function getAmountOutMin(bigIntValue: bigint): bigint {
    // Suppose 1% slippage is allowed. must be fetched from quote to get actual slippage
    const slippage = 0.99;
    const scaleFactor = 100n;
    const multiplier = BigInt(slippage * Number(scaleFactor));
    return (bigIntValue * multiplier) / scaleFactor;
}
