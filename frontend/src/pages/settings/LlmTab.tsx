import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useLlmModels, useSettings, useTestLlmConnection, useUpdateSettings } from "@/api/hooks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useT } from "@/lib/i18n"

const PRESETS = [
  { label: "Ollama", url: "http://localhost:11434/v1" },
  { label: "LM Studio", url: "http://localhost:1234/v1" },
]

function isLocalUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === "localhost" || hostname === "127.0.0.1"
  } catch {
    return false
  }
}

export function LlmTab() {
  const t = useT()
  const { data: settings, isLoading } = useSettings()
  const updateSettings = useUpdateSettings()
  const { data: models, refetch: refetchModels, isFetching: modelsLoading } = useLlmModels()
  const testConnection = useTestLlmConnection()

  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState("")

  useEffect(() => {
    if (!settings) return
    setBaseUrl(settings.llm_base_url ?? "")
    setApiKey(settings.llm_api_key ?? "")
    setModel(settings.llm_model ?? "")
  }, [settings])

  const dirty =
    settings &&
    (baseUrl !== settings.llm_base_url ||
      apiKey !== (settings.llm_api_key ?? "") ||
      model !== settings.llm_model)

  const handleSave = () => {
    updateSettings.mutate(
      { llm_base_url: baseUrl, llm_api_key: apiKey, llm_model: model },
      {
        onSuccess: () => toast.success(t("settings.toastSaved")),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  const handleTest = () => {
    testConnection.mutate(undefined, {
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(t("settings.llm.toastConnectionOk", { ms: result.latency_ms ?? 0 }))
        } else {
          toast.error(result.error ?? t("settings.llm.toastConnectionFailed"))
        }
      },
      onError: (err) => toast.error(err.message),
    })
  }

  if (isLoading || !settings) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.llm.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex max-w-xl flex-col gap-4">
        {!isLocalUrl(baseUrl) && baseUrl && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t("settings.llm.notLocalWarning")}
          </div>
        )}

        <div className="flex gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant={baseUrl === preset.url ? "default" : "outline"}
              size="sm"
              onClick={() => setBaseUrl(preset.url)}
            >
              {preset.label}
            </Button>
          ))}
          <Button
            type="button"
            variant={
              !PRESETS.some((p) => p.url === baseUrl) ? "default" : "outline"
            }
            size="sm"
            onClick={() => setBaseUrl("")}
          >
            {t("settings.llm.custom")}
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="base-url">{t("settings.llm.baseUrl")}</Label>
          <Input
            id="base-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:11434/v1"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="api-key">{t("settings.llm.apiKey")}</Label>
          <Input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t("settings.llm.apiKeyPlaceholder")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="model">{t("settings.llm.model")}</Label>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => refetchModels()}
              disabled={modelsLoading}
            >
              {modelsLoading ? t("settings.llm.refreshing") : t("settings.llm.refreshList")}
            </Button>
          </div>
          {models?.length ? (
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model" className="w-full">
                <SelectValue placeholder={t("settings.llm.selectModel")} />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. gemma4:26b-a4b-it-qat"
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={!dirty || updateSettings.isPending}>
            {t("common.save")}
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testConnection.isPending}>
            {testConnection.isPending ? t("settings.llm.testing") : t("settings.llm.testConnection")}
          </Button>
          {testConnection.data && (
            <Badge variant={testConnection.data.ok ? "default" : "destructive"}>
              {testConnection.data.ok
                ? t("settings.llm.ok", { ms: testConnection.data.latency_ms ?? 0 })
                : t("settings.llm.failed")}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
