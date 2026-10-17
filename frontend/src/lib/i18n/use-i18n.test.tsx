import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useSettings } from "@/api/hooks"
import { useI18n } from "@/lib/i18n"
import { DEFAULT_SETTINGS, mockApi } from "@/test/fake-api"
import { renderWithProviders } from "@/test/render"

type I18n = ReturnType<typeof useI18n>

function Probe({ run }: { run: (i18n: I18n) => string }) {
  return <output>{run(useI18n())}</output>
}

/** Renders `run` inside the providers and waits for `expected`. Intl
 * separates currency codes with a non-breaking space; normalize it. */
async function evaluate(run: (i18n: I18n) => string, expected: string) {
  renderWithProviders(<Probe run={run} />)
  expect(await screen.findByText((text) => text.replace(/ /g, " ") === expected)).toBeInTheDocument()
}

describe("useI18n", () => {
  it("interpolates variables", async () => {
    await evaluate((i) => i.t("import.extracted", { count: 3 }), "3 extracted")
  })

  it("uses the singular form for one and the plural otherwise", async () => {
    await evaluate(
      (i) => `${i.tn("transactions.totalCount", 1)} / ${i.tn("transactions.totalCount", 0)}`,
      "1 transaction / 0 transactions",
    )
  })

  it("falls back to the key itself for unknown strings", async () => {
    await evaluate((i) => i.t("does.not.exist"), "does.not.exist")
  })

  it("translates to Italian and formats money in the configured currency", async () => {
    mockApi({ "GET /api/settings": { ...DEFAULT_SETTINGS, locale: "it", currency: "USD" } })
    await evaluate((i) => `${i.t("nav.settings")} ${i.formatMoney(-123456)}`, "Impostazioni -1234,56 USD")
  })

  it("falls back to English and EUR for unsupported settings", async () => {
    mockApi({ "GET /api/settings": { ...DEFAULT_SETTINGS, locale: "fr", currency: "XYZ" } })
    // Wait until settings have loaded (the second render), then check the fallback held.
    renderWithProviders(<SettingsAware />)
    expect(await screen.findByText("loaded: en EUR €1.00")).toBeInTheDocument()
  })
})

function SettingsAware() {
  const i = useI18n()
  const { data } = useSettings()
  return <output>{data ? `loaded: ${i.locale} ${i.currency} ${i.formatMoney(100)}` : "loading"}</output>
}
