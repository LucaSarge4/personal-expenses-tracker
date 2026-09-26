export type FormatLocale = "en" | "it"

const INTL_LOCALE: Record<FormatLocale, string> = { en: "en-US", it: "it-IT" }

/** Display currencies offered in Settings. All use 2 minor-unit digits, so
 * `amount_cents / 100` is always the right major-unit value. */
export const SUPPORTED_CURRENCIES = [
  "EUR", "USD", "GBP", "CHF", "CAD", "AUD", "SEK", "NOK", "DKK", "PLN",
] as const
export type Currency = (typeof SUPPORTED_CURRENCIES)[number]

export function resolveCurrency(value: string | undefined | null): Currency {
  return SUPPORTED_CURRENCIES.includes(value as Currency) ? (value as Currency) : "EUR"
}

const MONEY_FORMATTERS = new Map<string, Intl.NumberFormat>()

function moneyFormatter(locale: FormatLocale, currency: Currency): Intl.NumberFormat {
  const key = `${locale}:${currency}`
  let formatter = MONEY_FORMATTERS.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(INTL_LOCALE[locale], { style: "currency", currency })
    MONEY_FORMATTERS.set(key, formatter)
  }
  return formatter
}

const DATE_FORMATTERS: Record<FormatLocale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat(INTL_LOCALE.en, { day: "2-digit", month: "2-digit", year: "numeric" }),
  it: new Intl.DateTimeFormat(INTL_LOCALE.it, { day: "2-digit", month: "2-digit", year: "numeric" }),
}

export function formatMoney(
  cents: number,
  locale: FormatLocale = "en",
  currency: Currency = "EUR",
): string {
  return moneyFormatter(locale, currency).format(cents / 100)
}

export function formatDate(isoDate: string, locale: FormatLocale = "en"): string {
  return DATE_FORMATTERS[locale].format(new Date(`${isoDate}T00:00:00`))
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

export const MONTH_NAMES: Record<FormatLocale, string[]> = {
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
  it: [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
  ],
}

export const MONTH_NAMES_SHORT: Record<FormatLocale, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  it: ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"],
}

export function monthName(month: number, locale: FormatLocale = "en", short = false): string {
  const names = short ? MONTH_NAMES_SHORT[locale] : MONTH_NAMES[locale]
  return names[month - 1] ?? String(month)
}

/** Percent change from prev to current, or null when prev is 0 (undefined base). */
export function deltaPercent(current: number, prev: number): number | null {
  if (prev === 0) return null
  return (current - prev) / Math.abs(prev)
}
