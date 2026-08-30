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
| api.kraken.com | Crypto last trade, 24 hour volume and the day's open | No stated licence for the market data. | Not addressed by the published API terms, which state no restriction on the public market-data endpoints. | Not stated as required. The source is named in every answer. | No published figure for the public endpoints. One call per uncached asset, memoised for ten seconds. |
| www.bitstamp.net | Crypto last trade and 24 hour volume, first fallback | Commercial reuse granted by the API terms. | Permitted in those words. The terms direct volume users to sign a data licence agreement. | Not stated as required. The source is named in every answer. | "As standard, all clients can make 400 requests per second" with "a default limit threshold of 10,000 requests per 10 minutes". |
| api.gemini.com | Crypto last trade, second fallback | No stated licence for the market data. | Not addressed by the published API documentation. | Not stated as required. The source is named in every answer. | No published figure for the public ticker. Called only when the two preferred sources fail. |
| api.frankfurter.dev | Fiat exchange rates (European Central Bank reference rates) | MIT for the software. The rates are ECB reference rates. | Permitted in those words. | Not required. The source is named in every answer. | "There are no quotas. Requests are rate-limited to prevent abuse, but there are no monthly or daily caps." |
| stooq.com | Stock quotes | No stated licence. | Blocked. Serving a Stooq close price to the network is redistribution. | Not applicable while the source is unusable. | No figure published. |
| query1.finance.yahoo.com | Stock quotes, fallback | No stated licence. | Barred. | Not applicable while the source is unusable. | No published figure. Returns 429 from a Cloudflare edge IP in any case. |
| api.llama.fi | Total value locked for a protocol or chain | No stated licence. | Barred on the free tier. | Not applicable while the source is unusable. | Published only as a general limit. |

## Per source

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

OPEN ITEM. Section 5.3 bars redistribution without consent, so this source is a blocker for STOCK_PRICE rather than a compliant source. The clause names the remedy: written consent from Stooq (www@stooq.com). Until that exists STOCK_PRICE has no licensed source, and the miner states its figure with the source named so a reader can see exactly what is being relied on.

### query1.finance.yahoo.com

Stock quotes, fallback.

What the terms say: Reuse "for any commercial purpose" is barred, as is automated collection "using any automated means, devices, programs, algorithms or methodologies, including but not limited to robots, spiders, scrapers".

Commercial use: Barred.

Attribution: Not applicable while the source is unusable.

Rate limit: No published figure. Returns 429 from a Cloudflare edge IP in any case.

OPEN ITEM, same as Stooq. Recorded here because the code still names it as a fallback.

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

- stooq.com: OPEN ITEM. Section 5.3 bars redistribution without consent, so this source is a blocker for STOCK_PRICE rather than a compliant source. The clause names the remedy: written consent from Stooq (www@stooq.com). Until that exists STOCK_PRICE has no licensed source, and the miner states its figure with the source named so a reader can see exactly what is being relied on.
- query1.finance.yahoo.com: OPEN ITEM, same as Stooq. Recorded here because the code still names it as a fallback.
- api.llama.fi: OPEN ITEM. DeFiLlama is the only keyless source of protocol TVL we found, and its terms bar both the commercial use and the republication. The swap paths are a DeFiLlama Pro licence or reading each protocol's own contracts, which is a much larger build.
