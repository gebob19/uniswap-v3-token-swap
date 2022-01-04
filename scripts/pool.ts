import { ethers, Contract } from "ethers";
import { Pool } from "@uniswap/v3-sdk";
import { CurrencyAmount, Token, TradeType } from "@uniswap/sdk-core";
import { abi as IUniswapV3PoolABI } from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
import { Route } from "@uniswap/v3-sdk";
import { Trade } from "@uniswap/v3-sdk";
import { abi as QuoterABI } from "@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json";

interface Immutables {
    factory: string;
    token0: string;
    token1: string;
    fee: number;
    tickSpacing: number;
    maxLiquidityPerTick: ethers.BigNumber;
}

interface State {
    liquidity: ethers.BigNumber;
    sqrtPriceX96: ethers.BigNumber;
    tick: number;
    observationIndex: number;
    observationCardinality: number;
    observationCardinalityNext: number;
    feeProtocol: number;
    unlocked: boolean;
}

async function getPoolImmutables(poolContract: Contract) {
    // fetch data concurrently for consistency across the data
    const [factory, token0, token1, fee, tickSpacing, maxLiquidityPerTick] =
      await Promise.all([
        poolContract.factory(),
        poolContract.token0(),
        poolContract.token1(),
        poolContract.fee(),
        poolContract.tickSpacing(),
        poolContract.maxLiquidityPerTick(),
      ]);
  
    const immutables: Immutables = {
      factory,
      token0,
      token1,
      fee,
      tickSpacing,
      maxLiquidityPerTick,
    };
    return immutables;
}

async function getPoolState(poolContract: Contract) {
    const [liquidity, slot] = await Promise.all([
      poolContract.liquidity(),
      poolContract.slot0(),
    ]);
  
    const PoolState: State = {
      liquidity,
      sqrtPriceX96: slot[0],
      tick: slot[1],
      observationIndex: slot[2],
      observationCardinality: slot[3],
      observationCardinalityNext: slot[4],
      feeProtocol: slot[5],
      unlocked: slot[6],
    };
  
    return PoolState;
}

async function main() {
    const url = 'https://eth-mainnet.alchemyapi.io/v2/Fsvs0KjJkxUePIpKEuLzdbZ6sMR6L9qH'
    const provider = new ethers.providers.JsonRpcProvider(url)

    const poolAddress = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
    const poolContract = new ethers.Contract(
        poolAddress,
        IUniswapV3PoolABI,
        provider
    );

    const [immutables, state] = await Promise.all([
        getPoolImmutables(poolContract),
        getPoolState(poolContract),
    ]);

    // chainId, address, decimals, symbol, name 
    const TokenA = new Token(3, immutables.token0, 6, "USDC", "USD Coin");
    const TokenB = new Token(3, immutables.token1, 18, "WETH", "Wrapped Ether");
  
    const poolExample = new Pool(
        TokenA,
        TokenB,
        immutables.fee,
        state.sqrtPriceX96.toString(),
        state.liquidity.toString(),
        state.tick
    );
    console.log(poolExample);

    // quote the cost of a trade
    const quoterAddress = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
    const quoterContract = new ethers.Contract(quoterAddress, QuoterABI, provider);

    const amountIn = 1500;
    const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
        immutables.token0,
        immutables.token1,
        immutables.fee,
        amountIn.toString(),
        0
    );

    // create a trade object
    // only allow trade to be routed through poolExample
    const swapRoute = new Route([poolExample], TokenA, TokenB);
    const uncheckedTradeExample = await Trade.createUncheckedTrade({
        route: swapRoute,
        inputAmount: CurrencyAmount.fromRawAmount(TokenA, amountIn.toString()),
        outputAmount: CurrencyAmount.fromRawAmount(
          TokenB,
          quotedAmountOut.toString()
        ),
        tradeType: TradeType.EXACT_INPUT,
      });

    console.log("The quoted amount out is", quotedAmountOut.toString());
    console.log("The unchecked trade object is", uncheckedTradeExample);

}

main()