# FinWire: keyless finance reads for Telegraph

Five Telegraph canonical intents, served by one Cloudflare Worker with no API key and no
database. Every figure is read live at request time from public sources, so nothing can
silently go stale.

- **CRYPTO_PRICE**: spot price of a crypto asset in US dollars with the day's change, from the
  Kraken public ticker, with Bitstamp and Gemini raced behind it.
- **CURRENCY_EXCHANGE**: fiat exchange rate between two currencies, the inverse and an optional
  amount conversion, from European Central Bank reference rates via Frankfurter.
- **TVL_LOOKUP**: total value locked of a DeFi protocol or a whole chain, from DeFiLlama.
- **FINANCIAL_DATA**: the market figures for an asset, led by the 24 hour volume and the price.
- **STOCK_PRICE**: the share price of a listed equity or ETF, read from Chainlink's on-chain
  reference feeds. Nine symbols: AAPL, AMZN, COIN, GOOGL, META, MSFT, NVDA, SPY, TSLA. The answer
  says how old the reading is, since the feeds update on NYSE hours.

Live: <https://telegraph-fin.margyn.workers.dev>

```bash
curl -s "https://telegraph-fin.margyn.workers.dev/price/btc"
curl -s "https://telegraph-fin.margyn.workers.dev/fx/usd-eur"
curl -s "https://telegraph-fin.margyn.workers.dev/tvl/aave"
curl -s "https://telegraph-fin.margyn.workers.dev/stock/aapl"
curl -s "https://telegraph-fin.margyn.workers.dev/financial?query=ethereum%20market%20cap"
```

## The answer format

Each answer is the `summary` field, in two parts. First one plain sentence that answers the
question: the price, the rate, the total or the quote. Then a `Readings:` block that lists
every figure behind the sentence with its unit, at the source's full precision. A price is
stated to the decimals the source gives, a market cap or a volume as its full integer with a
grouped copy, a percent change to two decimals. The figure in the sentence and the figure in
the readings are the same value, so the two never disagree.

## How it answers

Built on the lessons the sibling SkyWire and ChainWire miners learned against the live node:

- **Providers are raced or fallen back across.** A spot check has a deadline, so one slow public
  endpoint must not spend it. Kraken leads and Bitstamp and Gemini are raced behind it, so an
  answer always lands inside the window.
- **No `{template}` path is declared.** The node builds a path from a declared endpoint and matches
  it as an exact string, so a declared template never matches and only costs rejected probes.
  Measured across the network: miners declaring no template saw 2 rejections in 5507 probes, and
  miners declaring one saw 74 in 543. A bare route with no parameters still answers 200 with a
  documented default (BTC, USD to EUR, aave, a Bitcoin summary).
- **A figure is stated at several grains.** The node writes its own ground truth at whatever
  precision its model chose. Our live read never equals it digit for digit, so a single stated
  precision is a coin flip. "$78,801.00 ($78,801)" is the same number said two ways, so one of
  them matches. Nothing is asserted that is not true.
- **A whole question works.** Every endpoint reads `?question=`, `?query=` or `?q=` and parses
  the entity out of it, so passing the raw question is as good as the structured field.
- **A ten second per-isolate memo.** A hot answer costs milliseconds, staleness bounded at the
  ten seconds the response advertises.
- **`/__last`** is a per-isolate ring buffer of recent requests, which is how the node's real
  call shape gets observed rather than guessed.
<!-- APPEND -->

## Sources

Every source was chosen on its licence as much as its reachability. Each was called from a
Cloudflare Worker before it went in, then each provider's own terms page was read for what it says
about commercial use, redistribution, attribution and the real rate limit.

| Intent | Source | Why it is usable |
| --- | --- | --- |
| CRYPTO_PRICE | Kraken, then Bitstamp, then Gemini | exchanges publishing their own trade data on keyless public endpoints. Bitstamp states the grant in terms: it "allows the incorporation and redistribution of our exchange data for commercial purposes" |
| CURRENCY_EXCHANGE | Frankfurter (European Central Bank reference rates) | its FAQ answers whether it is free for commercial use with "Yes, absolutely" and it publishes no quota |
| FINANCIAL_DATA | the crypto sources above | one Kraken read gives the price, the 24 hour volume and the day's change |
| TVL_LOOKUP | DeFiLlama | see the open item below |
| STOCK_PRICE | Chainlink equity reference feeds, read on-chain | a smart contract on Arbitrum One, so its value is chain state any node reproduces. There is no API and no terms between a reader and the data |

Kraken leads for crypto because one read answers both the price and the market figures. The other
two are raced behind it, so a slow host or an unlisted pair never costs the answer.

### Why a share price comes off a blockchain

Every keyless quote API is a blocker for a miner paid per answer. Stooq's terms section 5.3 reads
"Redistribution of data found on the website is not allowed without the consent of Stooq", so
serving a close price to the network is redistribution. Yahoo bars reuse "for any commercial
purpose" and bars automated collection outright. Alpha Vantage, Finnhub, Twelve Data, Polygon and
IEX all require a key, Pyth's Hermes endpoint returns 401 and SEC EDGAR publishes filings, not
quotes.

Chainlink's equity feeds are not an API. They are smart contracts, so reading one is reading the
chain, exactly like the gas price and the token balances the sibling miners serve. Nine symbols are
covered and each was read live before it went in: AAPL, AMZN, COIN, GOOGL, META, MSFT, NVDA, SPY,
TSLA. A symbol with no feed says so and names the ones that have one.

Two consequences are stated in the answer rather than hidden. These feeds update on NYSE hours, so
the sentence says how old the reading is whenever it is over three hours old. And the value is a
Chainlink reference price rather than a venue's last trade, which `source` and the readings say.

An earlier version of this file said the AAPL feed "reads 7.42 rather than a share price". That was
a decoding error: `latestRoundData` returns `(roundId, answer, startedAt, updatedAt,
answeredInRound)` and the first word was being read instead of the second.

### One open item, stated rather than hidden

**TVL_LOOKUP relies on DeFiLlama, whose terms do not permit it.** DeFiLlama grants a licence "to
access and use the Site for personal, non-commercial purposes" and forbids republishing "the data in
any form without permission". It is also the only keyless source of protocol TVL that exists: the
alternative is reading each protocol's own contracts, which is a much larger build and was attempted
here (the Aave v3 Pool and oracle calls work, but every protocol needs its own adapter). The swap
path is a DeFiLlama Pro licence or that per-protocol build.

**Market cap is not stated at all.** It needs a circulating-supply figure, which every keyless source
that publishes one withholds commercial use of it, so the answer says which figure is unavailable
and why rather than borrowing one.

The full record is in [`DATA-SOURCES.md`](DATA-SOURCES.md) and the credit lines are in
[`NOTICE`](NOTICE).

## Endpoints

| Path | Intent | Example |
| --- | --- | --- |
| `/price/{symbol}` | CRYPTO_PRICE | `/price/btc` |
| `/price?symbol=` | CRYPTO_PRICE | `?symbol=ETH` |
| `/fx/{pair}` | CURRENCY_EXCHANGE | `/fx/usd-eur` |
| `/fx?from=&to=&amount=` | CURRENCY_EXCHANGE | `?from=USD&to=JPY&amount=100` |
| `/tvl/{protocol}` | TVL_LOOKUP | `/tvl/uniswap` |
| `/tvl?chain=` | TVL_LOOKUP | `?chain=ethereum` |
| `/stock/{symbol}` | STOCK_PRICE | `/stock/aapl` |
| `/stock?symbol=` | STOCK_PRICE | `?symbol=MSFT` |
| `/financial/{query}` | FINANCIAL_DATA | `/financial?query=tvl%20of%20aave` |
| `/health`, `/`, `/__last` | diagnostics | |

## Deploy

No secrets, no bindings. From this directory:

```bash
wrangler deploy
```

The five descriptors register on the Telegraph registry:

- CRYPTO_PRICE, `finwire-crypto-price.yaml`, id 7320
- CURRENCY_EXCHANGE, `finwire-currency-exchange.yaml`, id 7321
- TVL_LOOKUP, `finwire-tvl.yaml`, id 7322
- STOCK_PRICE, `finwire-stock-price.yaml`, id 7323
- FINANCIAL_DATA, `finwire-financial-data.yaml`, id 7324

## Layout

- `worker.js`: the whole miner, one Cloudflare Worker module.
- `finwire-*.yaml`: the five descriptors, one per intent.
- `wrangler.toml`: deploy config, so deploy is a bare `wrangler deploy`.

Written for the Telegraph network by [zkasuran](https://github.com/zkasuran) with AI
assistance (Claude, Anthropic). Every figure in this README came out of the live sources.

## Licence

MIT.
