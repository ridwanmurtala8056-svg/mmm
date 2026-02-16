import axios from "axios";
import { log } from "./index.js";

interface PriceData {
  price: string;
  change24h: number;
  high24h: string;
  low24h: string;
  volume24h: number;
  quote: string;
  source: string;
}

// Simple in-memory cache for prices
const priceCache = new Map<string, { data: PriceData; timestamp: number }>();
const PRICE_CACHE_TTL = parseInt(process.env.PRICE_CACHE_TTL_MS || "45000", 10); // default 45s

// Circuit breaker state per provider
const circuitBreaker: Record<string, { failures: number; lastFailure: number; openUntil: number }> = {
  binance: { failures: 0, lastFailure: 0, openUntil: 0 },
  cryptocompare: { failures: 0, lastFailure: 0, openUntil: 0 },
  yahoo: { failures: 0, lastFailure: 0, openUntil: 0 },
  coingecko: { failures: 0, lastFailure: 0, openUntil: 0 },
  dia: { failures: 0, lastFailure: 0, openUntil: 0 }
};

function isCircuitOpen(provider: string) {
  const cb = circuitBreaker[provider];
  if (!cb) return false;
  if (cb.openUntil && Date.now() < cb.openUntil) return true;
  return false;
}

function markFailure(provider: string) {
  const cb = circuitBreaker[provider];
  if (!cb) return;
  cb.failures = (cb.failures || 0) + 1;
  cb.lastFailure = Date.now();
  if (cb.failures >= 3) {
    cb.openUntil = Date.now() + 60 * 1000; // open for 1 minute
    log(`Circuit opened for ${provider} for 60s`, "price-service");
  }
}

function markSuccess(provider: string) {
  const cb = circuitBreaker[provider];
  if (!cb) return;
  cb.failures = 0;
  cb.openUntil = 0;
}

export async function fetchPriceData(symbol: string): Promise<PriceData | null> {
  const parts = symbol.split('/');
  const base = parts[0].toLowerCase();
  const quote = parts[1]?.toUpperCase() || 'USDT';
  const cacheKey = `${base.toUpperCase()}/${quote}`;

  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.data;
  }

  // Provider sequence with circuit breaker checks
  // 1. Binance
  if (!isCircuitOpen('binance')) {
    try {
      const binanceSymbol = `${base}${quote}`.toUpperCase();
      const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`, { timeout: 5000 });
      const d: any = res.data;
      if (d && d.price) {
        const price = parseFloat(d.price);
        const out: PriceData = { price: price.toString(), change24h: 0, high24h: price.toString(), low24h: price.toString(), volume24h: 0, quote, source: 'Binance' };
        priceCache.set(cacheKey, { data: out, timestamp: Date.now() });
        markSuccess('binance');
        return out;
      }
    } catch (e: any) {
      markFailure('binance');
    }
  }

  // 2. CryptoCompare
  if (!isCircuitOpen('cryptocompare')) {
    try {
      const res = await axios.get(`https://min-api.cryptocompare.com/data/price?fsym=${base.toUpperCase()}&tsyms=${quote.toUpperCase()}`, { timeout: 5000 });
      const d: any = res.data;
      if (d && d[quote.toUpperCase()]) {
        const price = d[quote.toUpperCase()];
        const out: PriceData = { price: price.toString(), change24h: 0, high24h: price.toString(), low24h: price.toString(), volume24h: 0, quote, source: 'CryptoCompare' };
        priceCache.set(cacheKey, { data: out, timestamp: Date.now() });
        markSuccess('cryptocompare');
        return out;
      }
    } catch (e: any) {
      markFailure('cryptocompare');
    }
  }

  // 3. Yahoo
  if (!isCircuitOpen('yahoo')) {
    try {
      let yahooSymbol = `${base.toUpperCase()}-${quote.toUpperCase()}`;
      if (['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'].includes(base.toUpperCase())) {
        yahooSymbol = `${base.toUpperCase()}${quote.toUpperCase()}=X`;
      }
      const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const d: any = res.data;
      if (d?.chart?.result?.[0]) {
        const meta = d.chart.result[0].meta;
        const price = meta.regularMarketPrice;
        const out: PriceData = { price: price.toString(), change24h: 0, high24h: price.toString(), low24h: price.toString(), volume24h: 0, quote, source: 'Yahoo Finance' };
        priceCache.set(cacheKey, { data: out, timestamp: Date.now() });
        markSuccess('yahoo');
        return out;
      }
    } catch (e: any) {
      markFailure('yahoo');
    }
  }

  // 4. CoinGecko
  if (!isCircuitOpen('coingecko')) {
    try {
      const cgRes = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${base}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true`, { timeout: 5000 });
      const cgData: any = cgRes.data || {};
      let data = cgData[base];
      if (!data) {
        const searchRes = await axios.get(`https://api.coingecko.com/api/v3/search?query=${base}`, { timeout: 5000 });
        const sdata: any = searchRes.data || {};
        const coinId = sdata?.coins?.[0]?.id;
        if (coinId) {
          const priceRes = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true`, { timeout: 5000 });
          const pdata: any = priceRes.data || {};
          data = pdata[coinId];
        }
      }
      if (data) {
        const out: PriceData = { price: (data.usd ?? data.usd_price ?? 0).toString(), change24h: data.usd_24h_change || 0, high24h: ((data.usd ?? 0) * 1.02).toString(), low24h: ((data.usd ?? 0) * 0.98).toString(), volume24h: data.usd_24h_vol || 0, quote, source: 'CoinGecko' };
        priceCache.set(cacheKey, { data: out, timestamp: Date.now() });
        markSuccess('coingecko');
        return out;
      }
    } catch (e: any) { log(`CoinGecko failed for ${base}: ${e}`, "price-service"); markFailure('coingecko'); }
  }

  // 5. DIA
  if (!isCircuitOpen('dia')) {
    try {
      const symUpper = base.toUpperCase();
      const res = await axios.get(`https://api.diadata.org/v1/quotation/${symUpper}`, { timeout: 5000 });
      const d: any = res.data || {};
      if (d && d.Price) {
        const out: PriceData = { price: d.Price.toString(), change24h: d.PricePercentageChange24h || 0, high24h: (d.Price * 1.02).toString(), low24h: (d.Price * 0.98).toString(), volume24h: d.Volume24h || 0, quote, source: 'DIA' };
        priceCache.set(cacheKey, { data: out, timestamp: Date.now() });
        markSuccess('dia');
        return out;
      }
    } catch (e: any) { log(`DIA failed for ${base}: ${e}`, "price-service"); markFailure('dia'); }
  }

  return null;
}
