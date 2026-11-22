import {
  getTrackerEntity,
  getHostname,
  isThirdParty,
  getBaseWeight,
  getRegionalFactor,
} from "./tracker-config.js";

const REGIONAL_FACTOR = getRegionalFactor(
  Intl.DateTimeFormat().resolvedOptions().timeZone,
);
const MAX_ENTITIES = 200;
const emptyStats = () => ({ total: 0, revenue: 0, entities: {} });

// ---------------------------------------------------------------------------
// Global state: lifetime stats + enabled flag (chrome.storage.local).
// Kept in memory after first load; MV3 workers restart often, so everything is
// re-hydrated lazily. Pending callbacks drain in order once loaded.
// ---------------------------------------------------------------------------

let state = null; // { stats, enabled }
const pendingState = [];

function withState(callback) {
  if (state !== null) return callback(state);
  pendingState.push(callback);
  if (pendingState.length === 1) {
    chrome.storage.local.get(["lifetime_stats", "enabled"], (res) => {
      state = {
        stats: res.lifetime_stats || emptyStats(),
        enabled: res.enabled !== false,
      };
      while (pendingState.length > 0) pendingState.shift()(state);
    });
  }
}

const applyBadge = (enabled) => {
  chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: "#cc0000" });
};

withState((s) => applyBadge(s.enabled));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || state === null) return;
  if ("enabled" in changes) {
    state.enabled = changes.enabled.newValue !== false;
    applyBadge(state.enabled);
  }
});

chrome.action.onClicked.addListener(() => {
  withState((s) => chrome.storage.local.set({ enabled: !s.enabled }));
});

// ---------------------------------------------------------------------------
// Per-tab page state (chrome.storage.session — survives worker restarts, is
// cleared when the browser closes). Reset on every top-level navigation.
// Each company is counted at most once per page load.
// ---------------------------------------------------------------------------

const tabs = new Map(); // tabId -> { seen: Set, revenue, count, pageHost }
const tabLoads = new Map(); // tabId -> Promise during hydration
const tabKey = (tabId) => `tab:${tabId}`;

function newPage(pageHost) {
  return { seen: new Set(), revenue: 0, count: 0, pageHost };
}

function getTab(tabId) {
  if (tabs.has(tabId)) return Promise.resolve(tabs.get(tabId));
  if (!tabLoads.has(tabId)) {
    tabLoads.set(
      tabId,
      chrome.storage.session.get(tabKey(tabId)).then((res) => {
        tabLoads.delete(tabId);
        if (!tabs.has(tabId)) {
          const saved = res[tabKey(tabId)];
          tabs.set(
            tabId,
            saved ? { ...saved, seen: new Set(saved.seen) } : newPage(""),
          );
        }
        return tabs.get(tabId);
      }),
    );
  }
  return tabLoads.get(tabId);
}

function saveTab(tabId, page) {
  chrome.storage.session.set({
    [tabKey(tabId)]: { ...page, seen: [...page.seen] },
  });
}

function sendPageStats(tabId, page) {
  chrome.tabs.sendMessage(
    tabId,
    { type: "PAGE_STATS", revenue: page.revenue, count: page.count },
    () => void chrome.runtime.lastError,
  );
}

chrome.tabs.onRemoved.addListener((tabId) => {
  tabs.delete(tabId);
  chrome.storage.session.remove(tabKey(tabId));
});

// ---------------------------------------------------------------------------
// Request observation
// ---------------------------------------------------------------------------

// New top-level navigation → new page state
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const page = newPage(getHostname(details.url));
    tabs.set(details.tabId, page);
    saveTab(details.tabId, page);
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
);

// Trackers are counted only when the request is actually sent — requests
// blocked by an ad blocker or the browser never reach onSendHeaders.
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const { tabId } = details;
    if (tabId < 0 || details.type === "main_frame") return;

    const entity = getTrackerEntity(details.url);
    if (entity === null) return;

    getTab(tabId).then((page) => {
      const pageHost =
        page.pageHost ||
        getHostname(
          details.documentUrl || details.originUrl || details.initiator || "",
        );
      if (!isThirdParty(getHostname(details.url), pageHost)) return;
      if (page.seen.has(entity)) return;

      withState((s) => {
        if (!s.enabled) return;
        const isNew = !Object.hasOwn(s.stats.entities, entity);
        if (isNew && Object.keys(s.stats.entities).length >= MAX_ENTITIES)
          return;

        page.seen.add(entity);
        const value = getBaseWeight(entity) * REGIONAL_FACTOR;

        if (isNew) s.stats.entities[entity] = { count: 0, revenue: 0 };
        s.stats.total++;
        s.stats.revenue += value;
        s.stats.entities[entity].count++;
        s.stats.entities[entity].revenue += value;
        page.count++;
        page.revenue += value;

        chrome.storage.local.set({ lifetime_stats: s.stats });
        saveTab(tabId, page);
        sendPageStats(tabId, page);
      });
    });
  },
  { urls: ["<all_urls>"] },
);

// ---------------------------------------------------------------------------
// Messages from the content script / receipt page
// ---------------------------------------------------------------------------

function resetAll() {
  withState((s) => {
    s.stats = emptyStats();
    chrome.storage.local.remove("lifetime_stats");
    for (const [tabId, page] of tabs) {
      page.revenue = 0;
      page.count = 0;
      saveTab(tabId, page);
    }
    // Pages not loaded in memory: zero their persisted totals as well
    chrome.storage.session.get(null).then((all) => {
      for (const [key, page] of Object.entries(all)) {
        if (key.startsWith("tab:") && !tabs.has(Number(key.slice(4)))) {
          chrome.storage.session.set({
            [key]: { ...page, revenue: 0, count: 0 },
          });
        }
      }
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message) return;

  if (message.type === "GET_PAGE_STATS" && sender.tab) {
    getTab(sender.tab.id).then((page) =>
      sendResponse({ revenue: page.revenue, count: page.count }),
    );
    return true; // async response
  }
  if (message.type === "RESET") resetAll();
  if (message.type === "OPEN_RECEIPT")
    chrome.tabs.create({ url: chrome.runtime.getURL("receipt.html") });
});
