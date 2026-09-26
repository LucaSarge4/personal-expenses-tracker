import { toast } from "sonner"

import { useSettings, useUpdateSettings } from "@/api/hooks"
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
  )
}
