# Strategies

QuantEdge ships **10 selectable strategies** across four families: three
trend-followers, one time-series momentum model, two breakouts, and four
mean-reverters. A buy-and-hold benchmark is computed alongside every run
as the reference overlay, but it is not one of the four families and is
not selectable as a strategy in its own right. The variety is
deliberate — running them side-by-side teaches the most important
lesson in backtesting: *no strategy works in every regime*. Trend
followers shine in sustained moves and bleed in chop; mean-reverters do
the opposite. The benchmark sets the bar every active strategy has to
beat.

Strategies are registered in `backend/strategies/__init__.py` keyed by
slug. The slug is the canonical id used by the API and the UI. This
document groups strategies by family and alphabetizes within each
family. The UI dropdown follows registry order
(`backend/strategies/__init__.py`); both are intentional.

## Trend Following

### Ichimoku Cloud (`ichimoku-cloud`)

**Type:** Trend following (multi-component cloud overlay).

**Logic:** Ichimoku Kinkō Hyō assembles five components into a single
picture:

```text
Tenkan-sen    = (max(high, 9)  + min(low, 9))  / 2
Kijun-sen     = (max(high, 26) + min(low, 26)) / 2
Senkou Span A = (Tenkan + Kijun) / 2,                 shifted forward 26 bars
Senkou Span B = (max(high, 52) + min(low, 52)) / 2,   shifted forward 26 bars
Cloud         = the band between Senkou A and Senkou B
```

The forward shift means the cloud value at index `t` was computed from
bars at index `t − displacement`, so reading the cloud at `t` never
leaks future information.

```text
position(t) = +1  if close(t) > cloud_top    AND Tenkan > Kijun
            = -1  if close(t) < cloud_bottom AND Tenkan < Kijun   (when allow_short)
            =  0  otherwise
```

**Parameters:**

| Name | Default | Range | Description |
|---|---|---|---|
| `tenkan_period` | 9 | 2–200 | Tenkan-sen lookback (bars). |
| `kijun_period` | 26 | 3–400 | Kijun-sen lookback (bars). |
| `senkou_b_period` | 52 | 5–600 | Senkou Span B lookback (bars). |
| `displacement` | 26 | 1–200 | Forward shift applied to both spans. |
| `allow_short` | `true` | — | Short below the cloud when Tenkan < Kijun. |

**Wins in:** sustained directional regimes where the cloud thickens in
the trend direction.

**Loses in:** range-bound markets — price keeps tagging both sides of a
thin cloud and the strategy whipsaws.

**Citation:** Hosoda, G. (1969). *Ichimoku Kinkō Hyō*. Tokyo.

---

### MACD Crossover (`macd-crossover`)

**Type:** Trend following (momentum-aware).

**Logic:** Subtract two exponential moving averages of the close to get
the MACD line, then smooth it again with a third EMA to obtain the
signal line:

```text
MACD(t)        = EMA(close, fast) − EMA(close, slow)
signal_line(t) = EMA(MACD, signal)

position(t) = +1  if MACD(t) > signal_line(t)
            = -1  if MACD(t) < signal_line(t)   (when allow_short)
            =  0  during warm-up
```

The second smoothing layer dampens whipsaw versus a raw moving-average
crossover at the cost of a small extra lag.

**Parameters:**

| Name | Default | Range | Description |
|---|---|---|---|
| `fast_period` | 12 | 2–200 | Fast EMA span. |
| `slow_period` | 26 | 3–400 | Slow EMA span. Must exceed `fast_period`. |
| `signal_period` | 9 | 2–100 | Signal-line EMA span. |
| `allow_short` | `true` | — | Short when MACD < signal line. |

**Wins in:** trending markets where momentum builds and persists.

**Loses in:** mean-reverting chop where MACD crosses repeatedly with
no follow-through.

**Citation:** Appel, G. (2005). *Technical Analysis: Power Tools for
Active Investors*. FT Press.

---

### SMA Crossover (`sma-crossover`)

**Type:** Trend following.

**Logic:** Compute a fast and a slow simple moving average of the
close. Go long when fast > slow.

```text
position(t) = +1  if SMA_fast(t) > SMA_slow(t)
            = -1  if SMA_fast(t) < SMA_slow(t)   (when allow_short)
            =  0  during warm-up
```

**Parameters:**

| Name | Default | Range | Description |
|---|---|---|---|
| `fast_window` | 20 | 2–200 | Fast SMA lookback (bars). |
| `slow_window` | 50 | 5–500 | Slow SMA lookback (bars). Must exceed `fast_window`. |
| `allow_short` | `false` | — | Short when fast SMA is below slow SMA. |

**Wins in:** sustained directional moves (bull or bear markets).

**Loses in:** chop / sideways markets — gets whipsawed in/out
repeatedly.

**Citation:** Pardo, R. (2008). *The Evaluation and Optimization of
Trading Strategies*, §4.2 "The Moving Average Crossover". Wiley.

---

## Momentum

### Time Series Momentum (`time-series-momentum`)

**Type:** Own-asset return momentum (Moskowitz–Ooi–Pedersen).

**Logic:** At each bar `t`, compute the trailing return over
`lookback_bars` and take a position in its sign:

```text
r(t) = close(t) / close(t − lookback_bars) − 1

position(t) = +1  if r(t) > 0
            = -1  if r(t) < 0   (when allow_short)
            =  0  during warm-up
```

The parameter is named `lookback_bars` (not `_days`) because the engine
runs the same strategy on daily and hourly bars — the unit is always
*bars*, and "one year" only holds when bars are daily (252 trading
days).

**Parameters:**

| Name | Default | Range | Description |
|---|---|---|---|
| `lookback_bars` | 252 | 2–2520 | Bars over which to measure the trailing return. |
| `allow_short` | `true` | — | Short when trailing return is negative. |

**Wins in:** markets that exhibit medium-horizon (1–12 month) trend
persistence — the original Moskowitz et al. finding.

**Loses in:** sharp reversals where the trailing return flips sign and
the strategy enters at the worst possible moment.

**Citation:** Moskowitz, T., Ooi, Y. H., & Pedersen, L. H. (2012).
"Time Series Momentum." *Journal of Financial Economics*, 104(2),
228–250.

---

## Breakout

### Donchian Channel Breakout (`donchian-breakout`)

**Type:** Breakout / momentum (Turtle Trading classic).

**Logic:** Long entry when close breaks above the rolling N-bar high
(default 20). Exit when close breaks below the rolling M-bar low
(default 10). Asymmetric windows = "stay in trends, exit fast". The
rolling extrema use prior-bar values so a bar's close cannot trigger
its own breakout — a strategy-layer look-ahead-bias guard on top of the
engine's t→t+1 fill rule.

**Parameters:**

| Name | Default | Range | Description |
|---|---|---|---|
| `entry_window` | 20 | 2–400 | Bars in the rolling high used for entries. |
| `exit_window` | 10 | 2–400 | Bars in the rolling low used for exits. |
| `allow_short` | `false` | — | Mirror logic on the short side. |

**Wins in:** trending markets with clean breakouts.

**Loses in:** ranges with frequent false breakouts.

**Citation:** Faith, C. (2007). *The Way of the Turtle*. McGraw-Hill.

---

### Keltner Channels (`keltner-channels`)

**Type:** Volatility envelope around an EMA. Two modes: breakout
(default) or mean-reversion.

**Logic:**

```text
middle(t) = EMA(close, ema_period)
ATR(t)    = Wilder-smoothed true range over atr_period
upper(t)  = middle(t) + multiplier · ATR(t)
lower(t)  = middle(t) − multiplier · ATR(t)
```

In **breakout** mode: enter long when close > upper; exit when close
returns to the midline; optionally short on a lower-band break. In
**mean-reversion** mode: invert — buy lower-band touches, sell
upper-band touches, exit on midline reversion.

Because band width scales with recent ATR, the same parameters tend to
work across regimes: quiet markets get tight bands, turbulent markets
get wide ones.

**Parameters:**

| Name | Default | Range | Description |
|---|---|---|---|
| `ema_period` | 20 | 2–200 | EMA span for the midline. |
| `atr_period` | 10 | 2–200 | ATR lookback (Wilder smoothing). |
| `multiplier` | 2.0 | 0.1–10.0 | ATR multiplier for the channel width. |
| `allow_short` | `true` | — | Trade the short side symmetrically. |
| `mode` | `"breakout"` | `breakout \| mean_reversion` | Logic flavor. |

**Wins in:** *breakout* mode — trending markets that punch through the
upper band. *Mean-reversion* mode — range-bound markets that respect
the envelope.

**Loses in:** the wrong regime for the chosen mode; whipsaws when the
bands are too tight for the noise floor.

**Citation:** Keltner, C. W. (1960). *How to Make Money in
Commodities*. Keltner Statistical Service. The ATR-scaled variant was
popularised by Linda Bradford Raschke in *Stocks & Commodities* in the
1990s.

---

## Mean Reversion

### Bollinger Bands Mean Reversion (`bollinger-bands`)

**Type:** Volatility-adjusted mean reversion.

**Logic:** Compute a rolling mean μ and standard deviation σ. Bands at
μ ± k·σ.

```text
if close < lower band  → enter long
if close > upper band  → exit long (or enter short, if enabled)
if exit_at_mean: exit long when close ≥ μ; exit short when close ≤ μ.
```

**Parameters:**

| Name | Default | Range | Description |
|---|---|---|---|
| `window` | 20 | 2–200 | Lookback for μ and σ. |
| `num_std` | 2.0 | 0.5–5.0 | Band width in standard deviations. |
| `exit_at_mean` | `true` | — | If true, exit when price returns to μ; otherwise exit when it tags the opposite band. |
| `allow_short` | `false` | — | Short above the upper band. |

**Wins in:** range-bound markets with stable volatility.

**Loses in:** trending markets where price walks the band for weeks.

**Citation:** Bollinger, J. (2001). *Bollinger on Bollinger Bands*.
McGraw-Hill.

---

### CCI — Commodity Channel Index (`cci`)

**Type:** Mean reversion (scale-invariant via mean absolute deviation).

**Logic:**

```text
TP(t)  = (high(t) + low(t) + close(t)) / 3        # "typical price"
SMA(t) = mean of TP over period
MD(t)  = mean absolute deviation of TP from SMA over period
CCI(t) = (TP(t) − SMA(t)) / (constant · MD(t))

if CCI(t) < buy_threshold   → target long
if CCI(t) > sell_threshold  → target short (if allow_short) else flat
else                        → hold previous target
```

Normalising by mean absolute deviation makes the signal
**scale-invariant** across assets — the same ±100 thresholds work on
AAPL and BTC-USD without retuning.

**Parameters:**

| Name | Default | Range | Description |
|---|---|---|---|
| `period` | 20 | 2–400 | Lookback for SMA and mean absolute deviation. |
| `buy_threshold` | −100.0 | ≤ 0 | CCI level at or below which to target long. |
| `sell_threshold` | 100.0 | ≥ 0 | CCI level at or above which to target short. |
| `constant` | 0.015 | (0, 1] | Lambert's scaling constant in the denominator. |
| `allow_short` | `true` | — | Short on overbought CCI. |

**Wins in:** range-bound markets that swing between Lambert's ±100
thresholds.

**Loses in:** strong trends where CCI stays pinned beyond ±100 for
weeks and the strategy fights the move.

**Citation:** Lambert, D. R. (1980). "Commodity Channel Index: Tool
for Trading Cyclic Trends." *Commodities Magazine*, October 1980.

---

### RSI Mean Reversion (`rsi-mean-reversion`)

**Type:** Counter-trend / mean reversion.

**Logic:** Wilder's RSI. Buy when RSI is oversold (default < 30), exit
when RSI returns to overbought territory (default > 70).

```text
RSI(t) = 100 − 100 / (1 + RS(t))
RS(t)  = avg_gain(t) / avg_loss(t)        (Wilder smoothing, α = 1/window)

if position == 0  and RSI(t) < oversold     → enter long
if position == +1 and RSI(t) > overbought   → exit  (or enter short if enabled)
```

**Parameters:**

| Name | Default | Range | Description |
|---|---|---|---|
| `rsi_window` | 14 | 2–100 | RSI lookback period (bars). |
| `oversold_threshold` | 30.0 | 0–50 | Long-entry RSI threshold. |
| `overbought_threshold` | 70.0 | 50–100 | Long-exit RSI threshold. |
| `allow_short` | `false` | — | Short when RSI > overbought. |

**Wins in:** range-bound markets.

**Loses in:** strong trends — keeps fading the move and racks up
losses.

**Citation:** Wilder, J. W. (1978). *New Concepts in Technical Trading
Systems*. Trend Research.

---

### Stochastic Oscillator (`stochastic-oscillator`)

**Type:** Mean reversion (Lane's %K reversal model).

**Logic:**

```text
raw_K(t) = 100 · (close − min(low, k_period)) / (max(high, k_period) − min(low, k_period))
%K(t)    = SMA(raw_K, smooth_k)

if %K crosses up   through oversold   → target long
if %K crosses down through overbought → target short (if allow_short) else flat
else hold previous target.
```

**Parameters:**

| Name | Default | Range | Description |
|---|---|---|---|
| `k_period` | 14 | 2–200 | %K lookback (highest-high / lowest-low window). |
| `d_period` | 3 | 1–50 | %D smoothing window (kept for completeness; not used by the signal). |
| `smooth_k` | 3 | 1–50 | SMA smoothing applied to raw %K. |
| `oversold` | 20.0 | 0–50 | Lower trigger band. |
| `overbought` | 80.0 | 50–100 | Upper trigger band. |
| `allow_short` | `true` | — | Short when %K crosses down through overbought. |

**Wins in:** range-bound markets that respect Lane's bands.

**Loses in:** trending markets where %K saturates near 100 (uptrend) or
0 (downtrend), so the cross-back trigger always arrives too late.

**Citation:** Lane, G. C. (1984). "Lane's Stochastics." *Technical
Analysis of Stocks & Commodities*, 2(3).

---

## Benchmark

### Buy & Hold (`buy-and-hold`)

**Type:** Reference benchmark.

**Logic:** Be long every bar:

```text
position(t) = +1 for all t
```

The engine handles the rest — it places a buy at bar 0 that fills at
bar 1's open, sizes via the same risk manager, and pays the same
commission and slippage as every other strategy.

**Parameters:** none.

**Wins in:** any sustained bull market over the run window.

**Loses in:** drawdowns. By construction, this strategy never exits.

**Why it lives in the strategy registry:**
`backend/analytics/benchmarks.py` uses it internally to build the
same-asset and SPY benchmark equity curves drawn alongside every
backtest. Registering it as an ordinary strategy means those overlays
pay the same realistic frictions a user would face if they actually
held the asset, with zero duplicated engine code. It is **not** offered
in the strategy picker, though — the `/strategies` endpoint hides it
(`backend/api/routes/strategies.py`), so it serves purely as the
benchmark.

**Citation:** none — it's a definitional benchmark, not a technique.

---

## Shared invariants

* Every strategy returns `pd.Series[int]` aligned to `bars.index`,
  values in `{-1, 0, 1}`.
* Strategies never call into the engine, the portfolio, commissions, or
  the risk manager.
* The backtest engine enforces the t→t+1 fill rule — strategies must
  **not** shift their own signals.
* During the warm-up period (where indicators are NaN), the signal is
  `0` (flat).
* Frequency-agnostic: the same strategy class runs on daily and hourly
  bars without modification. Annualization happens in
  `backend/analytics/periods.py`, not in the strategy.

## Adding a new strategy

See [`CLAUDE.md`](../CLAUDE.md#how-to-add-a-new-strategy).

---

_Last verified against code: 2026-05-24._
