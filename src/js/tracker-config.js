// ---------------------------------------------------------------------------
// Tracker detection — entity map, URL classifier, entity resolver
// ---------------------------------------------------------------------------

export const TRACKER_MAP = {
  google:       ["google-analytics", "doubleclick", "googleadservices", "gstatic", "google.com", "googlesyndication", "googletagmanager"],
  meta:         ["facebook.com", "facebook.net", "instagram.com", "atdmt", "fbcdn"],
  amazon:       ["amazon-adsystem", "media-amazon", "assoc-amazon", "amazon.de", "amazon.com"],
  microsoft:    ["clarity.ms", "bing.com", "adnxs", "aka.ms", "visualstudio"],
  tiktok:       ["tiktokv.com", "byteoversea.com", "ibytedtos.com"],
  apple:        ["apple-cloudkit.com", "apple-livephotoskit.com"],
  adobe:        ["demdex.net", "omtrdc.net", "adobedtm.com", "adobe.com"],
  oracle:       ["bluekai.com", "addthis.com", "en25.com"],
  salesforce:   ["krxd.net", "exacttarget.com", "force.com"],
  criteo:       ["criteo.com", "criteo.net"],
  the_trade_desk: ["adsrvr.org"],
  taboola:      ["taboola.com"],
  outbrain:     ["outbrain.com", "outbrainimg.com"],
  twitter_x:    ["t.co", "twimg.com", "twitter.com"],
  linkedin:     ["licdn.com", "linkedin.com"],
  reddit:       ["redditmedia.com", "redditstatic.com"],
};

const TRACKER_KEYWORDS = [
  "analytics", "pixel", "telemetry", "tracker", "metrics", "collect",
  "scorecardresearch", "quantserve", "smartadserver", "hotjar", "beacon", "doubleverify",
];

const KNOWN_DOMAINS = Object.values(TRACKER_MAP).flat();

export const isTracker = (url) => {
  const lower = url.toLowerCase();
  return KNOWN_DOMAINS.some((k) => lower.includes(k)) ||
    TRACKER_KEYWORDS.some((k) => lower.includes(k));
};

export const getCorporateEntity = (url) => {
  const lower = url.toLowerCase();
  for (const [entity, keywords] of Object.entries(TRACKER_MAP)) {
    if (keywords.some((k) => lower.includes(k))) return entity;
  }
  try {
    const parts = new URL(url).hostname.split(".");
    return parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : parts[0].toLowerCase();
  } catch {
    return "unknown";
  }
};

// ---------------------------------------------------------------------------

/**
 * Revenue weights per unique page view, per tracking entity (USD, global average).
 *
 * Methodology: Annual advertising revenue (FY2023, official reports)
 *              ÷ estimated globally tracked users
 *              ÷ estimated tracked pages per user per year
 *
 * The effective weight applied per request is:
 *   baseWeight × trackerTypeMultiplier × regionalMultiplier × seasonalMultiplier
 *               × categoryMultiplier × timeOfDayMultiplier × profileMultiplier
 *               × deviceMultiplier
 *
 * Deduplication happens per "tracking stream" (not per entity) — Google Analytics
 * and DoubleClick represent distinct revenue streams and are counted separately.
 */
export const REVENUE_WEIGHTS = {
  google: 0.00106, // Alphabet ad revenue $237.86B / 4.5B users / ~50k pages/yr
  meta: 0.00246, // Meta ad revenue $131.9B / 3.27B users / ~16.4k pages/yr
  amazon: 0.00535, // Amazon Advertising $46.9B / 800M users / ~11k pages/yr
  microsoft: 0.00146, // Microsoft Advertising ~$16B / 1B users / ~11k pages/yr
  tiktok: 0.00194, // TikTok ~$18B / 1.7B users / ~5.5k pages/yr
  apple: 0.0002, // Apple Search Ads only; apple-cloudkit & livephotoskit are infra
  adobe: 0.00018, // Adobe Exp. Cloud ~$4.9B / 2B users; Audience Manager sunset 2023
  oracle: 0.00005, // Oracle Advertising shut down June 2023
  salesforce: 0.00055, // Salesforce DMP (Krux) ~$3B / 500M profiles / ~11k pages/yr
  criteo: 0.00033, // Criteo $1.88B / 700M profiles / ~8.2k pages/yr
  the_trade_desk: 0.00102, // TTD $1.95B / 700M profiles / ~2.7k pages/yr
  taboola: 0.00049, // Taboola $1.6B / 600M users / ~5.5k pages/yr
  outbrain: 0.00057, // Outbrain $997M / 400M users / ~4.4k pages/yr
  twitter_x: 0.00056, // X ad revenue ~$2.5B / 540M users / ~8.2k pages/yr
  linkedin: 0.00767, // LinkedIn Ads ~$4.2B / 200M cross-site users / ~2.7k pages/yr
  reddit: 0.001, // Reddit ~$700M / ~100M cross-site users
};

export const FALLBACK_WEIGHT = 0.0003;

// ---------------------------------------------------------------------------
// Tracking stream keys — deduplication granularity
// ---------------------------------------------------------------------------
// Most entities have one revenue stream per page.
// Google and Meta are split because analytics and ad-serving are genuinely
// separate products with separate monetisation — both can fire on the same page.
// Returns null for pure CDN/infrastructure requests (no revenue attribution).

export const getTrackingStreamKey = (entity, url) => {
  const lower = url.toLowerCase();
  if (entity === "google") {
    if (/doubleclick|googlesyndication|googleadservices/.test(lower))
      return "google_ads";
    if (/google-analytics|googletagmanager/.test(lower))
      return "google_analytics";
    if (/gstatic/.test(lower)) return null; // CDN, skip
    return "google_other";
  }
  if (entity === "meta") {
    if (/fbcdn/.test(lower)) return null; // Meta CDN, skip
    return "meta";
  }
  return entity;
};

// ---------------------------------------------------------------------------
// Tracker type multiplier
// ---------------------------------------------------------------------------
// Source: programmatic industry benchmarks — ad-serving (direct impression)
// commands significantly higher CPM than analytics or CDN requests.

const TYPE_RULES = [
  [/doubleclick\.net/, 2.1],
  [/googlesyndication\.com/, 1.8],
  [/googleadservices\.com/, 1.7],
  [/adsrvr\.org/, 2.0],
  [/amazon-adsystem\.com/, 2.0],
  [/criteo\.(com|net)/, 1.9],
  [/adnxs\.com/, 1.8],
  [/assoc-amazon\.com/, 1.9],
  [/facebook\.net\/en_[A-Z]{2}\/fbevents/, 2.0],
  [/atdmt\.com/, 1.6],
  [/krxd\.net/, 1.5],
  [/google-analytics\.com/, 0.5],
  [/googletagmanager\.com/, 0.4],
  [/clarity\.ms/, 0.4],
  [/omtrdc\.net/, 0.6],
  [/demdex\.net/, 0.7],
  [/adobedtm\.com/, 0.4],
  [/hotjar\.com/, 0.3],
  [/gstatic\.com/, 0.15],
  [/fbcdn\.net/, 0.15],
  [/twimg\.com/, 0.25],
  [/redditstatic\.com/, 0.15],
  [/media-amazon\.com/, 0.2],
  [/licdn\.com\/dms\//, 0.2],
  [/aka\.ms\//, 0.3],
];

export const getTrackerTypeMultiplier = (url) => {
  const lower = url.toLowerCase();
  for (const [pattern, multiplier] of TYPE_RULES) {
    if (pattern.test(lower)) return multiplier;
  }
  return 1.0;
};

// ---------------------------------------------------------------------------
// Regional multiplier
// ---------------------------------------------------------------------------
// Source: Google (Alphabet) and Meta both disclose ARPU by region in quarterly
// earnings. Multipliers are the weighted average of both companies' regional
// ARPU relative to their global averages (FY2023).
//
// Google: US&CA $217 / Europe $70 / APAC $23 / RoW $13 (global avg $53)
// Meta:   US&CA $274 / Europe $69 / APAC $20 / RoW $13 (global avg $40)

const US_TIMEZONES = new Set([
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Boise",
  "America/Detroit", "America/Indiana/Indianapolis", "America/Indiana/Knox",
  "America/Indiana/Marengo", "America/Indiana/Petersburg", "America/Indiana/Tell_City",
  "America/Indiana/Vevay", "America/Indiana/Vincennes", "America/Indiana/Winamac",
  "America/Kentucky/Louisville", "America/Kentucky/Monticello",
  "America/North_Dakota/Beulah", "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem", "America/Adak", "America/Nome",
  "America/Sitka", "America/Juneau", "America/Yakutat", "America/Metlakatla",
]);

const CA_TIMEZONES = new Set([
  "America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg",
  "America/Halifax", "America/St_Johns", "America/Regina", "America/Whitehorse",
  "America/Yellowknife", "America/Iqaluit", "America/Glace_Bay",
  "America/Goose_Bay", "America/Moncton", "America/Creston",
  "America/Dawson", "America/Dawson_Creek", "America/Fort_Nelson",
]);

const W_EU_TIMEZONES = new Set([
  "Europe/Berlin", "Europe/Paris", "Europe/Amsterdam", "Europe/Brussels",
  "Europe/Vienna", "Europe/Zurich", "Europe/Stockholm", "Europe/Oslo",
  "Europe/Copenhagen", "Europe/Helsinki", "Europe/Madrid", "Europe/Rome",
  "Europe/Lisbon", "Europe/Luxembourg", "Europe/Monaco", "Atlantic/Reykjavik",
]);

export const getRegionalMultiplier = () => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  if (US_TIMEZONES.has(tz)) return 5.0;
  if (CA_TIMEZONES.has(tz)) return 2.5;
  if (tz === "Europe/London" || tz === "Europe/Dublin") return 2.8;
  if (W_EU_TIMEZONES.has(tz)) return 2.2;
  if (tz.startsWith("Europe/")) return 1.2;
  if (tz.startsWith("Australia/") || tz === "Pacific/Auckland") return 2.0;
  if (tz === "Asia/Tokyo") return 1.4;
  if (tz === "Asia/Seoul") return 1.1;
  if (tz === "Asia/Singapore" || tz === "Asia/Hong_Kong") return 1.4;
  if (tz === "Asia/Dubai" || tz === "Asia/Riyadh" || tz === "Asia/Kuwait") return 0.9;
  if (["Asia/Shanghai", "Asia/Chongqing", "Asia/Harbin", "Asia/Urumqi"].includes(tz)) return 0.4;
  if (tz === "Asia/Kolkata") return 0.25;
  if (tz.startsWith("America/")) return 0.5;
  if (tz.startsWith("Asia/")) return 0.3;
  if (tz.startsWith("Africa/")) return 0.15;
  return 1.0;
};

// ---------------------------------------------------------------------------
// Seasonal multiplier
// ---------------------------------------------------------------------------
// Source: Google/Meta/TTD quarterly earnings patterns + eMarketer CPM index.
// Q4 (Oct–Dec) commands a 30–45% premium due to holiday ad spend.
// Q1 (Jan–Feb) is the weakest period post-holiday.

const MONTHLY_INDEX = [
  0.70, // Jan
  0.75, // Feb
  0.88, // Mar
  0.95, // Apr
  1.05, // May
  1.10, // Jun
  1.00, // Jul
  1.00, // Aug
  1.10, // Sep — pre-Q4 ramp
  1.20, // Oct
  1.45, // Nov — Black Friday peak
  1.40, // Dec
];

export const getSeasonalMultiplier = () => MONTHLY_INDEX[new Date().getMonth()];

// ---------------------------------------------------------------------------
// Page category multiplier
// ---------------------------------------------------------------------------
// Source: IAB / eMarketer programmatic CPM benchmarks 2023-2024.
// Baseline: ~$3.00 average programmatic display CPM.
// Multiplier = category avg CPM / baseline CPM.
//
// Tested against details.documentUrl || details.initiator (the page being visited,
// not the tracker URL). Rules are evaluated in order; first match wins.

const CATEGORY_RULES = [
  // Finance / Banking — avg programmatic CPM $11 → 3.7x
  [/bank|financ|invest|trading|broker|forex|crypto|bitcoin|mortgage|insurance|insur|loan|credit|wealth|fund\b|portfolio|etf\b|aktien|borse|finanz|sparkasse|volksbank/i, 3.7],
  // Insurance (high-intent, significant CPM premium) — ~$10 → 3.3x
  [/versicherung|allianz\.de|huk\.|axa\.|zurich\.com|ergo\.|generali\./i, 3.3],
  // Pharma / Healthcare — avg $9 → 3.0x
  [/pharma|health|medical|hospital|clinic|\bdrug\b|medicine|prescription|wellness|apotheke|gesundheit|krankenkasse|arzt/i, 3.0],
  // Legal — avg $7 → 2.3x
  [/legal|lawyer|attorney|law\.com|anwalt|kanzlei|rechtsanwalt|notariat/i, 2.3],
  // Luxury / Jewelry — avg $7 → 2.3x
  [/luxury|jewel|rolex|hermes|gucci|louis.?vuitton|prada|chanel|cartier|tiffany|bvlgari|porsche\.com|ferrari/i, 2.3],
  // Automotive — avg $7 → 2.3x
  [/\bauto\b|autohaus|\bcar\b|vehicle|motor|dealership|leasing|\baudi\.|\bbmw\.|mercedes\.|toyota\.|volkswagen\.|ford\.com|honda\.|hyundai\./i, 2.3],
  // B2B / SaaS / Enterprise Tech — avg $6 → 2.0x
  [/enterprise|saas|\bb2b\b|cloud\.com|software\.|github\.com|stackoverflow|salesforce|hubspot|workday/i, 2.0],
  // Travel — avg $5.5 → 1.8x
  [/travel|hotel|flight|airline|booking\.com|airbnb|expedia|tripadvisor|trivago|vacation|resort|cruise|reise|urlaub/i, 1.8],
  // Real Estate — avg $5 → 1.7x
  [/realestate|real-estate|property|realtor|zillow|immobil|wohnung|mieten|haus\.kaufen|immoscout|immonet/i, 1.7],
  // Education — avg $3.5 → 1.2x
  [/\.edu\/|university|college|\bcourse\b|studium|hochschule|udemy|coursera|masterclass|fernstudium/i, 1.2],
  // E-commerce / Retail — avg $4 → 1.3x (elevated purchase intent)
  [/\bshop\b|\bstore\b|\bcart\b|checkout|product|warenkorb|zalando|otto\.|kaufland|mediamarkt|saturn\.de/i, 1.3],
  // News / Media — avg $3 → 1.0x (baseline)
  [/news|zeitung|times\.|\.post\.|daily\.|spiegel\.|faz\.|stern\.|focus\.|bild\.|sueddeutsche|tagesschau|zeit\.de/i, 1.0],
  // Sports — avg $3.5 → 1.2x
  [/sport|football|soccer|basketball|tennis|bundesliga|kicker\.|sportschau|transfermarkt/i, 1.2],
  // Food / Recipes — avg $2.5 → 0.8x
  [/recipe|food|cook|chefkoch|allrecipes|restaurant|lieferando|delivery|meal/i, 0.8],
  // Entertainment / Streaming — avg $2.5 → 0.8x
  [/entertainment|movie|film|music|netflix\.|spotify\.|twitch\.|stream|kino/i, 0.8],
  // Gaming — avg $2.0 → 0.7x
  [/gaming|\bgame\b|steam\.|playstation|xbox|nintendo|twitch\.tv/i, 0.7],
  // Social media platforms — avg $1.5 → 0.5x
  [/twitter\.com|facebook\.com|instagram\.com|tiktok\.com|reddit\.com|linkedin\.com/i, 0.5],
];

export const getCategoryMultiplier = (pageUrl) => {
  if (!pageUrl) return 1.0;
  const url = pageUrl.toLowerCase();
  for (const [pattern, multiplier] of CATEGORY_RULES) {
    if (pattern.test(url)) return multiplier;
  }
  return 1.0;
};

// ---------------------------------------------------------------------------
// Time-of-day multiplier
// ---------------------------------------------------------------------------
// Source: Programmatic SSP data (Xandr/AppNexus, MediaMath benchmarks).
// Evening hours (18–21h) command a 25–30% premium; overnight (2–5h) a 55–60% discount.
// Index values normalized so the browsing-weighted daily average ≈ 1.0.

const HOURLY_INDEX = [
  0.50, // 00h
  0.45, // 01h
  0.40, // 02h
  0.38, // 03h — lowest demand
  0.42, // 04h
  0.55, // 05h
  0.68, // 06h
  0.82, // 07h
  0.95, // 08h
  1.02, // 09h
  1.05, // 10h
  1.05, // 11h
  0.95, // 12h — lunch dip
  0.95, // 13h
  1.00, // 14h
  1.05, // 15h
  1.10, // 16h
  1.15, // 17h
  1.25, // 18h
  1.30, // 19h
  1.30, // 20h — evening peak
  1.25, // 21h
  1.10, // 22h
  0.85, // 23h
];

export const getTimeOfDayMultiplier = () => HOURLY_INDEX[new Date().getHours()];

// ---------------------------------------------------------------------------
// Profile richness multiplier
// ---------------------------------------------------------------------------
// Source: AdRoll/Criteo data — retargeting audiences command 30–50% CPM premium
// over cold prospecting. "Audiences with 5+ data points: 2–3x base CPM."
// We approximate profile richness by the number of distinct entities tracked.

export const getProfileMultiplier = (uniqueEntityCount) => {
  if (uniqueEntityCount <= 3) return 0.70; // unknown / new profile
  if (uniqueEntityCount <= 8) return 1.00; // basic profile
  if (uniqueEntityCount <= 15) return 1.40; // rich cross-site profile
  return 2.00; // comprehensive profile — premium retargeting audience
};

// ---------------------------------------------------------------------------
// Device multiplier
// ---------------------------------------------------------------------------
// Source: eMarketer / IAB — desktop commands 15–40% CPM premium over mobile
// (better viewability, higher purchase-intent browsing).

export const getDeviceMultiplier = () => {
  const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "").toLowerCase();
  if (/mobile|android|iphone/.test(ua) && !/ipad|tablet/.test(ua)) return 0.75;
  if (/ipad|tablet/.test(ua)) return 0.85;
  return 1.0; // desktop
};
