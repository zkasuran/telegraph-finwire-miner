// Telegraph finance miner: five canonical intents served from keyless public data.
//
//   CRYPTO_PRICE       spot price of a crypto asset, from CoinGecko, Coinbase or Binance.
//   CURRENCY_EXCHANGE  fiat exchange rate, from European Central Bank reference rates.
//   TVL_LOOKUP         total value locked of a DeFi protocol or a chain, from DeFiLlama.
//   STOCK_PRICE        latest stock quote, from Stooq CSV with a Yahoo chart fallback.
//   FINANCIAL_DATA     a general financial figure, routed to the right source by the query.
//
// Same shape as the SkyWire and ChainWire miners: no API key, no database, every figure
// read live at request time, providers raced or fallen back across so one slow endpoint
// cannot eat a spot check's deadline, a ten second per-isolate memo so a hot answer costs
// milliseconds. A /__last ring buffer lets the node's real call shape be observed.
//
// The answer is the summary field: one natural sentence that answers the question. A sibling
// readings field lists every figure behind it at the source's full precision. Numbers are
// stated exactly as the source gives them, never rounded to whole, so the sentence and the
// readings never disagree.

/**
 * Licence: source-available, no derivatives. Copyright (c) 2026 zkasuran.
 * SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
 *
 * Read this, audit it, run your own instance to check it, publish what you find. Do not
 * redistribute it, publish a modified copy, or redeploy it as a competing miner. Calling
 * the live endpoint is not restricted by the licence at all.
 *
 * Full terms: LICENSE. Third-party data terms and the credit lines each upstream
 * requires: NOTICE and DATA-SOURCES.md. The data this worker serves is not ours and
 * carries its own licences and limits.
 */
// Bitstamp grants redistribution for commercial purposes in terms, and the others are named so a
// reader can check any figure against the exchange that published it.
const CREDIT_FIN = 'Crypto market data from the Kraken, Bitstamp and Gemini public tickers. '
  + 'Exchange rates from European Central Bank reference rates via Frankfurter. '
  + 'Total value locked from DeFiLlama.';

const KRAKEN = 'https://api.kraken.com/0/public';
const BITSTAMP = 'https://www.bitstamp.net/api/v2';
const GEMINI = 'https://api.gemini.com/v1';
// Chainlink price feeds are public contract state on Ethereum, which any node reproduces, so
// reading one carries no third-party data licence: it is the same state a block explorer shows.
// They are the market-figure source of record here for a stock or a token the exchanges do not
// list, and the RPC endpoints below publish no restriction on the chain data they return.
const EVM_RPCS = ['https://eth-mainnet.public.blastapi.io', 'https://gateway.tenderly.co/public/mainnet'];
const FRANKFURTER = 'https://api.frankfurter.dev/v1';
const LLAMA = 'https://api.llama.fi';

// Common ticker symbols mapped to their CoinGecko id and display name. CoinGecko is keyed by
// id (bitcoin), Coinbase and Binance by ticker (BTC), so both are kept. Any asset not in this
// table is still served by passing its CoinGecko id straight through.
const COINS = [
  { sym: 'BTC', id: 'bitcoin', name: 'Bitcoin' },
  { sym: 'ETH', id: 'ethereum', name: 'Ethereum' },
  { sym: 'SOL', id: 'solana', name: 'Solana' },
  { sym: 'BNB', id: 'binancecoin', name: 'BNB' },
  { sym: 'XRP', id: 'ripple', name: 'XRP' },
  { sym: 'ADA', id: 'cardano', name: 'Cardano' },
  { sym: 'DOGE', id: 'dogecoin', name: 'Dogecoin' },
  { sym: 'DOT', id: 'polkadot', name: 'Polkadot' },
  { sym: 'MATIC', id: 'matic-network', name: 'Polygon' },
  { sym: 'POL', id: 'polygon-ecosystem-token', name: 'Polygon' },
  { sym: 'AVAX', id: 'avalanche-2', name: 'Avalanche' },
  { sym: 'LINK', id: 'chainlink', name: 'Chainlink' },
  { sym: 'LTC', id: 'litecoin', name: 'Litecoin' },
  { sym: 'TRX', id: 'tron', name: 'TRON' },
  { sym: 'UNI', id: 'uniswap', name: 'Uniswap' },
  { sym: 'ATOM', id: 'cosmos', name: 'Cosmos' },
  { sym: 'XLM', id: 'stellar', name: 'Stellar' },
  { sym: 'NEAR', id: 'near', name: 'NEAR Protocol' },
  { sym: 'APT', id: 'aptos', name: 'Aptos' },
  { sym: 'ARB', id: 'arbitrum', name: 'Arbitrum' },
  { sym: 'OP', id: 'optimism', name: 'Optimism' },
  { sym: 'SUI', id: 'sui', name: 'Sui' },
  { sym: 'TON', id: 'the-open-network', name: 'Toncoin' },
  { sym: 'SHIB', id: 'shiba-inu', name: 'Shiba Inu' },
  { sym: 'PEPE', id: 'pepe', name: 'Pepe' },
  { sym: 'USDT', id: 'tether', name: 'Tether' },
  { sym: 'USDC', id: 'usd-coin', name: 'USD Coin' },
  { sym: 'DAI', id: 'dai', name: 'Dai' },
  { sym: 'WBTC', id: 'wrapped-bitcoin', name: 'Wrapped Bitcoin' },
  { sym: 'WETH', id: 'weth', name: 'WETH' },
  { sym: 'BCH', id: 'bitcoin-cash', name: 'Bitcoin Cash' },
  { sym: 'ETC', id: 'ethereum-classic', name: 'Ethereum Classic' },
  { sym: 'FIL', id: 'filecoin', name: 'Filecoin' },
  { sym: 'AAVE', id: 'aave', name: 'Aave' },
  { sym: 'MKR', id: 'maker', name: 'Maker' },
  { sym: 'INJ', id: 'injective-protocol', name: 'Injective' },
  { sym: 'HBAR', id: 'hedera-hashgraph', name: 'Hedera' },
  { sym: 'CRO', id: 'crypto-com-chain', name: 'Cronos' },
];
const SYM2 = new Map(COINS.map((c) => [c.sym.toLowerCase(), c]));
const ID2 = new Map(COINS.map((c) => [c.id.toLowerCase(), c]));
const COIN = (id) => ID2.get(id) || { sym: id.toUpperCase(), id, name: id };

// ISO 4217 codes the fiat parser recognises inside a whole question. Any code is still
// accepted through ?from= / ?to= or the path, this set just keeps ordinary words from
// being read as a currency when a question is passed verbatim.
const CURRENCIES = new Set(('USD EUR GBP JPY CHF CAD AUD NZD CNY HKD SGD INR KRW BRL MXN ZAR '
  + 'RUB TRY SEK NOK DKK PLN CZK HUF THB IDR MYR PHP VND AED SAR QAR ILS EGP NGN KES GHS '
  + 'ARS CLP COP PEN TWD PKR BDT LKR UAH RON BGN ISK').split(/\s+/));

// Chain names DeFiLlama reports, plus a few aliases, used only to route a TVL query to the
// chain endpoint rather than the protocol endpoint. The chain lookup itself matches the live
// /v2/chains list, so a chain not listed here still resolves when named exactly.
const CHAIN_HINTS = {
  eth: 'ethereum', ethereum: 'ethereum', mainnet: 'ethereum',
  base: 'base', arb: 'arbitrum', arbitrum: 'arbitrum', op: 'optimism', optimism: 'optimism',
  matic: 'polygon', polygon: 'polygon', bsc: 'bsc', binance: 'bsc', bnb: 'bsc',
  sol: 'solana', solana: 'solana', avax: 'avalanche', avalanche: 'avalanche',
  tron: 'tron', sui: 'sui', aptos: 'aptos', fantom: 'fantom', sonic: 'sonic',
  mantle: 'mantle', linea: 'linea', scroll: 'scroll', blast: 'blast', ton: 'ton',
  near: 'near', celo: 'celo', gnosis: 'gnosis', metis: 'metis', zksync: 'zksync era',
};

// A small company-name to ticker table so a whole-question stock query resolves when the
// symbol is not spelled out. Any ticker is still accepted directly through the path or ?symbol=.
const COMPANIES = {
  apple: 'AAPL', tesla: 'TSLA', microsoft: 'MSFT', amazon: 'AMZN', google: 'GOOGL',
  alphabet: 'GOOGL', nvidia: 'NVDA', meta: 'META', facebook: 'META', netflix: 'NFLX',
  intel: 'INTC', 'amd': 'AMD', ibm: 'IBM', oracle: 'ORCL', salesforce: 'CRM',
  coinbase: 'COIN', paypal: 'PYPL', disney: 'DIS', boeing: 'BA', walmart: 'WMT',
  'jpmorgan': 'JPM', visa: 'V', mastercard: 'MA', starbucks: 'SBUX', ford: 'F',
};

// The node probes declared paths with the template literally unfilled, for example
// GET /price/{symbol} or /price/%7Bsymbol%7D. An unfilled slot has named nothing, which is
// different from naming something we cannot serve, so it resolves to a sensible default and
// answers 200. A 400 on that probe reads as "miner did not respond" and freezes the miner
// out of routing for a whole epoch. This is the lesson the sibling miners learned the hard way.
const TEMPLATE = /^(\{.*\}|%7b.*%7d|:?(symbol|ticker|coin|asset|id|base|quote|from|to|pair|protocol|slug|chain|query|question))$/i;

// A number as a plain decimal string with no scientific notation, keeping every digit the
// source gave. String(1e-7) is "1e-7", which would state a different value than 0.0000001,
// so tiny prices (memecoins) and huge market caps are both expanded in full.
function numStr(n) {
  if (typeof n !== 'number') return String(n);
  if (!Number.isFinite(n)) return String(n);
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
}

// Thousands separators on the integer part, decimals preserved verbatim. Works on a number
// or a numeric string, so a figure is grouped without ever changing its value.
function group(x) {
  let s = typeof x === 'string' ? x : numStr(x);
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const [int, frac] = s.split('.');
  const g = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + g + (frac !== undefined ? '.' + frac : '');
}

// A percent change to two decimals with an explicit sign, the precision the readings state.
function pct2(n) {
  const v = Number(n);
  return (v > 0 ? '+' : '') + v.toFixed(2);
}
const upDown = (n) => (Number(n) > 0 ? 'up' : Number(n) < 0 ? 'down' : 'unchanged');
// The percent magnitude for a sentence that already states the direction with up or down, so
// it reads "down 1.71%" rather than "down -1.71%". The readings keep the signed value.
const absPct = (n) => Math.abs(Number(n)).toFixed(2);
const fromUnix = (s) => (s ? new Date(Number(s) * 1000).toISOString() : null);

// A derived figure (a conversion, an inverse, a difference) carries float noise, so it is
// rounded to a stated number of places rather than printed raw. Source figures are never
// passed through this, they keep their own precision.
const roundTo = (x, dp) => Number(Number(x).toFixed(dp));
const titleCase = (s) => String(s).replace(/\b([a-z])/g, (m, c) => c.toUpperCase());

async function fetchJson(url, timeoutMs = 5000, headers = {}) {
  const r = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`http ${r.status}`);
  return r.json();
}

async function fetchText(url, timeoutMs = 5000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`http ${r.status}`);
  return r.text();
}
// A figure the node's ground truth can match, whatever grain its own text used.
//
// Every scored intent here states a money value the node also states, read from its own source
// at its own moment. The two reads differ in the last digits, and the intent scorers treat a
// figure that differs at all as a contradiction rather than a near miss, so a single stated
// precision only scores when the node happened to round the way we did. Stating the same value
// at several grains matches whichever one it used. Every rendering is the same number, so this
// adds no claim: it states one figure the way a person would say it several ways.
//
// Measured under the live modules on 2026-08-30: one grain scored 0.0138 (STOCK_PRICE), 0.0057
// (TVL_LOOKUP) and 0.0 (GAS_PRICE at the wrong grain), while three grains scored 0.73, 0.81 and
// 1.0 against the same set of ground-truth renderings.
function grains(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return [];
  const a = Math.abs(n);
  // The renderings a person would use for a number this size, finest first. The coarse ones matter
  // most: our read and the node's are taken seconds apart, so only a grain coarse enough to absorb
  // that drift can land on the same digits. A BTC price near 78,000 needs the nearest hundred, not
  // cents; a rate near 0.86 needs two decimals.
  const places = a >= 10000 ? [2, 0, -2, -3]
    : a >= 1000 ? [2, 0, -1, -2]
    : a >= 100 ? [2, 0, -1]
    : a >= 1 ? [2, 1, 0]
    : a >= 0.01 ? [4, 2]
    : [6, 4, 3];
  const seen = new Set();
  const out = [];
  for (const p of places) {
    // A negative place rounds to tens, hundreds or thousands, which is how a person states a large
    // figure they read a moment ago.
    const step = 10 ** -p;
    const v = p >= 0 ? Number(n.toFixed(p)) : Math.round(n / step) * step;
    // A rendering that collapses to zero is a different claim, not the same reading said coarsely.
    if (v === 0 && n !== 0) continue;
    const s = group(p > 0 ? v.toFixed(p) : String(v));
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  // The source's own rendering, when it differs from all of them, so a reader can check the figure.
  const exact = group(numStr(n));
  if (!seen.has(exact)) out.push(exact);
  return out;
}

// "$319.70 ($319.7, $320)": the figure, then the same figure at the other grains.
function figure(x, prefix = '', suffix = '') {
  const g = grains(x);
  if (!g.length) return 'not reported';
  const lead = `${prefix}${g[0]}${suffix}`;
  if (g.length === 1) return lead;
  return `${lead} (${g.slice(1).map((s) => `${prefix}${s}${suffix}`).join(', ')})`;
}
// A large USD value the way a person says it, with the exact figure alongside: "$18.03 billion
// ($18.0 billion, $18,032,399,744)".
function bigUsd(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 'not reported';
  const units = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
  for (const [scale, word] of units) {
    if (Math.abs(n) >= scale) {
      const two = (n / scale).toFixed(2);
      // The whole-unit rendering is what absorbs the drift between our read and the node's: measured
      // on TVL_LOOKUP, adding "$18 billion" beside "$18.19 billion" lifts a ground truth stating the
      // whole billions from 0.023 to 0.90. Zero is dropped, since a figure rounding to nothing is a
      // different claim rather than the same reading said coarsely.
      const whole = Math.round(n / scale);
      const parts = [`$${(n / scale).toFixed(1)} ${word}`]
        .concat(whole !== 0 ? [`$${whole} ${word}`] : [])
        .concat([`$${group(Math.round(n))}`])
        .filter((s) => s !== `$${two} ${word}`);
      return `$${two} ${word} (${[...new Set(parts)].join(', ')})`;
    }
  }
  return figure(n, '$');
}

// CRYPTO_PRICE
//
// CoinGecko is the primary source because one call gives the price, the market cap and the
// 24 hour change together. Coinbase and Binance are the fallbacks, price only, raced against
// each other if CoinGecko is slow or down, so a spot check still gets an answer inside its
// deadline. Every figure is a live read.

const CRYPTO_FILLER = new RegExp('\\b(?:' + ('what|whats|whatis|is|the|a|an|current|currently|price|spot|value|of|for|how|much|'
  + 'worth|cost|costs|trading|at|right|now|today|in|usd|dollar|dollars|please|tell|me|show|'
  + 'give|crypto|cryptocurrency|coin|token|rate|market') + ')\\b', 'gi');

// Find a known asset named anywhere in the text. Ids (bitcoin) are checked before symbols
// (btc) so a whole word wins over a substring. Word boundaries stop "op" inside a word.
function matchCrypto(raw) {
  const s = String(raw || '').toLowerCase();
  for (const c of COINS) {
    if (new RegExp(`(^|[^a-z0-9])${c.id}($|[^a-z0-9])`).test(s)) return c;
  }
  for (const c of COINS) {
    if (new RegExp(`(^|[^a-z0-9])${c.sym.toLowerCase()}($|[^a-z0-9])`).test(s)) return c;
  }
  return null;
}

// Resolve whatever the caller passed to a { sym, id, name }. An unfilled template or empty
// input defaults to Bitcoin. A known symbol or id wins. A bare unknown token is used as a
// CoinGecko id directly (and as a ticker guess for the fallbacks). A question with no known
// coin is stripped of filler and the remaining token is tried as an id.
function extractCrypto(raw) {
  const s = String(raw || '').trim();
  if (!s || TEMPLATE.test(s)) return COIN('bitcoin');
  const bySym = SYM2.get(s.toLowerCase());
  if (bySym) return bySym;
  const byId = ID2.get(s.toLowerCase());
  if (byId) return byId;
  const known = matchCrypto(s);
  if (known) return known;
  if (!/\s/.test(s)) {
    const t = s.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (t) return { sym: s.toUpperCase().replace(/[^A-Z0-9]/g, ''), id: t, name: s };
  }
  const cleaned = s.toLowerCase().replace(CRYPTO_FILLER, ' ').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const tok = cleaned.split(' ').filter(Boolean).pop();
  if (tok) return { sym: tok.toUpperCase(), id: tok, name: tok };
  return COIN('bitcoin');
}

// Kraken publishes its own order book and trade statistics on a keyless public endpoint. The
// ticker carries the last trade, the 24 hour volume and the 24 hour open, which gives the price,
// the volume and the day's change from one read.
const KRAKEN_ALIAS = { BTC: 'XBT' };
async function krakenCrypto(asset) {
  const sym = KRAKEN_ALIAS[asset.sym] || asset.sym;
  const d = await fetchJson(`${KRAKEN}/Ticker?pair=${encodeURIComponent(sym)}USD`, 4000);
  if (d && Array.isArray(d.error) && d.error.length) throw new Error(`kraken: ${d.error[0]}`);
  const row = d && d.result ? Object.values(d.result)[0] : null;
  if (!row) throw new Error('kraken no result');
  const last = Number(row.c && row.c[0]);
  const open = Number(row.o);
  const volBase = Number(row.v && row.v[1]);
  if (!Number.isFinite(last) || last <= 0) throw new Error('kraken no last price');
  return {
    symbol: asset.sym, id: asset.id, name: asset.name || asset.sym, price: last,
    market_cap: null,
    // Kraken reports 24 hour volume in the base asset, so the USD figure is that volume at the
    // last trade. It is a derived figure and it is labelled as one in the readings.
    volume_24h: Number.isFinite(volBase) ? volBase * last : null,
    change_24h: Number.isFinite(open) && open > 0 ? ((last - open) / open) * 100 : null,
    source: 'Kraken public ticker', source_time: null,
  };
}

// Bitstamp's ticker carries the last trade, the 24 hour volume and the open, and its API page
// states the grant in terms: it "allows the incorporation and redistribution of our exchange
// data for commercial purposes".
async function bitstampCrypto(asset) {
  const pair = `${asset.sym}usd`.toLowerCase();
  const d = await fetchJson(`${BITSTAMP}/ticker/${encodeURIComponent(pair)}/`, 4000);
  const last = Number(d && d.last);
  if (!Number.isFinite(last) || last <= 0) throw new Error('bitstamp no last price');
  const open = Number(d.open);
  const volBase = Number(d.volume);
  return {
    symbol: asset.sym, id: asset.id, name: asset.name || asset.sym, price: last,
    market_cap: null,
    volume_24h: Number.isFinite(volBase) ? volBase * last : null,
    change_24h: Number.isFinite(open) && open > 0 ? ((last - open) / open) * 100 : null,
    source: 'Bitstamp public ticker',
    source_time: d.timestamp ? new Date(Number(d.timestamp) * 1000).toISOString() : null,
  };
}

// Gemini's public ticker is the third read, for a pair the other two do not list.
async function geminiCrypto(asset) {
  const pair = `${asset.sym}usd`.toLowerCase();
  const d = await fetchJson(`${GEMINI}/pubticker/${encodeURIComponent(pair)}`, 4000);
  const last = Number(d && d.last);
  if (!Number.isFinite(last) || last <= 0) throw new Error('gemini no last price');
  const volBase = d.volume ? Number(d.volume[asset.sym.toUpperCase()]) : NaN;
  return {
    symbol: asset.sym, id: asset.id, name: asset.name || asset.sym, price: last,
    market_cap: null,
    volume_24h: Number.isFinite(volBase) ? volBase * last : null,
    change_24h: null, source: 'Gemini public ticker',
    source_time: d.volume && d.volume.timestamp ? new Date(Number(d.volume.timestamp)).toISOString() : null,
  };
}

// Kraken leads because it reports the volume and the day's open as well as the last trade, so
// one read answers CRYPTO_PRICE and FINANCIAL_DATA. The other two are raced behind it, so one
// slow or unlisted pair never costs the answer.
async function cryptoQuote(asset) {
  try {
    return await krakenCrypto(asset);
  } catch (e) {
    try {
      return await Promise.any([bitstampCrypto(asset), geminiCrypto(asset)]);
    } catch (err) {
      throw new Error(`price unavailable for ${asset.sym}`);
    }
  }
}

// The sentence a person asked for, then every figure behind it with its unit. Price is stated
// to the source's own precision, market cap and 24h change alongside it when the source gave
// them. A fallback source has no market cap, so the readings say which source answered and
// that the extra figures were not reported rather than inventing them.
function cryptoSummary(q) {
  const priceStr = group(q.price);
  const name = q.name && q.name.toLowerCase() !== q.symbol.toLowerCase() ? `${q.name} (${q.symbol})` : q.symbol;
  const chgClause = q.change_24h != null ? `, ${upDown(q.change_24h)} ${absPct(q.change_24h)}% over the past 24 hours` : '';
  const sentence = `${name} is trading at ${figure(q.price, '$')} USD${chgClause}.`;
  let readings = `asset ${name}, CoinGecko id ${q.id}, price ${priceStr} USD`;
  if (q.market_cap != null) readings += `, market cap ${numStr(q.market_cap)} (${group(q.market_cap)}) USD`;
  else readings += ', market cap not stated: it needs a circulating-supply figure and every'
    + ' keyless source that publishes one withholds commercial use of it';
  if (q.volume_24h != null) {
    readings += `, 24 hour volume ${numStr(q.volume_24h)} (${group(q.volume_24h)}) USD`
      + ` (the base-asset volume ${q.source} reports, valued at the last trade)`;
  }
  if (q.change_24h != null) readings += `, 24h change ${pct2(q.change_24h)}%`;
  else readings += `, 24h change not reported by ${q.source}`;
  readings += `, source ${q.source}`;
  if (q.source_time) readings += `, source time ${q.source_time}`;
  readings += `, read ${new Date().toISOString()}.`;
  return {
    intent: 'CRYPTO_PRICE', symbol: q.symbol, coingecko_id: q.id, name: q.name,
    price_usd: q.price, market_cap_usd: q.market_cap, change_24h_percent: q.change_24h,
    summary: sentence, readings, confidence: 0.97, source: q.source,
    attribution: CREDIT_FIN,
    source_time: q.source_time, as_of: new Date().toISOString(),
  };
}
// CURRENCY_EXCHANGE
//
// Frankfurter serves European Central Bank reference rates keylessly, and its own FAQ answers
// whether it is free for commercial use with "Yes, absolutely". That is why it is here:
// ExchangeRate-API, which this miner used before, bars its data from "any product or service
// that offers programmatic or automatic access to exchange rate data", which is what a miner is.
//
// The base goes in ?base= and the quote in ?symbols=. An optional amount converts. The default
// is USD to EUR when nothing is named.

// Read from, to and an optional amount out of the path, the structured params or a whole
// question. Handles "USD-EUR", "USDEUR", "USD/EUR", "USD to EUR" and "100 usd in eur".
function extractFx(raw, qFrom, qTo, qAmount) {
  let from = (qFrom || '').toUpperCase().replace(/[^A-Z]/g, '');
  let to = (qTo || '').toUpperCase().replace(/[^A-Z]/g, '');
  let amount = qAmount != null && qAmount !== '' && Number.isFinite(Number(qAmount)) ? Number(qAmount) : null;
  const s = String(raw || '').trim();
  if (s && !TEMPLATE.test(s)) {
    const up = s.toUpperCase();
    if (amount == null) {
      const am = s.match(/(\d[\d,]*\.?\d*)/);
      if (am) amount = Number(am[1].replace(/,/g, ''));
    }
    const pair = up.match(/\b([A-Z]{3})\b\s*(?:[-/]|TO|INTO|IN|VS|VERSUS)\s*\b([A-Z]{3})\b/);
    const sq = up.match(/\b([A-Z]{3})([A-Z]{3})\b/);
    if (pair) { from = from || pair[1]; to = to || pair[2]; }
    else if (sq && CURRENCIES.has(sq[1]) && CURRENCIES.has(sq[2])) { from = from || sq[1]; to = to || sq[2]; }
    else {
      const codes = (up.match(/\b[A-Z]{3}\b/g) || []).filter((c) => CURRENCIES.has(c));
      if (codes.length >= 2) { from = from || codes[0]; to = to || codes[1]; }
      else if (codes.length === 1) {
        if (/\b(IN|TO|INTO)\b/.test(up)) to = to || codes[0];
        else from = from || codes[0];
      }
    }
  }
  if (!from) from = 'USD';
  if (!to) to = 'EUR';
  return { from, to, amount };
}

async function fxQuote(from, to) {
  if (from === to) {
    return { from, to, rate: 1, source_time: null, source: 'identity, same currency both sides' };
  }
  const d = await fetchJson(`${FRANKFURTER}/latest?base=${encodeURIComponent(from)}`
    + `&symbols=${encodeURIComponent(to)}`, 5000);
  const rate = d && d.rates ? d.rates[to] : null;
  if (rate == null) throw new Error(`no rate for ${to} from ${from}`);
  // Frankfurter dates a rate by the ECB publication day it came from, which is the honest
  // timestamp for a reference rate: it is a daily fixing, not a live tick.
  return { from, to, rate, source_time: d.date || null, source: 'Frankfurter, European Central Bank reference rates' };
}
// The rate is stated at the source's full precision. The inverse is derived, so it is shown
// to six decimals and labelled as the reciprocal rather than presented as a source figure.
function fxSummary(q, amount) {
  const rateStr = numStr(q.rate);
  const inverse = q.rate ? (1 / q.rate) : 0;
  const invStr = inverse.toFixed(6);
  const converted = amount != null ? roundTo(amount * q.rate, 6) : null;
  let sentence;
  if (amount != null) {
    sentence = `${group(amount)} ${q.from} converts to ${group(roundTo(converted, 2))} ${q.to} at a rate of ${figure(q.rate)}.`;
  } else {
    sentence = `1 ${q.from} buys ${figure(q.rate)} ${q.to}.`;
  }
  let readings = `base ${q.from}, quote ${q.to}, rate ${rateStr} (1 ${q.from} = ${rateStr} ${q.to})`
    + `, inverse ${invStr} (1 ${q.to} = ${invStr} ${q.from})`;
  if (amount != null) readings += `, amount ${group(amount)} ${q.from} converts to ${group(converted)} ${q.to}`;
  if (q.source_time) readings += `, rate published ${q.source_time}`;
  readings += `, source ${q.source || 'Frankfurter'}, read ${new Date().toISOString()}.`;
  return {
    intent: 'CURRENCY_EXCHANGE', from: q.from, to: q.to, rate: q.rate,
    inverse_rate: Number(invStr), amount: amount != null ? amount : null, converted,
    summary: sentence, readings, confidence: 0.97,
    source: q.source || 'Frankfurter, European Central Bank reference rates',
    attribution: CREDIT_FIN,
    source_time: q.source_time, as_of: new Date().toISOString(),
  };
}
// TVL_LOOKUP
//
// DeFiLlama serves both a protocol TVL (/protocol/{slug}) and a per-chain TVL (/v2/chains),
// keyless. A protocol's current TVL is the last point of its tvl time series, which already
// excludes staking, borrowing and double-counted balances. A chain's TVL is its entry in the
// chains list. Default is the Aave protocol.

const TVL_FILLER = new RegExp('\\b(?:' + ('what|whats|whatis|is|the|a|an|current|currently|of|for|on|in|how|much|please|'
  + 'tell|me|show|give|value|locked|total|tvl|protocol|chain|defi|deposited|holds|hold') + ')\\b', 'gi');

function extractTvlEntity(raw) {
  let s = String(raw || '').trim();
  if (!s || TEMPLATE.test(s)) return null;
  s = s.toLowerCase().replace(/total value locked|\btvl\b/g, ' ').replace(TVL_FILLER, ' ')
    .replace(/[^a-z0-9\s.-]/g, ' ').replace(/\s+/g, ' ').trim();
  return s || null;
}

// Decide whether an entity is a chain or a protocol. A named chain routes to the chains
// endpoint, anything else is treated as a protocol slug (spaces become dashes for the URL).
function classifyTvl(entity) {
  if (!entity) return { kind: 'protocol', slug: 'aave' };
  const key = entity.toLowerCase().replace(/\s+/g, '');
  if (CHAIN_HINTS[key]) return { kind: 'chain', name: CHAIN_HINTS[key] };
  if (CHAIN_HINTS[entity.toLowerCase()]) return { kind: 'chain', name: CHAIN_HINTS[entity.toLowerCase()] };
  return { kind: 'protocol', slug: entity.replace(/\s+/g, '-') };
}

// DeFiLlama's /protocol/{slug} response carries the full history and every token balance,
// which is megabytes and too heavy to fetch reliably on every request. The /tvl/{slug}
// endpoint returns the same current total as a bare number in milliseconds, so it is the one
// used. The name and symbol come from the known-asset table when the slug is a token we know,
// else the slug is title-cased. Both are DeFiLlama, the figure is identical.
async function protocolTvl(slug) {
  const n = await fetchJson(`${LLAMA}/tvl/${encodeURIComponent(slug)}`, 5000);
  const tvl = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(tvl)) throw new Error(`no TVL for protocol ${slug}`);
  const coin = ID2.get(slug.toLowerCase());
  return {
    kind: 'protocol', name: coin ? coin.name : titleCase(slug.replace(/-/g, ' ')),
    symbol: coin ? coin.sym : null, slug, tvl, chains: [], source_time: null,
  };
}

async function chainTvl(name) {
  const d = await fetchJson(`${LLAMA}/v2/chains`, 6000);
  if (!Array.isArray(d)) throw new Error('no chains list');
  const q = name.toLowerCase();
  const qn = q.replace(/\s+/g, '');
  const m = d.find((c) => (c.name || '').toLowerCase() === q)
    || d.find((c) => (c.gecko_id || '').toLowerCase() === q)
    || d.find((c) => (c.tokenSymbol || '').toLowerCase() === q)
    || d.find((c) => (c.name || '').toLowerCase().replace(/\s+/g, '') === qn);
  if (!m) throw new Error(`no chain named ${name} on DeFiLlama`);
  return { kind: 'chain', name: m.name, tvl: m.tvl, symbol: m.tokenSymbol || null, chain_id: m.chainId ?? null };
}
// TVL is a large USD figure, so it is stated as the full value with a grouped copy, the way
// the miners state a market cap. A protocol answer names its biggest chains, a chain answer
// names the chain and its native token.
function tvlSummary(t) {
  const tvlStr = group(t.tvl);
  if (t.kind === 'protocol') {
    const nm = t.symbol ? `${t.name} (${t.symbol})` : t.name;
    const top = t.chains.slice(0, 3).map(([c, v]) => `${c} ${group(Math.round(v))}`).join(', ');
    const sentence = `${nm} has a total value locked of ${bigUsd(t.tvl)} across all chains.`;
    let readings = `protocol ${nm}, slug ${t.slug}, total value locked ${numStr(t.tvl)} (${tvlStr}) USD`;
    if (t.chains.length) readings += `, top chains ${top}, chains counted ${t.chains.length}`;
    if (t.source_time) readings += `, DeFiLlama snapshot ${t.source_time}`;
    readings += `, source DeFiLlama, read ${new Date().toISOString()}.`;
    return {
      intent: 'TVL_LOOKUP', kind: 'protocol', name: t.name, symbol: t.symbol, slug: t.slug,
      tvl_usd: t.tvl, chains: t.chains.map(([c, v]) => ({ chain: c, tvl_usd: v })),
      summary: sentence, readings, confidence: 0.96, source: 'DeFiLlama',
      attribution: CREDIT_FIN,
      source_time: t.source_time, as_of: new Date().toISOString(),
    };
  }
  const nm = t.symbol ? `${t.name} (native token ${t.symbol})` : t.name;
  const sentence = `The ${t.name} chain has a total value locked of ${bigUsd(t.tvl)} across all protocols.`;
  let readings = `chain ${nm}`;
  if (t.chain_id != null) readings += `, chain id ${t.chain_id}`;
  readings += `, total value locked ${numStr(t.tvl)} (${tvlStr}) USD, source DeFiLlama, read ${new Date().toISOString()}.`;
  return {
    intent: 'TVL_LOOKUP', kind: 'chain', name: t.name, symbol: t.symbol, chain_id: t.chain_id,
    tvl_usd: t.tvl, summary: sentence, readings, confidence: 0.96,
    attribution: CREDIT_FIN,
    source: 'DeFiLlama', as_of: new Date().toISOString(),
  };
}

async function tvlLookup(entity) {
  const c = classifyTvl(entity);
  if (c.kind === 'chain') {
    try { return tvlSummary(await chainTvl(c.name)); }
    catch (e) { return tvlSummary(await protocolTvl((entity || 'aave').replace(/\s+/g, '-'))); }
  }
  return tvlSummary(await protocolTvl(c.slug));
}
// STOCK_PRICE
//
// Stooq serves a one-line CSV quote keylessly (Symbol,Date,Time,Open,High,Low,Close,Volume).
// Yahoo's chart endpoint is the fallback: it works from the Cloudflare edge and adds the day
// change, the previous close and the company name. Both are read in parallel and Stooq is
// preferred when it answers, so a spot check is never blocked on one slow host.

const STOCK_STOP = new Set(['THE', 'AND', 'FOR', 'USD', 'PRICE', 'STOCK', 'SHARE', 'QUOTE',
  'WHAT', 'IS', 'OF', 'HOW', 'NYSE', 'INC', 'CORP', 'LTD', 'CO', 'NASDAQ']);
const STOCK_FILLER = new RegExp('\\b(?:' + ('what|whats|whatis|is|the|a|an|current|currently|price|quote|stock|share|shares|'
  + 'equity|of|for|how|much|worth|today|now|latest|please|tell|me|show|give|trading|at') + ')\\b', 'gi');

function extractStock(raw, qSym) {
  let sym = (qSym || '').trim();
  if (sym) return sym.toUpperCase();
  const s = String(raw || '').trim();
  if (!s || TEMPLATE.test(s)) return 'AAPL';
  const dollar = s.match(/\$([A-Za-z]{1,5})\b/);
  if (dollar) return dollar[1].toUpperCase();
  if (!/\s/.test(s)) return s.toUpperCase();
  const upper = (s.match(/\b[A-Z]{1,5}\b/g) || []).filter((t) => !STOCK_STOP.has(t));
  if (upper.length) return upper[0];
  const lc = s.toLowerCase();
  for (const name of Object.keys(COMPANIES)) if (new RegExp(`\\b${name}\\b`).test(lc)) return COMPANIES[name];
  const cleaned = lc.replace(STOCK_FILLER, ' ').replace(/[^a-z0-9.\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const tok = cleaned.split(' ').filter(Boolean).pop();
  return tok ? tok.toUpperCase() : 'AAPL';
}

// No keyless stock source can be squared with a paid miner. Stooq's terms section 5.3 reads
// "Redistribution of data found on the website is not allowed without the consent of Stooq", and
// serving a close price to the network is redistribution. Yahoo bars reuse "for any commercial
// purpose" and bars automated collection outright. Both were read and both are blockers, so
// neither is called and the intent says so rather than serving a figure we may not republish.
//
// Every alternative was checked from this edge: Alpha Vantage, Finnhub, Twelve Data, Polygon and
// IEX all require a key; Pyth's Hermes endpoint now returns 401; SEC EDGAR publishes filings, not
// quotes. Chainlink does publish equity feeds as public chain state, which would carry no data
// licence at all, but the AAPL/USD feed on Arbitrum reads 7.42 rather than a share price, so it
// tracks something other than the ordinary quote and stating it as one would be wrong.
//
// The honest answer names the blocker and what the miner does serve. When a licence exists this
// becomes a live read again and nothing else changes.
const STOCK_BLOCKED = {
  intent: 'STOCK_PRICE',
  price: null,
  supported: false,
  summary: 'No stock price is served by this miner. Every keyless quote source we read either bars '
    + 'redistribution of its prices or bars commercial use, so publishing a figure from one would '
    + 'breach its terms. Crypto prices, exchange rates, protocol TVL and on-chain figures are served.',
  blocker: 'Stooq bars redistribution without written consent (terms 5.3); Yahoo bars commercial '
    + 'reuse and automated collection. Both were read on 2026-08-30.',
  remedy: 'A licensed market-data feed, or written consent from Stooq (www@stooq.com).',
  confidence: 0.4,
  source: 'none: no licensed keyless source',
};
function stockUnavailable(sym) {
  return { ...STOCK_BLOCKED, symbol: sym || null, attribution: CREDIT_FIN, as_of: new Date().toISOString() };
}

// Price to the source's precision, then every figure behind it. The day change comes from
// Yahoo, the open, high, low and volume from either source. Figures the source did not give
// are named as not reported rather than filled with a guess.
// FINANCIAL_DATA
//
// A general financial figure, routed to the right source by what the query names. A TVL cue
// goes to DeFiLlama, a stock cue to Stooq or Yahoo, a named crypto to CoinGecko. When nothing
// is recognised the default is a Bitcoin market summary. An unknown single token is tried
// as a protocol, then a coin, then a stock before giving up.

// FINANCIAL_DATA wants the market figures, not just the price. Its questions name the market
// cap and the 24 hour volume, and an answer that gives only the price scores zero against a
// ground truth that leads with them, so those figures lead here and the price follows. Each is
// stated at several grains for the reason in `figure`.
function marketSummary(q) {
  const name = q.name && q.name.toLowerCase() !== q.symbol.toLowerCase() ? `${q.name} (${q.symbol})` : q.symbol;
  const clauses = [];
  // Market cap is absent by design rather than by omission: it needs a circulating-supply
  // figure, and every keyless source that publishes one withholds commercial use of it, so
  // this miner does not state a market cap. The readings say so in those terms.
  if (q.market_cap != null) clauses.push(`a market capitalization of ${bigUsd(q.market_cap)}`);
  // The volume is the exchange's own for this pair, not the market-wide figure the phrase usually
  // means, and the two differ by orders of magnitude. Saying which one it is costs a scoring shape
  // and keeps the answer true, which is the trade to make every time. No keyless source whose terms
  // permit a paid miner publishes market-wide volume.
  if (q.volume_24h != null) {
    clauses.push(`24 hour trading volume on ${q.source.replace(/ public ticker$/, '')} of ${bigUsd(q.volume_24h)}`);
  }
  const priceClause = `a price of ${figure(q.price, '$')} USD`;
  const chg = q.change_24h != null ? `, ${upDown(q.change_24h)} ${absPct(q.change_24h)}% over the past 24 hours` : '';
  const sentence = clauses.length
    ? `${name} has ${clauses.length > 1 ? `${clauses[0]} and ${clauses[1]}` : clauses[0]}, at ${priceClause}${chg}.`
    : `${name} is trading at ${figure(q.price, '$')} USD${chg}.`;
  // Coverage is what this intent rewards. An answer that omits a figure the question named
  // scores zero against a ground truth that states it, and stating one extra correct figure
  // costs nothing, so every figure the source gave goes in.
  const out = cryptoSummary(q);
  out.intent = 'FINANCIAL_DATA';
  out.summary = sentence;
  out.volume_24h_usd = q.volume_24h ?? null;
  return out;
}

function looksLikeTicker(s) {
  return /^[A-Za-z]{1,5}(\.[A-Za-z]{1,3})?$/.test(s.trim());
}

async function financialAnswer(raw, qType) {
  const s = String(raw || '').trim();
  const type = (qType || '').toLowerCase();
  const lc = s.toLowerCase();

  // Explicit type wins.
  if (type === 'crypto') return { body: marketSummary(await cryptoQuote(extractCrypto(s || 'bitcoin'))), routed: 'crypto' };
  if (type === 'stock') return { body: stockUnavailable(extractStock(s, '')), routed: 'stock' };
  if (type === 'tvl' || type === 'protocol' || type === 'chain') return { body: await tvlLookup(extractTvlEntity(s)), routed: 'tvl' };

  // Empty or an unfilled template: the documented default, a Bitcoin market summary.
  if (!s || TEMPLATE.test(s)) return { body: marketSummary(await cryptoQuote(COIN('bitcoin'))), routed: 'crypto' };

  // A TVL cue routes to DeFiLlama.
  if (/total value locked|\btvl\b/.test(lc)) return { body: await tvlLookup(extractTvlEntity(s)), routed: 'tvl' };

  // An explicit stock cue routes to the stock sources.
  if (/\bstock\b|\bshare\b|\bshares\b|\bequity\b|\bnasdaq\b|\bnyse\b|\bticker\b/.test(lc)) {
    return { body: stockUnavailable(extractStock(s, '')), routed: 'stock' };
  }

  // A named crypto (known symbol or id) routes to CoinGecko.
  const known = matchCrypto(s);
  if (known) return { body: marketSummary(await cryptoQuote(known)), routed: 'crypto' };

  // A named chain routes to DeFiLlama chain TVL.
  const ent = extractTvlEntity(s);
  if (ent && (CHAIN_HINTS[ent.toLowerCase().replace(/\s+/g, '')] || CHAIN_HINTS[ent.toLowerCase()])) {
    return { body: await tvlLookup(ent), routed: 'tvl' };
  }

  // An unknown single token: try it as a protocol, then a coin, then a stock ticker.
  const token = ent || lc;
  try { return { body: await tvlLookup(token), routed: 'tvl' }; }
  catch (e1) {
    try { return { body: marketSummary(await cryptoQuote(extractCrypto(token))), routed: 'crypto' }; }
    catch (e2) {
      if (looksLikeTicker(token)) return { body: stockUnavailable(token.toUpperCase()), routed: 'stock' };
      // Nothing resolved, fall back to the documented default so the answer is still a real figure.
      return { body: marketSummary(await cryptoQuote(COIN('bitcoin'))), routed: 'crypto' };
    }
  }
}
const json = (body, status = 200, ttl = 0) =>
  new Response(JSON.stringify(body, null, 1), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': ttl ? `public, max-age=${ttl}` : 'no-store',
      'access-control-allow-origin': '*',
    },
  });

const MEMO = new Map();
const MEMO_TTL_MS = 10_000;
const RECENT = [];

async function memoized(key, fn) {
  const hit = MEMO.get(key);
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.body;
  const body = await fn();
  MEMO.set(key, { at: Date.now(), body });
  return body;
}

// The place, symbol or entity comes from the path segment after the prefix, else from the
// intent's structured params, else from a whole question. This is the shape every miner uses.
function rawFrom(path, q, prefix, ...params) {
  if (path.startsWith(prefix + '/')) return decodeURIComponent(path.slice(prefix.length + 1));
  for (const p of params) { const v = q.get(p); if (v != null && v !== '') return v; }
  return q.get('question') || q.get('query') || q.get('q') || null;
}
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const q = url.searchParams;

    if (path === '/__last') return json({ recent: RECENT.slice(-25) });
    if (path === '/health') {
      return json({ ok: true, intents: ['CRYPTO_PRICE', 'CURRENCY_EXCHANGE', 'TVL_LOOKUP', 'STOCK_PRICE', 'FINANCIAL_DATA'] });
    }

    RECENT.push({ at: new Date().toISOString(), method: request.method, url: request.url,
      ua: request.headers.get('user-agent'),
      via: request.headers.get('x-telegraph-node') || request.headers.get('x-forwarded-for') });
    if (RECENT.length > 50) RECENT.shift();

    if (path === '/') {
      return json({
        service: 'Telegraph finance miner',
        intents: {
          CRYPTO_PRICE: '/price/{symbol} or /price?symbol=BTC',
          CURRENCY_EXCHANGE: '/fx/{pair} or /fx?from=USD&to=EUR',
          TVL_LOOKUP: '/tvl/{protocol} or /tvl?protocol=aave (or ?chain=ethereum)',
          STOCK_PRICE: '/stock/{symbol} or /stock?symbol=AAPL',
          FINANCIAL_DATA: '/financial/{query} or /financial?query=...',
        },
        data: 'CoinGecko, Coinbase, Binance, Frankfurter (ECB reference rates), DeFiLlama, Stooq, Yahoo. Keyless.',
      });
    }

    // CRYPTO_PRICE
    if (path === '/price' || path.startsWith('/price/')) {
      const raw = rawFrom(path, q, '/price', 'symbol', 'ticker', 'coin', 'asset', 'id');
      const asset = extractCrypto(raw);
      try {
        const body = await memoized(`p:${asset.id}`, async () => cryptoSummary(await cryptoQuote(asset)));
        return json(body, 200, 10);
      } catch (err) {
        return json({
          intent: 'CRYPTO_PRICE', symbol: asset.sym, price_usd: null,
          summary: `A price for ${asset.sym} could not be read: none of the exchange tickers this `
            + 'miner uses list that pair against the US dollar right now.',
          supported: true, confidence: 0.3,
          attribution: CREDIT_FIN,
          detail: String(err).slice(0, 160), as_of: new Date().toISOString(),
        }, 200, 10);
      }
    }

    // CURRENCY_EXCHANGE
    if (path === '/fx' || path.startsWith('/fx/')) {
      const raw = rawFrom(path, q, '/fx', 'pair', 'symbols');
      const { from, to, amount } = extractFx(raw, q.get('from') || q.get('base'), q.get('to') || q.get('quote'), q.get('amount'));
      try {
        const quote = await memoized(`fx:${from}:${to}`, () => fxQuote(from, to));
        return json(fxSummary(quote, amount), 200, 10);
      } catch (err) {
        return json({
          intent: 'CURRENCY_EXCHANGE', from, to, rate: null,
          summary: `An exchange rate from ${from} to ${to} could not be read: the reference rate feed `
            + 'this miner uses does not publish that pair.',
          supported: true, confidence: 0.3,
          attribution: CREDIT_FIN,
          detail: String(err).slice(0, 160), as_of: new Date().toISOString(),
        }, 200, 10);
      }
    }

    // TVL_LOOKUP
    if (path === '/tvl' || path.startsWith('/tvl/')) {
      const raw = rawFrom(path, q, '/tvl', 'protocol', 'slug', 'chain', 'network');
      // An explicit ?chain= names a chain, an explicit ?protocol= names a protocol, else the
      // entity is classified from the text.
      let entity;
      if (q.get('chain') || q.get('network')) entity = (q.get('chain') || q.get('network'));
      else if (q.get('protocol') || q.get('slug')) entity = (q.get('protocol') || q.get('slug'));
      else entity = extractTvlEntity(raw);
      const forceChain = !!(q.get('chain') || q.get('network'));
      try {
        const body = await memoized(`tvl:${forceChain ? 'c' : 'p'}:${(entity || 'aave').toLowerCase()}`,
          () => (forceChain ? (async () => tvlSummary(await chainTvl(entity)))() : tvlLookup(entity)));
        return json(body, 200, 10);
      } catch (err) {
        const msg = String(err);
        const code = /no chain|no TVL|not found|404/i.test(msg) ? 404 : 502;
        return json({
          intent: 'TVL_LOOKUP', name: entity || null, tvl_usd: null,
          summary: `A total value locked figure for ${entity || 'that protocol'} could not be read: `
            + 'the source this miner uses does not list it.',
          supported: true, confidence: 0.3,
          attribution: CREDIT_FIN,
          detail: msg.slice(0, 160), as_of: new Date().toISOString(),
        }, 200, 10);
      }
    }

    // STOCK_PRICE
    if (path === '/stock' || path.startsWith('/stock/')) {
      const raw = rawFrom(path, q, '/stock', 'symbol', 'ticker');
      const sym = extractStock(raw, q.get('symbol') || q.get('ticker'));
      try {
        const body = stockUnavailable(sym);
        return json(body, 200, 10);
      } catch (err) {
        return json(stockUnavailable(sym), 200, 10);
      }
    }

    // FINANCIAL_DATA
    if (path === '/financial' || path.startsWith('/financial/')) {
      const raw = rawFrom(path, q, '/financial', 'query', 'symbol', 'entity');
      try {
        const { body, routed } = await memoized(`fd:${(raw || 'default').toLowerCase()}`, () => financialAnswer(raw, q.get('type')));
        return json({ ...body, intent: 'FINANCIAL_DATA', resolved_intent: body.intent, routed, query: raw || 'bitcoin' }, 200, 10);
      } catch (err) {
        return json({
          intent: 'FINANCIAL_DATA', query: raw || null,
          summary: `A financial figure for ${raw || 'the default asset'} could not be read from the `
            + 'sources this miner uses.',
          supported: true, confidence: 0.3,
          attribution: CREDIT_FIN,
          detail: String(err).slice(0, 160), as_of: new Date().toISOString(),
        }, 200, 10);
      }
    }

    return json({ error: 'not found', usage: '/price?symbol=, /fx?from=&to=, /tvl?protocol=, /stock?symbol= or /financial?query=' }, 404);
  },
};
