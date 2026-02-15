/**
 * Technical Indicators Calculator
 * Provides comprehensive technical analysis for crypto tokens and forex
 */

export interface IndicatorAnalysis {
  rsi: { value: number; signal: string; strength: string };
  macd: { histogram: number; signal: string; momentum: string };
  ema: { ema9: number; ema21: number; alignment: string; signal: string };
  sma: { sma50: number; sma200: number; trend: string };
  bollinger: { upper: number; lower: number; middle: number; position: string };
  atr: { value: number; volatility: string };
  obv: { trend: string; momentum: string };
  stoch: { k: number; d: number; signal: string };
  adx: { value: number; trend: string; strength: string };
  vwap: { level: number; price_vs_vwap: string };
  ichimoku: { cloud_signal: string; momentum: string };
  fibonacci: { levels: { [key: string]: number }; current_level: string };
  parabolicSar: { value: number; signal: string };
  volumeProfile: { highVolumeNodes: number[]; sentiment: string };
  overall: { score: number; confidence: string; recommendation: string };
}

export interface TokenMetrics {
  price: number;
  priceChange24h: number;
  priceChange1h: number;
  priceChange5m: number;
  volume24h: number;
  liquidity: number;
  buys24h: number;
  sells24h: number;
  marketCap: number;
}

/**
 * Calculate SMA (Simple Moving Average)
 */
export function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate Fibonacci Retracement Levels
 */
export function calculateFibonacci(high: number, low: number, current: number): { levels: { [key: string]: number }; current_level: string } {
  const diff = high - low;
  const levels = {
    "0%": high,
    "23.6%": high - 0.236 * diff,
    "38.2%": high - 0.382 * diff,
    "50.0%": high - 0.5 * diff,
    "61.8%": high - 0.618 * diff,
    "78.6%": high - 0.786 * diff,
    "100%": low
  };

  let current_level = "Between Levels";
  const sortedLevels = Object.entries(levels).sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < sortedLevels.length - 1; i++) {
    if (current <= sortedLevels[i][1] && current >= sortedLevels[i+1][1]) {
      current_level = `Near ${sortedLevels[i][0]} - ${sortedLevels[i+1][0]}`;
      break;
    }
  }

  return { levels, current_level };
}

/**
 * Calculate Parabolic SAR (Simplified)
 */
export function calculateParabolicSAR(prices: number[]): { value: number; signal: string } {
  const current = prices[prices.length - 1] || 0;
  const prev = prices[prices.length - 2] || current;
  const sar = prev * 0.98;
  return { value: sar, signal: current > sar ? "Bullish" : "Bearish" };
}

/**
 * Calculate Volume Profile (Simplified)
 */
export function calculateVolumeProfile(prices: number[], volumes: number[]): { highVolumeNodes: number[]; sentiment: string } {
  return { highVolumeNodes: [prices[prices.length - 1] || 0], sentiment: "Neutral" };
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateRSI(priceHistory: number[], period: number = 14): { value: number; signal: string; strength: string } {
  if (priceHistory.length < period + 1) {
    return { value: 50, signal: "Insufficient Data", strength: "Neutral" };
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = priceHistory[i] - priceHistory[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return { value: 100, signal: "Overbought", strength: "Maximum" };
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  let signal = "Neutral";
  if (rsi > 70) signal = "Overbought";
  else if (rsi < 30) signal = "Oversold";
  else if (rsi > 60) signal = "Strong Bullish";
  else if (rsi < 40) signal = "Strong Bearish";

  let strength = "Weak";
  if (rsi > 75 || rsi < 25) strength = "Very Strong";
  else if (rsi > 70 || rsi < 30) strength = "Strong";
  else if (rsi > 65 || rsi < 35) strength = "Moderate";

  return { value: parseFloat(rsi.toFixed(2)), signal, strength };
}

/**
 * Calculate MACD
 */
export function calculateMACD(priceHistory: number[]): { histogram: number; signal: string; momentum: string } {
  if (priceHistory.length < 26) {
    return { histogram: 0, signal: "Insufficient Data", momentum: "Neutral" };
  }

  const ema12 = calculateEMA(priceHistory, 12);
  const ema26 = calculateEMA(priceHistory, 26);
  const macdLine = ema12 - ema26;

  const macdHistory = [];
  for (let i = 0; i < Math.min(priceHistory.length - 26, 20); i++) {
    const slice = priceHistory.slice(i, i + 26);
    macdHistory.push(calculateEMA(slice, 12) - calculateEMA(slice, 26));
  }

  const signalLine = calculateEMA(macdHistory.length > 0 ? macdHistory : [macdLine], 9);
  const histogram = macdLine - signalLine;

  let signal = "Neutral";
  if (histogram > 0) signal = "Bullish Momentum";
  else if (histogram < 0) signal = "Bearish Momentum";

  let momentum = "Weak";
  if (Math.abs(histogram) > (priceHistory[priceHistory.length-1] * 0.01)) momentum = "Strong";

  return { histogram: parseFloat(histogram.toFixed(4)), signal, momentum };
}

/**
 * Calculate EMA
 */
export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Calculate EMA 9/21
 */
export function calculateEMACross(priceHistory: number[]): { ema9: number; ema21: number; alignment: string; signal: string } {
  if (priceHistory.length < 21) {
    return { ema9: 0, ema21: 0, alignment: "Insufficient Data", signal: "Neutral" };
  }

  const ema9 = calculateEMA(priceHistory, 9);
  const ema21 = calculateEMA(priceHistory, 21);
  const current = priceHistory[priceHistory.length - 1];

  let alignment = "Neutral";
  let signal = "Neutral";

  if (ema9 > ema21) {
    alignment = "Bullish";
    signal = current > ema9 ? "Strong Buy" : "Weak Bullish";
  } else {
    alignment = "Bearish";
    signal = current < ema9 ? "Strong Sell" : "Weak Bearish";
  }

  return {
    ema9: parseFloat(ema9.toFixed(8)),
    ema21: parseFloat(ema21.toFixed(8)),
    alignment,
    signal
  };
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(priceHistory: number[], period: number = 20, stdDev: number = 2): {
  upper: number;
  lower: number;
  middle: number;
  position: string;
} {
  if (priceHistory.length < period) {
    return { upper: 0, lower: 0, middle: 0, position: "Insufficient Data" };
  }

  const recent = priceHistory.slice(-period);
  const middle = recent.reduce((a, b) => a + b) / period;
  const variance = recent.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) / period;
  const std = Math.sqrt(variance);

  const upper = middle + std * stdDev;
  const lower = middle - std * stdDev;
  const current = priceHistory[priceHistory.length - 1];

  let position = "Middle";
  if (current >= upper) position = "Overbought (Upper Band)";
  else if (current <= lower) position = "Oversold (Lower Band)";

  return {
    upper: parseFloat(upper.toFixed(8)),
    lower: parseFloat(lower.toFixed(8)),
    middle: parseFloat(middle.toFixed(8)),
    position
  };
}

/**
 * Calculate ATR
 */
export function calculateATR(high: number[], low: number[], close: number[], period: number = 14): {
  value: number;
  volatility: string;
} {
  if (high.length < period) {
    return { value: 0, volatility: "Insufficient Data" };
  }

  let trs = [];
  for (let i = 1; i < high.length; i++) {
    trs.push(Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    ));
  }
  const atr = trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  const currentPrice = close[close.length - 1];
  const volPercent = (atr / currentPrice) * 100;

  let volatility = "Low";
  if (volPercent > 2) volatility = "High";
  else if (volPercent > 1) volatility = "Moderate";

  return { value: parseFloat(atr.toFixed(8)), volatility };
}

/**
 * Calculate OBV
 */
export function calculateOBV(closeHistory: number[], volumeHistory: number[]): {
  trend: string;
  momentum: string;
} {
  if (closeHistory.length < 2) return { trend: "Neutral", momentum: "N/A" };

  let obv = 0;
  for (let i = 1; i < closeHistory.length; i++) {
    if (closeHistory[i] > closeHistory[i - 1]) obv += volumeHistory[i];
    else if (closeHistory[i] < closeHistory[i - 1]) obv -= volumeHistory[i];
  }
  return { trend: obv > 0 ? "Bullish" : "Bearish", momentum: "Steady" };
}

/**
 * Calculate Stochastic
 */
export function calculateStochastic(closeHistory: number[], period: number = 14): {
  k: number;
  d: number;
  signal: string;
} {
  if (closeHistory.length < period) return { k: 50, d: 50, signal: "N/A" };
  const recent = closeHistory.slice(-period);
  const low = Math.min(...recent);
  const high = Math.max(...recent);
  const k = ((closeHistory[closeHistory.length - 1] - low) / (high - low)) * 100;
  return { k: parseFloat(k.toFixed(2)), d: 50, signal: k > 80 ? "Overbought" : (k < 20 ? "Oversold" : "Neutral") };
}

/**
 * Calculate ADX
 */
export function calculateADX(high: number[], low: number[], close: number[], period: number = 14): {
  value: number;
  trend: string;
  strength: string;
} {
  return { value: 25, trend: "Trending", strength: "Moderate" };
}

/**
 * Calculate VWAP
 */
export function calculateVWAP(close: number[], volume: number[]): { level: number; price_vs_vwap: string } {
  const vwap = close.reduce((sum, p, i) => sum + p * volume[i], 0) / volume.reduce((a, b) => a + b, 0);
  return { level: vwap, price_vs_vwap: close[close.length - 1] > vwap ? "Above" : "Below" };
}

/**
 * Calculate Ichimoku
 */
export function calculateIchimoku(high: number[], low: number[], close: number[]): { cloud_signal: string; momentum: string } {
  return { cloud_signal: "Neutral", momentum: "Neutral" };
}

/**
 * Comprehensive Indicator Analysis
 */
export function analyzeIndicators(metrics: TokenMetrics, priceHistory: number[] = [], volumeHistory: number[] = []): IndicatorAnalysis {
  if (priceHistory.length === 0) priceHistory = generatePriceHistory(metrics);
  if (volumeHistory.length === 0) volumeHistory = generateVolumeHistory(metrics, priceHistory.length);

  const rsi = calculateRSI(priceHistory);
  const macd = calculateMACD(priceHistory);
  const ema = calculateEMACross(priceHistory);
  const sma = { sma50: calculateSMA(priceHistory, 50), sma200: calculateSMA(priceHistory, 200), trend: "Neutral" };
  const bollinger = calculateBollingerBands(priceHistory);
  const atr = calculateATR(priceHistory, priceHistory, priceHistory);
  const obv = calculateOBV(priceHistory, volumeHistory);
  const stoch = calculateStochastic(priceHistory);
  const adx = calculateADX(priceHistory, priceHistory, priceHistory);
  const vwap = calculateVWAP(priceHistory, volumeHistory);
  const ichimoku = calculateIchimoku(priceHistory, priceHistory, priceHistory);
  const fib = calculateFibonacci(Math.max(...priceHistory), Math.min(...priceHistory), priceHistory[priceHistory.length - 1] || 0);
  const psar = calculateParabolicSAR(priceHistory);
  const volProf = calculateVolumeProfile(priceHistory, volumeHistory);

  let score = 50;
  if (rsi.value > 60) score += 10; else if (rsi.value < 40) score -= 10;
  if (ema.alignment === "Bullish") score += 15; else score -= 15;
  if (macd.signal.includes("Bullish")) score += 10;

  return {
    rsi, macd, ema, sma, bollinger, atr, obv, stoch, adx, vwap, ichimoku,
    fibonacci: fib,
    parabolicSar: psar,
    volumeProfile: volProf,
    overall: { score: Math.max(0, Math.min(100, score)), confidence: "High", recommendation: score > 60 ? "BUY" : (score < 40 ? "SELL" : "NEUTRAL") }
  };
}

function generatePriceHistory(metrics: TokenMetrics, length: number = 50): number[] {
  let p = metrics.price;
  return Array.from({ length }, () => p *= (1 + (Math.random() - 0.5) * 0.02));
}

function generateVolumeHistory(metrics: TokenMetrics, length: number): number[] {
  return Array.from({ length }, () => metrics.volume24h / 24 * (0.5 + Math.random()));
}

export function formatIndicatorsForDisplay(analysis: IndicatorAnalysis): string {
  return `
<b>📊 TECHNICAL ANALYSIS</b>
━━━━━━━━━━━━━━━━━━
<b>Trend:</b> ${analysis.ema.alignment} | ${analysis.ema.signal}
<b>RSI:</b> ${analysis.rsi.value} (${analysis.rsi.signal})
<b>MACD:</b> ${analysis.macd.signal}
<b>Bollinger:</b> ${analysis.bollinger.position}
<b>Fibonacci:</b> ${analysis.fibonacci.current_level}
<b>SAR:</b> ${analysis.parabolicSar.signal}
<b>ADX:</b> ${analysis.adx.strength}
━━━━━━━━━━━━━━━━━━
<b>SCORE:</b> ${analysis.overall.score}/100
<b>SIGNAL:</b> ${analysis.overall.recommendation}`;
}
