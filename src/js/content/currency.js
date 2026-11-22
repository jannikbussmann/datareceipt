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

const SYMBOLS = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CHF: "Fr",
  CNY: "¥",
  KRW: "₩",
  CAD: "C$",
  AUD: "A$",
  BRL: "R$",
  INR: "₹",
  RUB: "₽",
  TRY: "₺",
  AED: "د.إ",
  MXN: "$",
  SGD: "S$",
};

const NO_DECIMALS = new Set(["JPY", "KRW"]);

export const SUPPORTED_CURRENCIES = Object.keys(RATES);

export const formatCurrency = (val, currency, precision = 2) => {
  const amount = val * (RATES[currency] || 1);
  const sym = SYMBOLS[currency] || "$";
  return NO_DECIMALS.has(currency)
    ? `${sym}${Math.round(amount)}`
    : `${sym}${amount.toFixed(precision)}`;
};
