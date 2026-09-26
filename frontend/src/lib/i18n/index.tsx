import { createContext, useContext, useMemo } from "react"
import type { ReactNode } from "react"

import { useSettings } from "@/api/hooks"
import { formatMoney as formatMoneyIn, resolveCurrency } from "@/lib/format"
import type { Currency } from "@/lib/format"
import { en } from "@/lib/i18n/en"
import { it } from "@/lib/i18n/it"

export type Locale = "en" | "it"
export const SUPPORTED_LOCALES: Locale[] = ["en", "it"]

const DICTIONARIES: Record<Locale, Record<string, string>> = { en, it }

export function resolveLocale(value: string | undefined | null): Locale {
  return SUPPORTED_LOCALES.includes(value as Locale) ? (value as Locale) : "en"
}

type Vars = Record<string, string | number>

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  )
}

/** Looks up `key` in `locale`'s dictionary, falling back to English, then to
 * the raw key itself (a visible-but-harmless signal during development that
 * a translation is missing, instead of crashing). */
function translate(locale: Locale, key: string, vars?: Vars): string {
  const template = DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key
  return interpolate(template, vars)
}

/** Picks the `_one`/`_other` variant of `key` based on `count`, interpolating
 * `{{count}}` (and any other `vars`) into the result. */
function translateCount(locale: Locale, key: string, count: number, vars?: Vars): string {
  const suffix = count === 1 ? "_one" : "_other"
  return translate(locale, `${key}${suffix}`, { count, ...vars })
}

interface I18nContextValue {
  locale: Locale
  currency: Currency
  t: (key: string, vars?: Vars) => string
  tn: (key: string, count: number, vars?: Vars) => string
  /** Formats signed cents in the configured locale and display currency. */
  formatMoney: (cents: number) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useSettings()
  const locale = resolveLocale(settings?.locale)
  const currency = resolveCurrency(settings?.currency)

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      currency,
      t: (key, vars) => translate(locale, key, vars),
      tn: (key, count, vars) => translateCount(locale, key, count, vars),
      formatMoney: (cents) => formatMoneyIn(cents, locale, currency),
    }),
    [locale, currency],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider")
  return ctx
}

/** Convenience hook for the common case of just needing `t`. */
export function useT() {
  return useI18n().t
}
