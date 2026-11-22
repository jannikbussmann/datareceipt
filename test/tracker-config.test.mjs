import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getTrackerEntity,
  isThirdParty,
  getRegistrableDomain,
  getHostname,
  REVENUE_WEIGHTS,
  FALLBACK_WEIGHT,
  getRegion,
  YEARLY_PER_USER,
} from "../src/js/tracker-config.js";

test("detects known trackers by hostname", () => {
  const cases = {
    "https://securepubads.g.doubleclick.net/gampad/ads": "google",
    "https://www.google-analytics.com/g/collect": "google",
    "https://www.googletagmanager.com/gtag/js?id=G-X": "google",
    "https://www.google.com/pagead/1p-conversion/1/": "google",
    "https://www.google.de/ads/ga-audiences": "google",
    "https://connect.facebook.net/en_US/fbevents.js": "meta",
    "https://www.facebook.com/tr?id=1&ev=PageView": "meta",
    "https://c.amazon-adsystem.com/aax2/apstag.js": "amazon",
    "https://bat.bing.com/bat.js": "microsoft",
    "https://ib.adnxs.com/ut/v3": "microsoft",
    "https://analytics.tiktok.com/i18n/pixel/events.js": "tiktok",
    "https://px.ads.linkedin.com/collect": "linkedin",
    "https://static.ads-twitter.com/uwt.js": "twitter_x",
    "https://t.co/i/adsct": "twitter_x",
    "https://www.redditstatic.com/ads/pixel.js": "reddit",
    "https://bidder.criteo.com/cdb": "criteo",
    "https://match.adsrvr.org/track/cmf": "the_trade_desk",
    "https://cdn.taboola.com/libtrc/x/loader.js": "taboola",
    "https://widgets.outbrain.com/outbrain.js": "teads",
    "https://fastlane.rubiconproject.com/a/api": "magnite",
    "https://ct.pinterest.com/v3/": "pinterest",
  };
  for (const [url, entity] of Object.entries(cases))
    assert.equal(getTrackerEntity(url), entity, url);
});

test("does not flag normal content (audit false positives)", () => {
  const urls = [
    "https://www.microsoft.com/de-de/",
    "https://www.target.com/",
    "https://www.pinterest.com/pin/1",
    "https://www.reddit.com/r/all",
    "https://www.ft.com/content/abc",
    "https://shop.example.de/collections/winter",
    "https://example.org/?utm_source=google.com",
    "https://docs.github.com/en/metrics",
    "https://www.spiegel.de/wirtschaft/analytics-boom.html",
    "https://example.com/google-pixel-9-review",
    "https://www.google.com/search?q=weather",
    "https://www.google.com/recaptcha/api.js",
    "https://www.amazon.de/dp/B000",
    "https://m.media-amazon.com/images/I/x.jpg",
    "https://www.linkedin.com/feed/",
    "https://code.visualstudio.com/docs",
    "https://www.facebook.com/somepage",
    "https://www.gstatic.com/x.js",
    "https://www.facebook.com/trending",
    "https://www.google.com/adsense-help",
    "not a url",
  ];
  for (const url of urls) assert.equal(getTrackerEntity(url), null, url);
});

test("registrable domain handles two-level suffixes", () => {
  assert.equal(getRegistrableDomain("www.bbc.co.uk"), "bbc.co.uk");
  assert.equal(getRegistrableDomain("api.example.co.uk"), "example.co.uk");
  assert.equal(getRegistrableDomain("a.b.spiegel.de"), "spiegel.de");
  assert.equal(getRegistrableDomain("localhost"), "localhost");
});

test("only third-party requests count", () => {
  assert.equal(isThirdParty("www.facebook.com", "facebook.com"), false);
  assert.equal(isThirdParty("static.spiegel.de", "www.spiegel.de"), false);
  assert.equal(isThirdParty("connect.facebook.net", "www.spiegel.de"), true);
  assert.equal(isThirdParty("x.bbc.co.uk", "www.example.co.uk"), true);
  assert.equal(getHostname("https://Www.Example.com/a"), "www.example.com");
});

test("weights are small, positive per-page estimates", () => {
  for (const [entity, w] of Object.entries(REVENUE_WEIGHTS)) {
    assert.ok(w >= 0 && w < 0.005, `${entity}: ${w}`);
  }
  assert.ok(FALLBACK_WEIGHT > 0 && FALLBACK_WEIGHT < 0.005);
});

test("analytics and verification tools earn no ad revenue", () => {
  for (const e of [
    "hotjar",
    "mixpanel",
    "segment",
    "hubspot",
    "doubleverify",
    "comscore",
  ]) {
    assert.equal(REVENUE_WEIGHTS[e], 0, e);
  }
});

test("yearly total per average user stays in a plausible range", () => {
  assert.ok(
    YEARLY_PER_USER > 3 && YEARLY_PER_USER < 15,
    String(YEARLY_PER_USER),
  );
});

test("region from time zone", () => {
  const cases = {
    "Europe/Berlin": "europe",
    "Asia/Istanbul": "europe",
    "Asia/Novosibirsk": "europe",
    "Atlantic/Madeira": "europe",
    "America/New_York": "usca",
    "America/Indianapolis": "usca",
    "America/Montreal": "usca",
    "US/Eastern": "usca",
    "America/Toronto": "usca",
    "America/Sao_Paulo": "latam",
    "Asia/Kolkata": "apac",
    "Asia/Tokyo": "world",
    "Australia/Sydney": "world",
    "Asia/Dubai": "world",
    "Africa/Lagos": "africa_me",
    "Asia/Tehran": "africa_me",
    UTC: "world",
    "Etc/UTC": "world",
    "": "world",
  };
  for (const [tz, region] of Object.entries(cases))
    assert.equal(getRegion(tz), region, tz);
});
