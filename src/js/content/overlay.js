import overlayCss from "./content.css";
import { PROJECT_NAME, SUPPORTED_LANGS, getTranslation } from "./i18n.js";
import { SUPPORTED_CURRENCIES, formatCurrency } from "./currency.js";

// Unique family name so the page's own "Inter" (if any) is never affected.
const FONT_FAMILY = "DataReceipt Inter";
const FONT_FILES = {
  400: "Inter-Regular",
  600: "Inter-SemiBold",
  700: "Inter-Bold",
  900: "Inter-Black",
};
const VISIBLE_ROWS = 10;

const emptyStats = () => ({ total: 0, revenue: 0, entities: {} });
const isValidStats = (s) =>
  s &&
  typeof s.revenue === "number" &&
  typeof s.entities === "object" &&
  s.entities !== null;

class DataReceiptOverlay {
  constructor() {
    this.host = null;
    this.enabled = false;
    this.showAuditNote = false;
    this.showAll = false;
    this.lifetimeStats = emptyStats();
    this.pageStats = { revenue: 0, count: 0 };

    const browserLang = (navigator.language || "").split("-")[0].toUpperCase();
    this.settings = {
      language: SUPPORTED_LANGS.includes(browserLang) ? browserLang : "EN",
      currency: "USD",
      minimized: false,
    };

    chrome.runtime.onMessage.addListener((message, sender) => {
      if (sender.id !== chrome.runtime.id || !message) return;
      if (message.type === "PAGE_STATS") this.setPageStats(message);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") this.onStorageChanged(changes);
    });

    chrome.storage.local.get(
      ["lifetime_stats", "settings", "enabled"],
      (res) => {
        if (isValidStats(res.lifetime_stats))
          this.lifetimeStats = res.lifetime_stats;
        this.applySettings(res.settings);
        this.setEnabled(res.enabled !== false);
      },
    );
    chrome.runtime.sendMessage({ type: "GET_PAGE_STATS" }, (res) => {
      if (chrome.runtime.lastError) return;
      this.setPageStats(res);
    });
  }

  get t() {
    return getTranslation(this.settings.language);
  }

  fmt(usd) {
    return formatCurrency(usd, this.settings.currency, this.settings.language);
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  applySettings(s) {
    if (!s || typeof s !== "object") return;
    if (SUPPORTED_LANGS.includes(s.language))
      this.settings.language = s.language;
    if (SUPPORTED_CURRENCIES.includes(s.currency))
      this.settings.currency = s.currency;
    this.settings.minimized = s.minimized === true;
  }

  saveSettings() {
    chrome.storage.local.set({ settings: { ...this.settings } });
  }

  onStorageChanged(changes) {
    if ("lifetime_stats" in changes) {
      const next = changes.lifetime_stats.newValue;
      this.lifetimeStats = isValidStats(next) ? next : emptyStats();
      if (!next) this.pageStats = { revenue: 0, count: 0 }; // reset
      this.render();
    }
    if ("settings" in changes) {
      this.applySettings(changes.settings.newValue);
      this.render();
    }
    if ("enabled" in changes)
      this.setEnabled(changes.enabled.newValue !== false);
  }

  setPageStats(res) {
    if (!res || typeof res.revenue !== "number") return;
    this.pageStats = { revenue: res.revenue, count: res.count };
    this.render();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled && !this.host) this.mount();
    if (this.host)
      this.host.style.setProperty(
        "display",
        enabled ? "block" : "none",
        "important",
      );
    this.render();
  }

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  mount() {
    // Only real HTML pages — skip XML, SVG, JSON, plain text, framesets.
    const root = document.documentElement;
    if (
      document.contentType !== "text/html" ||
      !(root instanceof HTMLHtmlElement)
    )
      return;
    if (!document.body || document.body.tagName === "FRAMESET") {
      if (document.readyState === "loading") {
        document.addEventListener(
          "DOMContentLoaded",
          () => this.enabled && this.mount(),
          { once: true },
        );
      }
      return;
    }

    this.injectFonts();

    // Custom element on <html>: not hit by page rules like `body > div`, and
    // unaffected by transforms on <body>. Inline !important beats page CSS.
    this.host = document.createElement("datareceipt-overlay");
    this.host.style.cssText = [
      "all: initial",
      "display: block",
      "position: fixed",
      "top: 0",
      "left: 0",
      "width: 0",
      "height: 0",
      "z-index: 2147483647",
      "pointer-events: none",
    ]
      .map((d) => d + " !important")
      .join(";");

    // Closed shadow root: page scripts cannot read stats or trigger buttons
    const shadow = this.host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = overlayCss;
    shadow.appendChild(style);

    this.ui = document.createElement("section");
    this.ui.id = "digital-receipt";
    this.ui.setAttribute("role", "region");
    this.ui.innerHTML = this.buildTemplate();
    shadow.appendChild(this.ui);
    root.appendChild(this.host);

    const $ = (sel) => this.ui.querySelector(sel);
    this.el = {
      projectName: $(".project-name"),
      title: $(".receipt-title"),
      totalLabel: $(".main-stats .label"),
      total: $("#total-revenue-display"),
      pageLabel: $("#page-label"),
      pageValue: $("#page-value"),
      sectionTitle: $(".section-title"),
      entities: $("#entities-list"),
      moreBtn: $("#profiteer-toggle-btn"),
      lang: $("#lang-select"),
      curr: $("#curr-select"),
      auditBtn: $("#audit-toggle-btn"),
      exportBtn: $("#export-btn"),
      resetBtn: $("#reset-btn"),
      auditNote: $("#audit-note-content"),
      minimizeBtn: $("#minimize-btn"),
      body: $("#receipt-body"),
    };
    this.el.projectName.textContent = PROJECT_NAME;
    this.bindEvents();
  }

  injectFonts() {
    const style = document.createElement("style");
    style.textContent = Object.entries(FONT_FILES)
      .map(
        ([weight, file]) =>
          `@font-face{font-family:"${FONT_FAMILY}";src:url("${chrome.runtime.getURL(
            `fonts/${file}.woff2`,
          )}") format("woff2");font-weight:${weight};font-style:normal;font-display:swap}`,
      )
      .join("");
    (document.head || document.documentElement).appendChild(style);
  }

  buildTemplate() {
    // Safe: option values come from hardcoded arrays, not from storage or the page.
    const langOptions = SUPPORTED_LANGS.map(
      (l) => `<option value="${l}">${l}</option>`,
    ).join("");
    const currOptions = SUPPORTED_CURRENCIES.map(
      (c) => `<option value="${c}">${c}</option>`,
    ).join("");
    return `
      <div class="receipt-header">
        <div class="header-left">
          <div class="project-name"></div>
          <h2 class="receipt-title"></h2>
        </div>
        <button id="minimize-btn" type="button" aria-controls="receipt-body"></button>
      </div>
      <div id="receipt-body">
        <div class="main-stats">
          <div class="label"></div>
          <div id="total-revenue-display" aria-live="polite"></div>
          <div id="session-revenue-note"><span id="page-label"></span> <strong id="page-value"></strong></div>
        </div>
        <div class="divider"></div>
        <div class="breakdown-section">
          <h3 class="section-title"></h3>
          <div id="entities-list"></div>
          <button id="profiteer-toggle-btn" type="button" class="secondary-toggle hidden"></button>
        </div>
        <div class="settings-row">
          <select id="lang-select" class="receipt-select">${langOptions}</select>
          <select id="curr-select" class="receipt-select">${currOptions}</select>
        </div>
        <div class="footer-links">
          <button id="audit-toggle-btn" type="button" class="footer-link" aria-controls="audit-note-content"></button>
          <span class="sep" aria-hidden="true">|</span>
          <button id="export-btn" type="button" class="footer-link"></button>
          <span class="sep" aria-hidden="true">|</span>
          <button id="reset-btn" type="button" class="footer-link danger"></button>
        </div>
        <div id="audit-note-content" class="audit-note hidden"></div>
      </div>
    `;
  }

  bindEvents() {
    const { el } = this;
    el.minimizeBtn.addEventListener("click", () => {
      this.settings.minimized = !this.settings.minimized;
      this.saveSettings();
      this.render();
    });
    el.lang.addEventListener("change", (e) => {
      this.settings.language = e.target.value;
      this.saveSettings();
      this.render();
    });
    el.curr.addEventListener("change", (e) => {
      this.settings.currency = e.target.value;
      this.saveSettings();
      this.render();
    });
    el.auditBtn.addEventListener("click", () => {
      this.showAuditNote = !this.showAuditNote;
      this.render();
    });
    el.moreBtn.addEventListener("click", () => {
      this.showAll = !this.showAll;
      this.render();
    });
    el.exportBtn.addEventListener("click", () =>
      chrome.runtime.sendMessage({ type: "OPEN_RECEIPT" }),
    );
    el.resetBtn.addEventListener("click", () => {
      if (confirm(this.t.resetConfirm))
        chrome.runtime.sendMessage({ type: "RESET" });
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  render() {
    if (!this.host || !this.enabled) return;
    const { el, t } = this;

    this.ui.setAttribute("aria-label", `${PROJECT_NAME} — ${t.title}`);
    this.ui.classList.toggle("minimized", this.settings.minimized);
    el.minimizeBtn.setAttribute(
      "aria-expanded",
      String(!this.settings.minimized),
    );
    el.minimizeBtn.setAttribute(
      "aria-label",
      this.settings.minimized ? t.expand : t.minimize,
    );

    el.title.textContent = t.title;
    el.totalLabel.textContent = t.totalLabel;
    el.sectionTitle.textContent = t.topProfiteers;
    el.lang.value = this.settings.language;
    el.curr.value = this.settings.currency;
    el.lang.setAttribute("aria-label", t.language);
    el.curr.setAttribute("aria-label", t.currency);
    el.auditBtn.textContent = this.showAuditNote ? t.close : t.calcBasis;
    el.auditBtn.setAttribute("aria-expanded", String(this.showAuditNote));
    el.exportBtn.textContent = t.export;
    el.resetBtn.textContent = t.reset;
    el.auditNote.classList.toggle("hidden", !this.showAuditNote);
    el.auditNote.textContent = t.auditNote;

    el.total.textContent = this.fmt(this.lifetimeStats.revenue);
    el.pageLabel.textContent = t.pageLabel;
    el.pageValue.textContent = this.fmt(this.pageStats.revenue);

    this.renderEntities();
  }

  renderEntities() {
    const { el, t } = this;
    const sorted = Object.entries(this.lifetimeStats.entities || {})
      .map(([name, data]) => ({ name, revenue: (data && data.revenue) || 0 }))
      .filter((e) => e.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);

    el.entities.textContent = "";
    if (sorted.length === 0) {
      const empty = document.createElement("div");
      empty.className = "no-data";
      empty.textContent = t.collecting;
      el.entities.appendChild(empty);
      el.moreBtn.classList.add("hidden");
      return;
    }

    const visible = this.showAll ? sorted : sorted.slice(0, VISIBLE_ROWS);
    visible.forEach((item) => el.entities.appendChild(this.makeRow(item)));

    const hiddenCount = sorted.length - VISIBLE_ROWS;
    el.moreBtn.classList.toggle("hidden", hiddenCount <= 0);
    if (hiddenCount > 0) {
      el.moreBtn.textContent = this.showAll ? t.less : t.more(hiddenCount);
      el.moreBtn.setAttribute("aria-expanded", String(this.showAll));
    }
  }

  makeRow(item) {
    const row = document.createElement("div");
    row.className = "receipt-row";
    const name = document.createElement("span");
    name.className = "company-name";
    name.textContent = item.name.replace(/_/g, " ");
    const value = document.createElement("span");
    value.className = "company-value";
    value.textContent = this.fmt(item.revenue);
    row.append(name, value);
    return row;
  }
}

export default new DataReceiptOverlay();
