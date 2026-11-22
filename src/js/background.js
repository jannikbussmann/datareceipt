import {
  REVENUE_WEIGHTS,
  FALLBACK_WEIGHT,
  isTracker,
  getCorporateEntity,
  getTrackingStreamKey,
  getTrackerTypeMultiplier,
  getRegionalMultiplier,
  getSeasonalMultiplier,
  getCategoryMultiplier,
  getTimeOfDayMultiplier,
  getProfileMultiplier,
  getDeviceMultiplier,
} from "./tracker-config.js";

// Cache static multipliers — don't change during a browser session.
const REGIONAL_MULTIPLIER = getRegionalMultiplier();
const DEVICE_MULTIPLIER = getDeviceMultiplier();

// ---------------------------------------------------------------------------
// Icon / badge
// ---------------------------------------------------------------------------

const applyBadge = (enabled) => {
  chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: "#cc0000" });
};

chrome.storage.local.get(["enabled"], (result) => {
  applyBadge(result.enabled !== false);
});

// Invalidate stats cache when storage is cleared (e.g. user reset)
chrome.storage.onChanged.addListener((changes) => {
  if ("lifetime_stats" in changes && !changes.lifetime_stats.newValue) {
    statsCache = null;
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.storage.local.get(["enabled"], (result) => {
    const next = result.enabled === false;
    chrome.storage.local.set({ enabled: next }, () => {
      applyBadge(next);
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_TOPOGRAPHY" }, () => void chrome.runtime.lastError);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Deduplication — one count per tracking stream per tab per page load.
// Using stream keys (not raw entity names) so Google Analytics and DoubleClick
// are counted as separate revenue streams on the same page.
// ---------------------------------------------------------------------------

const seenPerTab = new Map();

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") seenPerTab.set(tabId, new Set());
});

chrome.tabs.onRemoved.addListener((tabId) => {
  seenPerTab.delete(tabId);
});

// ---------------------------------------------------------------------------
// Stats cache — eliminates TOCTOU race condition on storage reads.
// JS is single-threaded: once loaded, all in-memory updates are synchronous
// and atomic. Storage writes are fire-and-forget for persistence across
// service worker restarts. Pending callbacks drain in order on first load.
// ---------------------------------------------------------------------------

const MAX_ENTITIES = 200;
let statsCache = null;
const pendingCallbacks = [];

function withStats(callback) {
  if (statsCache !== null) {
    callback(statsCache);
    return;
  }
  pendingCallbacks.push(callback);
  if (pendingCallbacks.length === 1) {
    chrome.storage.local.get(["lifetime_stats"], (result) => {
      statsCache = result.lifetime_stats || { total: 0, revenue: 0, entities: {} };
      while (pendingCallbacks.length > 0) pendingCallbacks.shift()(statsCache);
    });
  }
}

// ---------------------------------------------------------------------------
// Request interception
// ---------------------------------------------------------------------------

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId === -1 || !isTracker(details.url)) return;

    const entity = getCorporateEntity(details.url);
    const streamKey = getTrackingStreamKey(entity, details.url);
    if (streamKey === null) return; // CDN / infrastructure — no revenue attribution

    // Block prototype pollution via crafted tracker domain names
    if (entity === "__proto__" || entity === "constructor" || entity === "prototype") return;

    if (!seenPerTab.has(details.tabId)) seenPerTab.set(details.tabId, new Set());
    const seen = seenPerTab.get(details.tabId);
    if (seen.has(streamKey)) return;
    seen.add(streamKey);

    const pageUrl = details.documentUrl || details.initiator || "";

    withStats((stats) => {
      const uniqueEntityCount = Object.keys(stats.entities).length;

      const weight =
        (REVENUE_WEIGHTS[entity] || FALLBACK_WEIGHT) *
        getTrackerTypeMultiplier(details.url) *
        REGIONAL_MULTIPLIER *
        getSeasonalMultiplier() *
        getCategoryMultiplier(pageUrl) *
        getTimeOfDayMultiplier() *
        getProfileMultiplier(uniqueEntityCount) *
        DEVICE_MULTIPLIER;

      const isNew = !Object.hasOwn(stats.entities, entity);
      if (isNew) {
        if (uniqueEntityCount >= MAX_ENTITIES) return;
        stats.entities[entity] = { count: 0, revenue: 0 };
      }

      stats.total++;
      stats.revenue += weight;
      stats.entities[entity].count++;
      stats.entities[entity].revenue += weight;

      // Persist in background — cache is already updated above
      chrome.storage.local.set({ lifetime_stats: stats }, () => {
        if (chrome.runtime.lastError) {
          console.warn("DataReceipt: storage write failed:", chrome.runtime.lastError.message);
        }
      });

      chrome.tabs.sendMessage(details.tabId, {
        type: "TRACKER_DETECTED",
        entity,
        weight,
        lifetime_stats: stats,
      }, () => void chrome.runtime.lastError);
    });
  },
  { urls: ["<all_urls>"] }
);
