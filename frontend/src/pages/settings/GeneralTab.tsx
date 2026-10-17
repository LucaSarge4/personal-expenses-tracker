import { Check } from "lucide-react"
import { toast } from "sonner"

import { useSettings, useUpdateSettings } from "@/api/hooks"
import { Segmented } from "@/components/segmented"
import { ACCENTS, useTheme } from "@/components/theme-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { resolveCurrency, SUPPORTED_CURRENCIES } from "@/lib/format"
import { SUPPORTED_LOCALES, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  it: "Italiano",
}

export function GeneralTab() {
  const t = useT()
  const { data: settings, isLoading } = useSettings()
  const updateSettings = useUpdateSettings()

  if (isLoading || !settings) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
  }

  const locale = SUPPORTED_LOCALES.includes(settings.locale as (typeof SUPPORTED_LOCALES)[number])
    ? settings.locale
    : "en"
  const currency = resolveCurrency(settings.currency)

  const save = (payload: Record<string, string>) =>
    updateSettings.mutate(payload, {
      onSuccess: () => toast.success(t("settings.toastSaved")),
      onError: (err) => toast.error(err.message),
    })

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.general.title")}</CardTitle>
          <CardDescription>{t("settings.general.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex max-w-xl flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="locale">{t("settings.general.language")}</Label>
            <Select value={locale} onValueChange={(value) => save({ locale: value })}>
              <SelectTrigger id="locale" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LOCALES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {LOCALE_LABELS[l] ?? l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency">{t("settings.general.currency")}</Label>
            <Select value={currency} onValueChange={(value) => save({ currency: value })}>
              <SelectTrigger id="currency" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("settings.general.currencyHint")}</p>
          </div>
        </CardContent>
      </Card>
      <AppearanceCard />
    </div>
  )
}

/** Applied instantly and remembered per browser, like the light/dark choice. */
function AppearanceCard() {
  const t = useT()
  const { theme, toggleTheme, accent, setAccent } = useTheme()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.appearance.title")}</CardTitle>
        <CardDescription>{t("settings.appearance.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex max-w-xl flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("settings.appearance.theme")}</span>
          <Segmented
            label={t("settings.appearance.theme")}
            value={theme}
            onChange={(next) => next !== theme && toggleTheme()}
            options={[
              { value: "light", label: t("settings.appearance.light") },
              { value: "dark", label: t("settings.appearance.dark") },
            ]}
            className="w-56"
          />
        </div>
        <div className="flex flex-col gap-2">
          <span id="accent-label" className="text-sm font-medium">
            {t("settings.appearance.accent")}
          </span>
          <div role="radiogroup" aria-labelledby="accent-label" className="flex flex-wrap gap-3">
            {ACCENTS.map((name) => {
              const selected = name === accent
              const label = t(`settings.appearance.accents.${name}`)
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={label}
                  title={label}
                  data-accent={name}
                  onClick={() => setAccent(name)}
                  className={cn(
                    "grid size-8 place-items-center rounded-full bg-[var(--accent-color)] text-white transition-transform outline-none hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    selected && "ring-2 ring-[var(--accent-color)] ring-offset-2 ring-offset-card",
                  )}
                >
                  {selected && <Check className="size-4" strokeWidth={3} />}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.appearance.accentHint")}</p>
        </div>
      </CardContent>
    </Card>
  )
}
