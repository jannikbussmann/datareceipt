// Fixed exchange rates (USD base, 2024). Values are order-of-magnitude
// estimates, so live rates would add network access without adding accuracy.
const RATES = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 151.4,
  CHF: 0.9,
  CNY: 7.23,
  KRW: 1350.5,
  CAD: 1.36,
  AUD: 1.52,
  BRL: 5.01,
  INR: 83.3,
  RUB: 92.4,
  TRY: 32.2,
  AED: 3.67,
  MXN: 16.6,
  SGD: 1.35,
};

const LOCALES = {
  DE: "de-DE",
  EN: "en-US",
  FR: "fr-FR",
  ES: "es-ES",
  IT: "it-IT",
  NL: "nl-NL",
  PT: "pt-PT",
  RU: "ru-RU",
  TR: "tr-TR",
  ZH: "zh-CN",
  JA: "ja-JP",
  KO: "ko-KR",
};

export const SUPPORTED_CURRENCIES = Object.keys(RATES);

export const getLocale = (lang) => LOCALES[lang] || "en-US";

/** Amounts below 1 are shown with 2 significant digits (e.g. 0.0053 €) — more would imply false precision. */
export const formatCurrency = (usd, currency, lang) => {
  const amount = (usd || 0) * (RATES[currency] || 1);
  const small = amount > 0 && amount < 1;
  return new Intl.NumberFormat(getLocale(lang), {
    style: "currency",
    currency: RATES[currency] ? currency : "USD",
    ...(small
      ? { maximumSignificantDigits: 2 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }).format(amount);
};
