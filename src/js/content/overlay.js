import "./fonts.css";
import overlayCss from "./content.css?inline";
import { jsPDF } from "jspdf";
import { PROJECT_NAME, SUPPORTED_LANGS, getTranslation } from "./i18n.js";
import { SUPPORTED_CURRENCIES, formatCurrency } from "./currency.js";

class DataReceiptOverlay {
  constructor() {
    this.didInit = false;
    this.enabled = true;
    this.isMinimized = false;
    this.showAuditNote = false;
    this.showAllProfiteers = false;

    this.sessionStats = { total: 0, revenue: 0 };
    this.lifetimeStats = { total: 0, revenue: 0, entities: {} };

    const browserLang = (navigator.language || "").split("-")[0].toUpperCase();
    this.language = SUPPORTED_LANGS.includes(browserLang) ? browserLang : "EN";
    this.currency = "USD";

    this.setupMessageListener();
    this.loadData();

    if (document.readyState === "complete" || document.readyState === "interactive") {
      this.init();
    } else {
      window.addEventListener("load", () => this.init());
    }
  }

  get t() {
    return getTranslation(this.language);
  }

  fmt(val, precision = 2) {
    return formatCurrency(val, this.currency, precision);
  }

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------

  loadData() {
    chrome.storage.local.get(["lifetime_stats", "settings", "enabled"], (res) => {
      if (
        res.lifetime_stats &&
        typeof res.lifetime_stats.revenue === "number" &&
        typeof res.lifetime_stats.entities === "object" &&
        res.lifetime_stats.entities !== null
      ) {
        this.lifetimeStats = res.lifetime_stats;
      }
      if (res.settings && typeof res.settings === "object") {
        const lang = res.settings.language;
        const curr = res.settings.currency;
        if (typeof lang === "string" && SUPPORTED_LANGS.includes(lang)) this.language = lang;
        if (typeof curr === "string" && SUPPORTED_CURRENCIES.includes(curr)) this.currency = curr;
      }
      this.enabled = res.enabled !== false;
      if (this.didInit) {
        this.uiContainer.style.display = this.enabled ? "" : "none";
        this.langSelect.value = this.language;
        this.currSelect.value = this.currency;
        this.updateStaticText();
        this.updateStats();
      }
    });
  }

  saveSettings() {
    chrome.storage.local.set({ settings: { language: this.language, currency: this.currency } });
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender) => {
      if (sender.id !== chrome.runtime.id) return;
      if (message.type === "TRACKER_DETECTED") this.onTrackerDetected(message);
      else if (message.type === "TOGGLE_TOPOGRAPHY") this.toggle();
    });
  }

  onTrackerDetected(data) {
    if (
      !data ||
      typeof data.weight !== "number" ||
      !data.lifetime_stats ||
      typeof data.lifetime_stats.revenue !== "number" ||
      typeof data.lifetime_stats.entities !== "object" ||
      data.lifetime_stats.entities === null
    ) return;
    this.sessionStats.total++;
    this.sessionStats.revenue += data.weight;
    this.lifetimeStats = data.lifetime_stats;
    if (this.didInit) this.updateStats();
  }

  // ---------------------------------------------------------------------------
  // UI — init
  // ---------------------------------------------------------------------------

  init() {
    if (this.didInit) return;

    this.container = document.createElement("div");
    this.container.id = "receipt-root";
    // Closed shadow root: page scripts cannot read stats/entity names or trigger buttons
    const shadow = this.container.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = overlayCss;
    shadow.appendChild(style);

    this.uiContainer = document.createElement("div");
    this.uiContainer.id = "digital-receipt";
    this.uiContainer.innerHTML = this.buildTemplate();
    shadow.appendChild(this.uiContainer);
    document.body.appendChild(this.container);

    this.totalRevenueEl     = this.uiContainer.querySelector("#total-revenue-display");
    this.sessionRevenueEl   = this.uiContainer.querySelector("#session-revenue-note");
    this.entitiesListEl     = this.uiContainer.querySelector("#entities-list");
    this.auditNoteEl        = this.uiContainer.querySelector("#audit-note-content");
    this.auditToggleBtn     = this.uiContainer.querySelector("#audit-toggle-btn");
    this.profiteerToggleBtn = this.uiContainer.querySelector("#profiteer-toggle-btn");
    this.langSelect         = this.uiContainer.querySelector("#lang-select");
    this.currSelect         = this.uiContainer.querySelector("#curr-select");
    this.exportBtn          = this.uiContainer.querySelector("#export-btn");
    this.resetBtn           = this.uiContainer.querySelector("#reset-btn");
    this.minimizeBtn        = this.uiContainer.querySelector("#minimize-btn");

    this.bindEvents();

    this.langSelect.value = this.language;
    this.currSelect.value = this.currency;
    this.didInit = true;
    this.updateStaticText();
    this.updateStats();
  }

  buildTemplate() {
    // Safe: SUPPORTED_LANGS and SUPPORTED_CURRENCIES are hardcoded string arrays —
    // not sourced from storage, user input, or the network. No XSS risk.
    const langOptions = SUPPORTED_LANGS.map((l) => `<option value="${l}">${l}</option>`).join("");
    const currOptions = SUPPORTED_CURRENCIES.map((c) => `<option value="${c}">${c}</option>`).join("");
    return `
      <div class="receipt-header">
        <div class="header-left">
          <div class="project-name">${PROJECT_NAME}</div>
          <div class="receipt-title"></div>
        </div>
        <button id="minimize-btn"></button>
      </div>
      <div id="receipt-body">
        <div class="main-stats">
          <div class="label"></div>
          <div id="total-revenue-display">$0.00</div>
          <div id="session-revenue-note"></div>
        </div>
        <div class="divider"></div>
        <div class="breakdown-section">
          <div class="section-title"></div>
          <div id="entities-list"></div>
          <button id="profiteer-toggle-btn" class="secondary-toggle hidden"></button>
        </div>
        <div class="settings-row">
          <select id="lang-select" class="receipt-select">${langOptions}</select>
          <select id="curr-select" class="receipt-select">${currOptions}</select>
        </div>
        <div class="footer-links">
          <button id="audit-toggle-btn" class="footer-link"></button>
          <span class="sep">|</span>
          <button id="export-btn" class="footer-link"></button>
          <span class="sep">|</span>
          <button id="reset-btn" class="footer-link danger"></button>
        </div>
        <div id="audit-note-content" class="audit-note hidden"></div>
      </div>
    `;
  }

  bindEvents() {
    this.minimizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.isMinimized = !this.isMinimized;
      this.uiContainer.classList.toggle("minimized", this.isMinimized);
    });

    this.langSelect.addEventListener("change", (e) => {
      this.language = e.target.value;
      this.saveSettings();
      this.updateStaticText();
      this.updateStats();
    });

    this.currSelect.addEventListener("change", (e) => {
      this.currency = e.target.value;
      this.saveSettings();
      this.updateStats();
    });

    this.exportBtn.addEventListener("click", () => this.downloadPDF());

    this.resetBtn.addEventListener("click", () => {
      if (confirm(this.t.resetConfirm)) {
        chrome.storage.local.clear(() => {
          this.lifetimeStats = { total: 0, revenue: 0, entities: {} };
          this.sessionStats  = { total: 0, revenue: 0 };
          this.saveSettings();
          this.updateStats();
        });
      }
    });

    this.auditToggleBtn.addEventListener("click", () => {
      this.showAuditNote = !this.showAuditNote;
      this.auditNoteEl.classList.toggle("hidden", !this.showAuditNote);
      this.updateStaticText();
    });

    this.profiteerToggleBtn.addEventListener("click", () => {
      this.showAllProfiteers = !this.showAllProfiteers;
      this.updateStats();
    });
  }

  // ---------------------------------------------------------------------------
  // UI — updates
  // ---------------------------------------------------------------------------

  updateStaticText() {
    if (!this.didInit) return;
    const t = this.t;
    this.uiContainer.querySelector(".receipt-title").textContent      = t.title;
    this.uiContainer.querySelector(".main-stats .label").textContent  = t.totalLabel;
    this.uiContainer.querySelector(".section-title").textContent      = t.topProfiteers;
    this.auditToggleBtn.textContent     = this.showAuditNote ? t.close : t.calcBasis;
    this.exportBtn.textContent          = t.export;
    this.resetBtn.textContent           = t.reset;

    this.auditNoteEl.textContent = "";
    const strong = document.createElement("strong");
    strong.textContent = t.calcBasis + ":";
    this.auditNoteEl.appendChild(strong);
    this.auditNoteEl.appendChild(document.createElement("br"));
    this.auditNoteEl.appendChild(document.createTextNode(t.auditNote));
  }

  updateStats() {
    if (!this.didInit) return;
    const t = this.t;

    this.totalRevenueEl.textContent = this.fmt(this.lifetimeStats.revenue || 0);

    // sessionNote contains one <strong> — build with DOM instead of innerHTML
    this.sessionRevenueEl.textContent = "";
    const sessionText = t.sessionNote(this.fmt(this.sessionStats.revenue, 3));
    sessionText.split(/<strong>|<\/strong>/).forEach((part, i) => {
      if (i % 2 === 1) {
        const s = document.createElement("strong");
        s.textContent = part;
        this.sessionRevenueEl.appendChild(s);
      } else {
        this.sessionRevenueEl.appendChild(document.createTextNode(part));
      }
    });

    const entities = this.lifetimeStats.entities || {};
    const sorted = Object.entries(entities)
      .map(([name, data]) => ({ name, revenue: typeof data === "object" ? data.revenue || 0 : 0 }))
      .filter((e) => e.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);

    this.entitiesListEl.textContent = "";

    if (sorted.length === 0) {
      const empty = document.createElement("div");
      empty.className = "no-data";
      empty.textContent = t.collecting;
      this.entitiesListEl.appendChild(empty);
      this.profiteerToggleBtn.classList.add("hidden");
      return;
    }

    sorted.slice(0, 10).forEach((item) => this.entitiesListEl.appendChild(this.makeRow(item)));

    const others = sorted.slice(10);
    if (others.length > 0) {
      this.profiteerToggleBtn.classList.remove("hidden");
      this.profiteerToggleBtn.textContent = this.showAllProfiteers ? t.less : t.more(others.length);
      if (this.showAllProfiteers) {
        others.forEach((item) => this.entitiesListEl.appendChild(this.makeRow(item, true)));
      }
    } else {
      this.profiteerToggleBtn.classList.add("hidden");
    }
  }

  makeRow(item, extended = false) {
    const row = document.createElement("div");
    row.className = extended ? "receipt-row extended" : "receipt-row";
    const name = document.createElement("span");
    name.className = "company-name";
    name.textContent = item.name.replace(/_/g, " ");
    const value = document.createElement("span");
    value.className = "company-value";
    value.textContent = this.fmt(item.revenue, 4);
    row.appendChild(name);
    row.appendChild(value);
    return row;
  }

  toggle() {
    this.enabled = !this.enabled;
    this.uiContainer.style.display = this.enabled ? "" : "none";
  }

  // ---------------------------------------------------------------------------
  // PDF export
  // ---------------------------------------------------------------------------

  downloadPDF() {
    try {
      const t = this.t;
      const doc = new jsPDF();
      const date = new Date().toLocaleDateString();

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      doc.text(PROJECT_NAME.toUpperCase(), 20, 20);

      doc.setFontSize(24);
      doc.setTextColor(0, 0, 0);
      doc.text(t.exportTitle, 20, 35);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(180, 180, 180);
      doc.text(`${date} | Audit v1.6`, 20, 45);

      doc.setFontSize(32);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(this.fmt(this.lifetimeStats.revenue), 20, 70);

      doc.setFontSize(12);
      doc.text(t.totalLabel.toUpperCase(), 20, 80);
      doc.setLineWidth(0.5);
      doc.line(20, 95, 190, 95);

      let y = 110;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const sorted = Object.entries(this.lifetimeStats.entities || {})
        .sort((a, b) => b[1].revenue - a[1].revenue);

      for (const [name, data] of sorted) {
        if (y > 270) { doc.addPage(); y = 30; }
        doc.text(name.toUpperCase(), 20, y);
        doc.text(this.fmt(data.revenue, 4), 190, y, { align: "right" });
        y += 10;
      }

      doc.save("DataReceipt-Audit.pdf");
    } catch (e) {
      console.error("PDF export failed:", e);
    }
  }
}

export default new DataReceiptOverlay();
