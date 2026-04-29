# Strategies

Each strategy implements one well-known retail technique. The variety
is deliberate: two trend-followers, two mean-reverters. They tend to
shine in opposite market regimes — running them side-by-side teaches
beginners that *no strategy works in every regime*.

## 1. SMA Crossover (`sma-crossover`)

**Type:** Trend following.

**Logic:** Compute a fast and a slow simple moving average of the close.
Go long when fast > slow.

```text
position(t) = 1  if SMA_fast(t) > SMA_slow(t)
            = 0  otherwise   (or -1 if shorting enabled)
```

**Parameters:** `fast_window` (default 20), `slow_window` (default 50),
`allow_short` (default false).

**Wins in:** sustained directional moves (bull or bear markets).

**Loses in:** chop / sideways markets — gets whipsawed in/out repeatedly.

**Citation:** Pardo (2008), §4.2.

## 2. RSI Mean Reversion (`rsi-mean-reversion`)

**Type:** Counter-trend / mean reversion.

**Logic:** Wilder's RSI. Buy when RSI is oversold (< 30), exit when RSI
returns to overbought (> 70).

```text
RSI(t) = 100 − 100 / (1 + RS(t))
RS(t)  = avg_gain(t) / avg_loss(t)        (Wilder smoothing, alpha = 1/window)

if position == 0  and RSI(t) < oversold      → enter long
if position == 1  and RSI(t) > overbought    → exit
```

**Parameters:** `rsi_window` (default 14), `oversold_threshold` (30),
`overbought_threshold` (70).

**Wins in:** range-bound markets.

**Loses in:** strong trends — keeps fading the move and racks up losses.

**Citation:** Wilder (1978).

## 3. Bollinger Bands Mean Reversion (`bollinger-bands`)

**Type:** Volatility-adjusted mean reversion.

**Logic:** Compute rolling mean μ and standard deviation σ. Bands at
μ ± k·σ. Buy when close drops below lower band, exit when close returns
toward μ (or, optionally, when it tags the upper band).

**Parameters:** `window` (20), `num_std` (2.0), `exit_at_mean` (true).

**Wins in:** range-bound markets with stable volatility.

**Loses in:** trending markets where price walks the band for weeks.

**Citation:** Bollinger (2001).

## 4. Donchian Channel Breakout (`donchian-breakout`)

**Type:** Momentum / breakout.

**Logic:** Long entry when close breaks above the rolling N-bar high
(default 20). Exit when close breaks below the rolling M-bar low (default
10). Asymmetric windows = "stay in trends, exit fast".

**Parameters:** `entry_window` (20), `exit_window` (10), `allow_short` (false).

**Wins in:** trending markets with clean breakouts.

**Loses in:** ranges with frequent false breakouts.

**Citation:** Faith (2007), *The Way of the Turtle*.

## Shared invariants

* Every strategy returns `pd.Series[int]` aligned to `bars.index`, values
  in `{-1, 0, 1}`.
* Strategies never call into the engine, the portfolio, or commissions.
* The backtest engine enforces the t→t+1 fill rule — strategies must NOT
  shift their own signals.

## Adding a new strategy

See [`CLAUDE.md`](../CLAUDE.md#how-to-add-a-new-strategy).
