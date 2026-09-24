export type FormatLocale = "en" | "it"

const INTL_LOCALE: Record<FormatLocale, string> = { en: "en-US", it: "it-IT" }

const EUR_FORMATTERS: Record<FormatLocale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat(INTL_LOCALE.en, { style: "currency", currency: "EUR" }),
  it: new Intl.NumberFormat(INTL_LOCALE.it, { style: "currency", currency: "EUR" }),
}

const DATE_FORMATTERS: Record<FormatLocale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat(INTL_LOCALE.en, { day: "2-digit", month: "2-digit", year: "numeric" }),
  it: new Intl.DateTimeFormat(INTL_LOCALE.it, { day: "2-digit", month: "2-digit", year: "numeric" }),
}

export function formatEUR(cents: number, locale: FormatLocale = "en"): string {
  return EUR_FORMATTERS[locale].format(cents / 100)
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
