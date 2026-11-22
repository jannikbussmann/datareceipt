import { SUPPORTED_LANGS, getTranslation } from "./content/i18n.js";
import {
  SUPPORTED_CURRENCIES,
  formatCurrency,
  getLocale,
} from "./content/currency.js";

const $ = (id) => document.getElementById(id);

chrome.storage.local.get(["lifetime_stats", "settings"], (res) => {
  const s = res.settings || {};
  const browserLang = (navigator.language || "").split("-")[0].toUpperCase();
  const lang = SUPPORTED_LANGS.includes(s.language)
    ? s.language
    : SUPPORTED_LANGS.includes(browserLang)
      ? browserLang
      : "EN";
  const currency = SUPPORTED_CURRENCIES.includes(s.currency)
    ? s.currency
    : "USD";
  const t = getTranslation(lang);
  const fmt = (usd) => formatCurrency(usd, currency, lang);
  const stats = res.lifetime_stats || { revenue: 0, entities: {} };

  document.documentElement.lang = getLocale(lang);
  document.title = `DataReceipt — ${t.title}`;
  $("r-tagline").textContent = t.title;
  $("r-date").textContent = new Intl.DateTimeFormat(getLocale(lang), {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
  $("r-total").textContent = fmt(stats.revenue);
  $("r-total-label").textContent = t.totalLabel;
  $("r-col-company").textContent = t.exportCompany;
  $("r-col-value").textContent = t.exportValue;
  $("r-total-bottom").textContent = fmt(stats.revenue);
  $("r-note").textContent = `${t.calcBasis}: ${t.auditNote}`;
  $("r-print").textContent = t.print;

  const list = $("r-list");
  const sorted = Object.entries(stats.entities || {})
    .map(([name, d]) => ({ name, revenue: (d && d.revenue) || 0 }))
    .filter((e) => e.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  if (sorted.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t.collecting;
    list.appendChild(empty);
  }
  for (const item of sorted) {
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("span");
    name.textContent = item.name.replace(/_/g, " ");
    const value = document.createElement("span");
    value.textContent = fmt(item.revenue);
    row.append(name, value);
    list.appendChild(row);
  }
});

$("r-print").addEventListener("click", () => window.print());
