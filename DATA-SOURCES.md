# Data sources

Every figure this miner serves is a live read at request time. This file records, per source,
what it provides, what its own terms say about commercial use and redistribution, what credit it
requires and what its real rate limit is.

Two rules were followed in writing it. A licence is only recorded when the provider's own terms
page was read; where a page could not be read, that is stated as unverified rather than guessed.
And every source was called from a Cloudflare Worker before it went in, because several hosts
answer differently from a worker than from a laptop.

| Host | Provides | Licence | Commercial use | Attribution | Rate limit |
| --- | --- | --- | --- | --- | --- |
| arb1.arbitrum.io (Chainlink equity feeds) | Share prices for AAPL, AMZN, COIN, GOOGL, META, MSFT, NVDA, SPY and TSLA | None applies: the value is public smart-contract state on a public chain. | Not restricted. Reading chain state is reading the chain. | Not required. The feed address and network are published in every answer. | No quota. One eth_call per uncached symbol, memoised for ten seconds. |
| api.kraken.com | Crypto last trade, 24 hour volume and the day's open | No stated licence for the market data. | Not addressed by the published API terms, which state no restriction on the public market-data endpoints. | Not stated as required. The source is named in every answer. | No published figure for the public endpoints. One call per uncached asset, memoised for ten seconds. |
| www.bitstamp.net | Crypto last trade and 24 hour volume, first fallback | Commercial reuse granted by the API terms. | Permitted in those words. The terms direct volume users to sign a data licence agreement. | Not stated as required. The source is named in every answer. | "As standard, all clients can make 400 requests per second" with "a default limit threshold of 10,000 requests per 10 minutes". |
| api.gemini.com | Crypto last trade, second fallback | No stated licence for the market data. | Not addressed by the published API documentation. | Not stated as required. The source is named in every answer. | No published figure for the public ticker. Called only when the two preferred sources fail. |
| api.frankfurter.dev | Fiat exchange rates (European Central Bank reference rates) | MIT for the software. The rates are ECB reference rates. | Permitted in those words. | Not required. The source is named in every answer. | "There are no quotas. Requests are rate-limited to prevent abuse, but there are no monthly or daily caps." |
| stooq.com | Stock quotes | No stated licence. | Blocked. Serving a Stooq close price to the network is redistribution. | Not applicable while the source is unusable. | No figure published. |
| query1.finance.yahoo.com | Stock quotes, fallback | No stated licence. | Barred. | Not applicable while the source is unusable. | No published figure. Returns 429 from a Cloudflare edge IP in any case. |
| api.llama.fi | Total value locked for a protocol or chain | No stated licence. | Barred on the free tier. | Not applicable while the source is unusable. | Published only as a general limit. |

## Per source

### arb1.arbitrum.io (Chainlink equity feeds)

Share prices for AAPL, AMZN, COIN, GOOGL, META, MSFT, NVDA, SPY and TSLA.

What the terms say: Chainlink's own feed directory lists each as assetClass "Equity", marketHours "NYSE", decimals 8. There is no API and no terms of service between a reader and the data: an eth_call against the aggregator returns the same word any node returns.

Commercial use: Not restricted. Reading chain state is reading the chain.

Attribution: Not required. The feed address and network are published in every answer.

Rate limit: No quota. One eth_call per uncached symbol, memoised for ten seconds.

This replaced the STOCK_PRICE gap. Every keyless quote API is a blocker (see the stooq and Yahoo entries below), and a Chainlink feed is not an API: it is chain state. Two honesty consequences are carried in the answer rather than hidden: the feeds update on NYSE hours, so the answer states how old the reading is whenever it is over three hours, and the value is a Chainlink reference price rather than a venue's last trade, which `source` says. An earlier note in the worker claimed the AAPL feed read 7.42 rather than a share price; that was a decoding error, reading the roundId word instead of the answer word out of latestRoundData.

### api.kraken.com

Crypto last trade, 24 hour volume and the day's open.

Commercial use: Not addressed by the published API terms, which state no restriction on the public market-data endpoints.

Attribution: Not stated as required. The source is named in every answer.

Credit line published in every answer:

    Market data from the Kraken public ticker.

Rate limit: No published figure for the public endpoints. One call per uncached asset, memoised for ten seconds.

Preferred because one read gives the price, the volume and the day change.

### www.bitstamp.net

Crypto last trade and 24 hour volume, first fallback.

What the terms say: "Bitstamp allows the incorporation and redistribution of our exchange data for commercial purposes."

Commercial use: Permitted in those words. The terms direct volume users to sign a data licence agreement.

Attribution: Not stated as required. The source is named in every answer.

Credit line published in every answer:

    Market data from the Bitstamp public ticker.

Rate limit: "As standard, all clients can make 400 requests per second" with "a default limit threshold of 10,000 requests per 10 minutes".

Open item: the terms invite a signed Data License Agreement for commercial use at volume.

### api.gemini.com

Crypto last trade, second fallback.

Commercial use: Not addressed by the published API documentation.

Attribution: Not stated as required. The source is named in every answer.

Credit line published in every answer:

    Market data from the Gemini public ticker.

Rate limit: No published figure for the public ticker. Called only when the two preferred sources fail.

### api.frankfurter.dev

Fiat exchange rates (European Central Bank reference rates).

What the terms say: "Yes, absolutely. See each provider's terms for details on the underlying data." (on commercial use)

Commercial use: Permitted in those words.

Attribution: Not required. The source is named in every answer.

Credit line published in every answer:

    Exchange rates from Frankfurter, sourced from European Central Bank reference rates.

Rate limit: "There are no quotas. Requests are rate-limited to prevent abuse, but there are no monthly or daily caps."

This replaced open.er-api.com, whose terms bar its data from "any product or service that offers programmatic or automatic access to exchange rate data", which is what a miner is. A reference rate is a daily fixing, so the answer dates it to the ECB publication day rather than implying a live tick.

### stooq.com

Stock quotes.

What the terms say: "Redistribution of data found on the website is not allowed without the consent of Stooq."

Commercial use: Blocked. Serving a Stooq close price to the network is redistribution.

Attribution: Not applicable while the source is unusable.

Rate limit: No figure published.

Never called. Section 5.3 bars redistribution without consent, so this source is a blocker rather than a compliant one. STOCK_PRICE is now served from Chainlink's on-chain equity reference feeds instead, which carry no data licence at all, so this is recorded as checked and rejected rather than as an open item.

### query1.finance.yahoo.com

Stock quotes, fallback.

What the terms say: Reuse "for any commercial purpose" is barred, as is automated collection "using any automated means, devices, programs, algorithms or methodologies, including but not limited to robots, spiders, scrapers".

Commercial use: Barred.

Attribution: Not applicable while the source is unusable.

Rate limit: No published figure. Returns 429 from a Cloudflare edge IP in any case.

Never called, and no longer named as a fallback anywhere in the worker. Recorded so the rejection is auditable.

### api.llama.fi

Total value locked for a protocol or chain.

What the terms say: A licence "to access and use the Site for personal, non-commercial purposes", and clause 8 forbids "republish the data in any form without permission".

Commercial use: Barred on the free tier.

Attribution: Not applicable while the source is unusable.

Rate limit: Published only as a general limit.

OPEN ITEM. DeFiLlama is the only keyless source of protocol TVL we found, and its terms bar both the commercial use and the republication. The swap paths are a DeFiLlama Pro licence or reading each protocol's own contracts, which is a much larger build.

## Compliance

Met:

- api.kraken.com: the required credit line travels in every answer and in NOTICE.
- www.bitstamp.net: the required credit line travels in every answer and in NOTICE.
- api.gemini.com: the required credit line travels in every answer and in NOTICE.
- api.frankfurter.dev: the required credit line travels in every answer and in NOTICE.

Open, stated rather than hidden:

- api.llama.fi: OPEN ITEM. DeFiLlama is the only keyless source of protocol TVL we found, and its terms bar both the commercial use and the republication. The swap paths are a DeFiLlama Pro licence or reading each protocol's own contracts, which is a much larger build.
