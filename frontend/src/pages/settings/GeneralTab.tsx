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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.general.title")}</CardTitle>
        <CardDescription>{t("settings.general.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex max-w-xl flex-col gap-1.5">
        <Label htmlFor="locale">{t("settings.general.language")}</Label>
        <Select
          value={locale}
          onValueChange={(value) =>
            updateSettings.mutate(
              { locale: value },
              {
                onSuccess: () => toast.success(t("settings.toastSaved")),
                onError: (err) => toast.error(err.message),
              },
            )
          }
        >
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
      </CardContent>
    </Card>
  )
}
