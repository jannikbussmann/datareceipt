// ---------------------------------------------------------------------------
// Tracker detection
// ---------------------------------------------------------------------------
// Requests are matched on the hostname (exact host or subdomain of a listed
// domain), never by substring of the full URL. Only third-party requests count:
// a site loading its own resources is not "tracking you".

// [domain, entity] — matches the domain itself and every subdomain.
const TRACKER_DOMAINS = [
  // Google
  ["doubleclick.net", "google"],
  ["googlesyndication.com", "google"],
  ["googleadservices.com", "google"],
  ["googletagservices.com", "google"],
  ["google-analytics.com", "google"],
  ["googletagmanager.com", "google"],
  ["adservice.google.com", "google"],
  ["imasdk.googleapis.com", "google"],
  // Meta
  ["connect.facebook.net", "meta"],
  // Amazon
  ["amazon-adsystem.com", "amazon"],
  ["assoc-amazon.com", "amazon"],
  ["assoc-amazon.de", "amazon"],
  ["assoc-amazon.co.uk", "amazon"],
  // Microsoft (incl. Xandr)
  ["clarity.ms", "microsoft"],
  ["bat.bing.com", "microsoft"],
  ["adnxs.com", "microsoft"],
  // TikTok
  ["analytics.tiktok.com", "tiktok"],
  ["analytics-sg.tiktok.com", "tiktok"],
  // LinkedIn
  ["px.ads.linkedin.com", "linkedin"],
  ["snap.licdn.com", "linkedin"],
  // X
  ["ads-twitter.com", "twitter_x"],
  ["analytics.twitter.com", "twitter_x"],
  ["t.co", "twitter_x"],
  // Reddit
  ["alb.reddit.com", "reddit"],
  ["pixel.reddit.com", "reddit"],
  // Open-web ad tech
  ["criteo.com", "criteo"],
  ["criteo.net", "criteo"],
  ["adsrvr.org", "the_trade_desk"],
  ["taboola.com", "taboola"],
  ["outbrain.com", "teads"],
  ["teads.tv", "teads"],
  // Other trackers — valued with FALLBACK_WEIGHT
  ["pubmatic.com", "pubmatic"],
  ["rubiconproject.com", "magnite"],
  ["casalemedia.com", "index_exchange"],
  ["openx.net", "openx"],
  ["adform.net", "adform"],
  ["smartadserver.com", "equativ"],
  ["ads.yahoo.com", "yahoo"],
  ["analytics.yahoo.com", "yahoo"],
  ["mc.yandex.ru", "yandex"],
  ["mc.yandex.com", "yandex"],
  ["tr.snapchat.com", "snap"],
  ["sc-static.net", "snap"],
  ["ct.pinterest.com", "pinterest"],
  ["scorecardresearch.com", "comscore"],
  ["quantserve.com", "quantcast"],
  ["doubleverify.com", "doubleverify"],
  ["id5-sync.com", "id5"],
  ["api.segment.io", "segment"],
  ["cdn.segment.com", "segment"],
  ["hs-analytics.net", "hubspot"],
  ["track.hubspot.com", "hubspot"],
  ["mixpanel.com", "mixpanel"],
  ["amplitude.com", "amplitude"],
  ["hotjar.com", "hotjar"],
  ["hotjar.io", "hotjar"],
  ["tiqcdn.com", "tealium"],
  ["stats.wp.com", "automattic"],
];

// Tracking endpoints on domains that otherwise serve normal content.
// [host regex, path prefix, entity]
const TRACKER_ENDPOINTS = [
  [/^(www\.)?google\.[a-z.]+$/, "/pagead", "google"],
  [/^(www\.)?google\.[a-z.]+$/, "/ads", "google"],
  [/^(www\.)?facebook\.com$/, "/tr", "meta"],
  [/^(www\.)?redditstatic\.com$/, "/ads", "reddit"],
  [/^s\.pinimg\.com$/, "/ct", "pinterest"],
];

// Two-level public suffixes, enough to find the registrable domain of most
// sites without shipping the full Public Suffix List.
const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "me.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "co.jp",
  "ne.jp",
  "or.jp",
  "com.br",
  "com.mx",
  "com.ar",
  "com.tr",
  "co.in",
  "co.za",
  "co.kr",
  "com.cn",
  "com.hk",
  "com.sg",
  "com.tw",
  "co.il",
  "com.ua",
  "com.pl",
]);

export const getHostname = (url) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

export const getRegistrableDomain = (host) => {
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  return TWO_LEVEL_SUFFIXES.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
};

const matchesDomain = (host, domain) =>
  host === domain || host.endsWith("." + domain);

/** Returns the tracking entity for a request URL, or null if it is not a known tracker. */
export const getTrackerEntity = (url) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  for (const [domain, entity] of TRACKER_DOMAINS) {
    if (matchesDomain(host, domain)) return entity;
  }
  for (const [hostRe, pathPrefix, entity] of TRACKER_ENDPOINTS) {
    const path = parsed.pathname;
    if (
      hostRe.test(host) &&
      (path === pathPrefix || path.startsWith(pathPrefix + "/"))
    )
      return entity;
  }
  return null;
};

/** True if the request goes to a different site than the page it was made from. */
export const isThirdParty = (requestHost, pageHost) =>
  !pageHost ||
  getRegistrableDomain(requestHost) !== getRegistrableDomain(pageHost);

// ---------------------------------------------------------------------------
// Revenue model — full derivation and sources: docs/METHODOLOGY.md
// ---------------------------------------------------------------------------
// Question answered for every company alike: how much of its revenue depends on
// tracking people across other websites? That part is spread over all page
// views on which its trackers appear:
//
//   value per page = Σ(revenue × trackingDependence) ÷ (internet users × page views per user per year × reach)
//
// For an average user whose browsing matches the reach assumptions, the yearly
// total is Σ(revenue × trackingDependence) ÷ internet users. Reach and page
// views only decide how that amount is split across pages.
//
// Each company is counted at most once per page load. Order-of-magnitude
// estimate, not a measurement.

const INTERNET_USERS = 6.0683e9; // ITU Facts and Figures, 2025
const PAGE_VIEWS_PER_USER_YEAR = 9800; // ~27/day, derived from Similarweb data (range 5,900–12,600)
const MIN_REACH = 0.01; // floor, so trackers with tiny, uncertain reach don't dominate per page

// Share of revenue that depends on cross-site tracking (rough, see METHODOLOGY §2.2)
const DEPENDENCE = {
  // Ads on other websites: publisher revenue fell ~52% without cookies (Google
  // 2019 test); UK CMA: ~70% (2020), ~30% with Privacy Sandbox (2025)
  openWeb: 0.5,
  // Search ads: UK CMA 2025 — 0–10% impact on Google Search without cookies
  search: 0.05,
  // Social/app platforms: ~9% proxy — Meta's ~$10B 2022 estimate of the impact
  // of Apple's tracking changes (app and web signals) ÷ $113.6B ad revenue.
  // Transferred to other platforms as an assumption.
  platform: 0.09,
};

// streams: [revenue USD (latest fiscal year), dependence]; reach: share of page views
const ENTITIES = {
  google: {
    reach: 0.5,
    streams: [
      // Alphabet 10-K FY2025: Google Network $29,792M; Google keeps ~29.2% after
      // paying Network partners (TAC rate 70.8%, last disclosed FY2018)
      [29.792e9 * 0.292, DEPENDENCE.openWeb],
      [224.532e9, DEPENDENCE.search], // Google Search & other
      [40.367e9, DEPENDENCE.platform], // YouTube ads
    ],
  },
  meta: { reach: 0.1, streams: [[196.175e9, DEPENDENCE.platform]] }, // advertising FY2025
  amazon: { reach: 0.05, streams: [[68.635e9, DEPENDENCE.search]] }, // advertising services, mostly sponsored ads in Amazon search
  microsoft: { reach: 0.05, streams: [[13.878e9, DEPENDENCE.search]] }, // search advertising FY2025 (to June 2025)
  reddit: { reach: 0.01, streams: [[2.0625e9, DEPENDENCE.platform]] }, // advertising FY2025
  pinterest: { reach: 0.01, streams: [[4.2218e9, DEPENDENCE.platform]] }, // revenue FY2025
  snap: { reach: 0.003, streams: [[5.186e9, DEPENDENCE.platform]] }, // advertising FY2025
  tiktok: { reach: 0.012, streams: [[32.4e9, DEPENDENCE.platform]] }, // private — WARC forecast 2025
  twitter_x: { reach: 0.015, streams: [[2.26e9, DEPENDENCE.platform]] }, // private — eMarketer forecast 2025
  // Criteo FY2025: Contribution ex-TAC, Performance Media $914.9M (retail media excluded)
  criteo: { reach: 0.02, streams: [[0.9149e9, DEPENDENCE.openWeb]] },
  // The Trade Desk FY2025: revenue $2,896M; ~25% assumed web (video incl. CTV ~50%, mobile ~30%)
  the_trade_desk: {
    reach: 0.015,
    streams: [[2.896e9 * 0.25, DEPENDENCE.openWeb]],
  },
  taboola: { reach: 0.013, streams: [[0.7135e9, DEPENDENCE.openWeb]] }, // ex-TAC gross profit FY2025
  teads: { reach: 0.015, streams: [[0.5297e9, DEPENDENCE.openWeb]] }, // ex-TAC gross profit FY2025
};

// Analytics, measurement and verification tools: they collect data but earn no
// advertising revenue from it → valued at 0 (detected, not shown).
const NO_AD_REVENUE = [
  "hotjar",
  "mixpanel",
  "amplitude",
  "segment",
  "hubspot",
  "tealium",
  "automattic",
  "doubleverify",
  "comscore",
];

const weightOf = ({ reach, streams }) =>
  streams.reduce((sum, [revenue, dep]) => sum + revenue * dep, 0) /
  (INTERNET_USERS * PAGE_VIEWS_PER_USER_YEAR * Math.max(reach, MIN_REACH));

export const REVENUE_WEIGHTS = {
  ...Object.fromEntries(
    Object.entries(ENTITIES).map(([name, e]) => [name, weightOf(e)]),
  ),
  ...Object.fromEntries(NO_AD_REVENUE.map((name) => [name, 0])),
};

// Other ad-tech (SSPs, DSPs, LinkedIn, …): median of the open-web ad-tech companies
const openWebWeights = ["criteo", "the_trade_desk", "taboola", "teads"]
  .map((n) => REVENUE_WEIGHTS[n])
  .sort((a, b) => a - b);
export const FALLBACK_WEIGHT = (openWebWeights[1] + openWebWeights[2]) / 2;

/** Yearly tracking-dependent revenue per average internet user (USD), for docs and tests. */
export const YEARLY_PER_USER = Object.values(ENTITIES).reduce(
  (sum, e) =>
    sum + e.streams.reduce((s2, [r, d]) => s2 + r * d, 0) / INTERNET_USERS,
  0,
);

export const getBaseWeight = (entity) =>
  REVENUE_WEIGHTS[entity] ?? FALLBACK_WEIGHT;

// ---------------------------------------------------------------------------
// Regional factor
// ---------------------------------------------------------------------------
// Revenue per internet user relative to the worldwide average. Central values
// between Alphabet's FY2025 revenue by geography ÷ ITU internet users and Meta's
// last published regional ARPU (2023). The region comes from the browser's
// time zone — no location access. Unknown zones and UTC use 1.0.

const REGION_FACTORS = {
  usca: 5, // Meta US & Canada 5.09 (by user location); Alphabet US 9.0 is by advertiser billing address and overstated
  europe: 1.7, // Meta Europe 1.69 (incl. Russia, Turkey); Alphabet EMEA 1.05 (incl. Africa/Middle East)
  apac: 0.4, // Alphabet ~0.3, Meta 0.45
  latam: 0.5, // Alphabet Other Americas 0.62 (incl. Canada), Meta Rest of World 0.35
  africa_me: 0.35, // Meta Rest of World 0.35
  world: 1, // no regional data (UTC, unknown, high-income Asia-Pacific & Gulf)
};

const USCA_ZONES = new Set([
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "America/Boise",
  "America/Detroit",
  "America/Indiana/Indianapolis",
  "America/Indiana/Knox",
  "America/Indiana/Marengo",
  "America/Indiana/Petersburg",
  "America/Indiana/Tell_City",
  "America/Indiana/Vevay",
  "America/Indiana/Vincennes",
  "America/Indiana/Winamac",
  "America/Kentucky/Louisville",
  "America/Kentucky/Monticello",
  "America/North_Dakota/Beulah",
  "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem",
  "America/Adak",
  "America/Nome",
  "America/Sitka",
  "America/Juneau",
  "America/Yakutat",
  "America/Metlakatla",
  "America/Menominee",
  "Pacific/Honolulu",
  // legacy aliases still returned by some browsers
  "America/Indianapolis",
  "America/Fort_Wayne",
  "America/Louisville",
  "America/Knox_IN",
  // Canada
  "America/Toronto",
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Halifax",
  "America/St_Johns",
  "America/Regina",
  "America/Whitehorse",
  "America/Yellowknife",
  "America/Iqaluit",
  "America/Glace_Bay",
  "America/Goose_Bay",
  "America/Moncton",
  "America/Creston",
  "America/Dawson",
  "America/Dawson_Creek",
  "America/Fort_Nelson",
  "America/Swift_Current",
  "America/Rankin_Inlet",
  "America/Cambridge_Bay",
  "America/Inuvik",
  "America/Resolute",
  "America/Montreal",
  "America/Coral_Harbour",
  "America/Atikokan",
  "America/Blanc-Sablon",
  "America/Nipigon",
  "America/Thunder_Bay",
  "America/Rainy_River",
  "America/Pangnirtung",
]);

const EUROPE_EXTRA = new Set([
  "Atlantic/Reykjavik",
  "Atlantic/Canary",
  "Atlantic/Madeira",
  "Atlantic/Azores",
  "Atlantic/Faroe",
  "Atlantic/Faeroe",
  "Arctic/Longyearbyen",
  "Africa/Ceuta",
  "Asia/Nicosia",
  "Asia/Famagusta",
  "Asia/Istanbul",
  // Asian Russia — Meta's Europe region includes Russia
  "Asia/Yekaterinburg",
  "Asia/Omsk",
  "Asia/Novosibirsk",
  "Asia/Barnaul",
  "Asia/Tomsk",
  "Asia/Novokuznetsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Chita",
  "Asia/Yakutsk",
  "Asia/Khandyga",
  "Asia/Vladivostok",
  "Asia/Ust-Nera",
  "Asia/Magadan",
  "Asia/Sakhalin",
  "Asia/Srednekolymsk",
  "Asia/Kamchatka",
  "Asia/Anadyr",
]);

// High-income zones without regional data → worldwide average
const WORLD_ZONES = new Set([
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Macau",
  "Pacific/Auckland",
  "Pacific/Chatham",
  "Asia/Jerusalem",
  "Asia/Tel_Aviv",
  "Asia/Dubai",
  "Asia/Qatar",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Riyadh",
]);

export const getRegion = (timeZone) => {
  const tz = timeZone || "";
  if (USCA_ZONES.has(tz) || tz.startsWith("US/") || tz.startsWith("Canada/"))
    return "usca";
  if (WORLD_ZONES.has(tz) || tz.startsWith("Australia/")) return "world";
  if (tz.startsWith("Europe/") || EUROPE_EXTRA.has(tz)) return "europe";
  if (tz.startsWith("America/")) return "latam";
  if (
    tz.startsWith("Africa/") ||
    (tz.startsWith("Asia/") &&
      /Baghdad|Tehran|Amman|Beirut|Damascus|Aden|Gaza|Hebron|Muscat/.test(tz))
  )
    return "africa_me";
  if (
    tz.startsWith("Asia/") ||
    tz.startsWith("Pacific/") ||
    tz.startsWith("Indian/")
  )
    return "apac";
  return "world"; // UTC, Etc/*, GMT, CET, unknown
};

export const getRegionalFactor = (timeZone) =>
  REGION_FACTORS[getRegion(timeZone)];
