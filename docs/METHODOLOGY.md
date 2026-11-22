# DataReceipt — Methodology

DataReceipt answers one question for every company: **how much of its revenue depends on tracking people across other websites — and what share of that comes from your browsing?**

Nobody can measure this directly: the extension sees tracker requests, not money, and no company publishes revenue per user or per page. DataReceipt therefore shows an **order-of-magnitude estimate, not a measurement**. This document lists every input, its source, and where the model is weak. Corrections with better sources are welcome — please open an issue.

_Last updated: 2026-11-22 · Implementation: [`src/js/tracker-config.js`](../src/js/tracker-config.js)_

---

## 1. The model

```
value per page = Σ(revenue × tracking dependence) ÷ (internet users × page views per user per year × reach)
                 × regional factor
```

- **revenue × tracking dependence** — the part of a company's yearly revenue that depends on cross-site tracking: the revenue it would lose without it.
- **internet users × page views per user per year × reach** — the number of page views worldwide on which the company's trackers appear. Tracking-dependent revenue is spread over exactly these pages.

**Yearly total:** for a hypothetical average user whose browsing matches the reach assumptions, the yearly total is `Σ(revenue × tracking dependence) ÷ internet users × regional factor`. Reach and page views then only decide how that amount is split across pages. For a real user, the total also depends on how often they actually meet each tracker.

**Counting rules:**
- Each company is counted at most once per page load.
- Only third-party requests count — a site loading its own resources is not "tracking you".
- Requests blocked by an ad blocker or the browser are not counted (counting happens when a request is actually sent).
- Analytics, measurement and verification tools (Hotjar, Mixpanel, Amplitude, Segment, HubSpot, Tealium, WordPress Stats, DoubleVerify, comScore) collect data but earn no advertising revenue from it. They are detected but valued at 0 and not shown.

---

## 2. Inputs

### 2.1 Tracking dependence — one concept for all companies

"Tracking dependence" is the share of revenue that would be lost if the company could no longer track people across other websites. Three categories:

| Category | Dependence | Range | Evidence |
|---|---:|---|---|
| **Ads on other websites** (Google Network, Criteo, The Trade Desk, Taboola, Teads, other ad tech) | ~50% | 30–70% | Google (2019): publisher revenue fell 52% when third-party cookies were disabled. UK CMA (2020): UK publishers earned ~70% less without personalised ads. UK CMA (2025): ~30% lower revenue per impression without third-party cookies even with Privacy Sandbox. |
| **Search ads** (Google Search, Microsoft Bing, Amazon's ads, which are mostly sponsored results in Amazon search) | ~5% | 0–10% | UK CMA (2025), footnote 70: Google's tests showed a [0–10%] impact on Google Search without third-party cookies, against 11–14% for Google's open-display buying tools. |
| **Social and app platforms** (Meta, YouTube, TikTok, Snap, Pinterest, Reddit, X) | ~9% | 3–15% | **Proxy:** Meta's estimate that Apple's tracking changes would cost it "on the order of $10 billion" in 2022 (CFO, Q4 2021 earnings call) ÷ 2022 ad revenue $113.6B = 8.8% (8.1% of the counterfactual). This covers app *and* web signal loss on iOS and was a forecast. A Meta field experiment (Wernerfelt et al., *Marketing Science* 2025, >70,000 advertisers) found losing offsite data raises the cost per incremental customer by 31%. No other platform discloses a figure; the proxy is transferred to them as an assumption. |

### 2.2 Revenue (latest fiscal year)

| Company | Revenue stream | Amount | Category |
|---|---|---:|---|
| Google | Google Network, Google's share after partner payouts (29.2%; Network TAC rate 70.8%, **last disclosed FY2018**) | $29,792M × 29.2% | ads on other websites |
| | Google Search & other | $224,532M | search |
| | YouTube ads | $40,367M | platform |
| Meta | Advertising | $196,175M | platform |
| Amazon | Advertising services | $68,635M | search |
| Microsoft | Search advertising (fiscal year to June 2025) | $13,878M | search |
| Reddit | Advertising | $2,062M | platform |
| Pinterest | Revenue | $4,222M | platform |
| Snap | Advertising | $5,186M | platform |
| TikTok | Ad revenue — **forecast** (WARC, March 2025; private company) | ~$32.4B | platform |
| X | Ad revenue — **forecast** (eMarketer, March 2025; private company) | ~$2.26B | platform |
| Criteo | Contribution ex-TAC, Performance Media (Retail Media $259.7M on retailers' own sites excluded) | $914.9M | ads on other websites |
| The Trade Desk | Revenue (its fee on $13.4B gross spend) × **25% web share** (assumption; Q4 2025: video incl. CTV ~50%, mobile ~30%, display "low double-digit", audio ~6%) | $2,896M × 25% | ads on other websites |
| Taboola | ex-TAC gross profit | $713.5M | ads on other websites |
| Teads (formerly Outbrain) | ex-TAC gross profit (legacy Teads included from 3 Feb 2025) | $529.7M | ads on other websites |
| LinkedIn, SSPs, other ad tech | no usable figure (Microsoft does not disclose LinkedIn ad revenue) | — | fallback: median per-page value of Criteo, The Trade Desk, Taboola, Teads |

### 2.3 Denominator

| Input | Value | Source | Range |
|---|---:|---|---|
| Internet users | 6,068M | ITU Facts and Figures, 2025 | 5,871M–6,304M |
| Page views per user per year | 9,800 (~27/day) | Estimate: Similarweb measures ~3T page loads/month on the top 10k domains (via DataReportal, Oct 2026); DataReportal estimates these are ~60% of web traffic, citing a 2024 study | 5,900–12,600 |
| Reach | see below | Judgement between WhoTracksMe (Ghostery, Oct 2026, page-load weighted, lower bound), HTTP Archive Web Almanac 2025 and DuckDuckGo Tracker Radar (site counts, upper bound), for the domains the extension detects | 2–10× per company |

Reach used (share of all page views; floor 1% so tiny, uncertain values don't dominate):

| Company | Reach | Company | Reach |
|---|---:|---|---:|
| Google (any detected tracker) | 50% | Criteo | 2% |
| Meta | 10% | The Trade Desk, Teads, X | 1.5% |
| Amazon, Microsoft | 5% | Taboola | 1.3% |
| TikTok | 1.2% | Reddit, Pinterest, Snap | 1% (floor; Snap estimated 0.3%) |

### 2.4 Regional factor

Revenue per internet user relative to the worldwide average, from the browser's time zone (no location access).

| Region | Factor | Basis |
|---|---:|---|
| US & Canada | 5 | Meta 2023 ARPU ratio 5.09 (by user location). Alphabet FY2025 revenue ÷ ITU users gives 9.0 for the US, but by advertiser billing address, which overstates it. |
| Europe (incl. Russia, Turkey) | 1.7 | Meta 1.69. Alphabet EMEA 1.05 includes Africa and the Middle East. |
| Asia-Pacific | 0.4 | Alphabet ~0.3, Meta 0.45 |
| Latin America | 0.5 | Alphabet "Other Americas" 0.62 (includes Canada), Meta Rest of World 0.35 |
| Africa / Middle East | 0.35 | Meta Rest of World |
| Worldwide average | 1 | UTC, unknown zones, and high-income zones without regional data (Japan, Korea, Australia, New Zealand, Singapore, Hong Kong, Taiwan, Israel, Gulf states) |

---

## 3. Results

### Per year (average user)

| | Low | **Central** | High |
|---|---:|---:|---:|
| Worldwide | $1.9 | **$7.7** | $13.6 |
| Europe | €1.8 | **€12** | €23 |
| US & Canada | $8 | **$38** | $123 |

The low and high cases vary all three dependence categories, Google's retained share (25–35%), The Trade Desk's web share (12–40%) and the regional factor (Europe 1.05–1.8, US 4–9). They do not vary user count, the TikTok/X forecasts or the fallback.

Central contribution per average user and year (worldwide, USD): Google 3.17 (of which Search 1.85, YouTube 0.60, Network 0.72), Meta 2.91, Amazon 0.57, TikTok 0.48, Microsoft 0.11, Snap 0.08, Criteo 0.08, Pinterest, The Trade Desk and Taboola 0.06 each, Teads 0.04, X and Reddit 0.03 each.

### Per page (base values in USD, before the regional factor)

| Company | USD / page | Company | USD / page |
|---|---:|---|---:|
| TikTok | 0.0041 | Criteo | 0.00038 |
| Meta | 0.0030 | Reddit | 0.00031 |
| Amazon | 0.0012 | Teads | 0.00030 |
| Snap | 0.00078 | Microsoft | 0.00023 |
| Google | 0.00065 | X | 0.00023 |
| Pinterest | 0.00064 | Other ad tech / LinkedIn | 0.00040 |
| Taboola | 0.00046 | Analytics & verification tools | 0 |
| The Trade Desk | 0.00041 | | |

Examples for a user in Europe: an ad-heavy news page ≈ €0.011; a page with Google Analytics and a Meta pixel ≈ €0.006.

TikTok ranks first per page because a large (forecast) revenue is spread over few pages — TikTok's pixel is rare. This ranking is driven by the least certain inputs (see Limitations).

---

## 4. Plausibility check

| Benchmark | Value | Model |
|---|---|---|
| Open-web programmatic market | ~$123B worldwide in 2025 (ANA Q3 2025: their doubling of a $52B US estimate; includes CTV ≈ 46% of spend, out-of-home and audio) → web display roughly $60B ≈ $10 per internet user gross | Open-web ad tech in the model: **$0.95 per user and year** (tracking-dependent part of five companies' net revenue). Lower by design — the model counts only intermediaries' net revenue and only the part that depends on tracking, and covers five companies. |
| Publisher revenue per 1,000 page views | US: ~$20–25 total, $6–10 programmatic (Lenfest Institute, 2019) | Open-web intermediaries on an ad-heavy news page: ~$3.7 per 1,000 views in Europe, ~$11 in the US. **Likely overstated** on such pages — per-page values depend on the uncertain reach estimates. |
| Google's retained share of Network revenue | 29.2% (FY2018 disclosure) | In line with the UK CMA (2020): intermediaries "capture, on average, at least 35% of the value of advertising bought through the open display channel". |

The yearly totals are in a plausible order of magnitude; per-page values on ad-heavy pages are probably too high.

---

## 5. Limitations

1. **Per-page values are much less certain than yearly totals.** They depend on reach, and reach sources disagree by 2–10× per company. WhoTracksMe page-load reach fell sharply after 2024, probably partly a measurement artifact. Rare trackers (TikTok, Snap) rank high per page.
2. **Tracking dependence is evidenced only indirectly.** The open-web figure comes from cookie experiments on publisher revenue; the search figure from Google's own tests reported by the CMA; the platform figure is a proxy from Meta's iOS estimate, transferred to other platforms.
3. **Google's retained share** relies on the Network TAC rate last disclosed for 2018. Google Network also includes in-app ads (AdMob), which the model treats as web.
4. **TikTok and X** are private; their figures are third-party forecasts. LinkedIn's ad revenue is not disclosed.
5. **Regional factors** mix two imperfect sources (Alphabet revenue by billing address; Meta ARPU last published for 2023). Time zone is a rough proxy, and VPNs or travel distort it.
6. **The average is a mean.** The median user is well below it; heavy users of ad-funded sites well above.
7. **Consent:** if a site loads a tracker but the user declined consent, the request is still counted — the extension cannot see what the tracker does with the data.
8. **Detection covers ~60 domains.** Many smaller ad-tech companies and first-party tracking (server-side tag managers, CNAME cloaking) are not detected. Single-page apps are counted on the first load only.
9. **Equal value per page:** a page with an ad impression counts the same as one that only loads analytics for that company. The model allocates yearly revenue; it does not measure individual auctions.
10. **Users:** ITU's count includes ~1.1B users in China, where most of these companies don't operate. Exchange rates are fixed (2024).

---

## 6. Sources

**Company filings and releases**
- Alphabet 10-K 2025: https://s206.q4cdn.com/479360582/files/doc_financials/2025/q4/GOOG-10-K-2025.pdf
- Alphabet 10-K 2018 (Network TAC rate 70.8%): https://www.sec.gov/Archives/edgar/data/1652044/000165204419000004/goog10-kq42018.htm
- Meta Q4 2025 earnings release: https://s21.q4cdn.com/399680738/files/doc_financials/2025/q4/Meta-12-31-2025-Exhibit-99-1-FINAL.pdf
- Meta Q4 2021 earnings call (iOS impact ~$10B): https://s21.q4cdn.com/399680738/files/doc_financials/2021/q4/Meta-Q4-2021-Earnings-Call-Transcript.pdf
- Meta 10-K 2023 (regional ARPU): https://s21.q4cdn.com/399680738/files/doc_financials/2023/ar/Meta-12-31-2023-10K-ARS.pdf
- Amazon 10-K 2025: https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/
- Microsoft 10-K FY2026 (incl. FY2025 comparatives): https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/
- The Trade Desk Q4 2025 release: https://www.sec.gov/Archives/edgar/data/1671933/000167193326000009/ttd-20260225x8kexx991.htm
- The Trade Desk Q4 2025 prepared remarks: https://s205.q4cdn.com/467402606/files/doc_earnings/2025/q4/transcript/The-Trade-Desk-Fourth-Quarter-2025-Conference-Call-Prepared-Remarks.pdf
- Criteo Q4 2025 release: https://www.sec.gov/Archives/edgar/data/1576427/000157642726000004/exhibit991q42025.htm
- Taboola Q4 2025 release: https://www.sec.gov/Archives/edgar/data/1840502/000114036126006649/ef20064253_ex99-1.htm
- Teads Q4 2025 release: https://www.sec.gov/Archives/edgar/data/1454938/000145493826000007/q42025er-exhibit991.htm
- Reddit 10-K 2025: https://www.sec.gov/Archives/edgar/data/1713445/000171344526000022/
- Pinterest Q4 2025 release: https://www.sec.gov/Archives/edgar/data/1506293/000150629326000019/q4-25xpressrelease.htm
- Snap 10-K 2025: https://www.sec.gov/Archives/edgar/data/1564408/000156440826000013/

**Studies and regulators**
- Google (2019), Effect of disabling third-party cookies on publisher revenue: https://services.google.com/fh/files/misc/disabling_third-party_cookies_publisher_revenue.pdf
- UK CMA, Online platforms and digital advertising, final report (2020): https://assets.publishing.service.gov.uk/media/5efc57ed3a6f4023d242ed56/Final_report_1_July_2020_.pdf
- UK CMA, Summary of testing of Google Privacy Sandbox proposals (2025): https://assets.publishing.service.gov.uk/media/684bee68df3ce2ce31e3f948/Summary_of_testing_of_Google_Privacy_Sandbox_proposals.pdf
- Wernerfelt, Tuchman, Shapiro, Moakler (2025): Estimating the Value of Offsite Tracking Data to Advertisers. *Marketing Science* 44(2); NBER WP 32765
- ANA Programmatic Transparency Benchmark Q3 2025: https://s3.amazonaws.com/media.mediapost.com/uploads/Q32025ProgrammaticTransparencyBenchmark.pdf
- Lenfest Institute (2019), unit economics of digital news: https://www.lenfestinstitute.org/solutions-resources/one-subscriber-or-48000-page-views-why-journalists-should-know-the-unit-economics-of-digital-news/

**Users, browsing and reach**
- ITU Facts and Figures (2025/2026): https://www.itu.int/itu-d/reports/statistics/facts-figures-2026/
- DataReportal, Digital 2027 (Similarweb data): https://datareportal.com/reports/digital-2027-the-steady-decline-of-the-web
- WhoTracksMe (Ghostery), data CC BY 4.0: https://github.com/whotracksme/whotracks.me
- HTTP Archive Web Almanac 2025: https://almanac.httparchive.org/en/2025/privacy
- DuckDuckGo Tracker Radar: https://github.com/duckduckgo/tracker-radar
- TikTok forecast (WARC, 2025) and X forecast (eMarketer, 2025): third-party estimates as reported by Marketing Dive / MediaPost and Reuters
