import { Lightbulb, Sparkles } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { useAccounts, useAdvice } from "@/api/hooks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { monthName } from "@/lib/format"
import { useI18n } from "@/lib/i18n"

const ALL = "all"
type Period = "all" | "year" | "month"

function currentYear() {
  return new Date().getFullYear()
}
function currentMonth() {
  return new Date().getMonth() + 1
}

export function Advice() {
  const { t, locale } = useI18n()
  const { data: accounts } = useAccounts()
  const advice = useAdvice()

  const [period, setPeriod] = useState<Period>("month")
  const [year, setYear] = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [accountId, setAccountId] = useState<string>(ALL)
  const [question, setQuestion] = useState("")

  const runAnalysis = () => {
    advice.mutate(
      {
        period,
        year: period !== "all" ? year : undefined,
        month: period === "month" ? month : undefined,
        account_id: accountId !== ALL ? Number(accountId) : undefined,
        question: question.trim() || undefined,
        locale,
      },
      { onError: (err) => toast.error(err.message) },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("advice.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("advice.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("advice.period")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <TabsList>
                <TabsTrigger value="all">{t("advice.periodAll")}</TabsTrigger>
                <TabsTrigger value="year">{t("dashboard.periodYear")}</TabsTrigger>
                <TabsTrigger value="month">{t("dashboard.periodMonth")}</TabsTrigger>
              </TabsList>
            </Tabs>

            {period !== "all" && (
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-24"
              />
            )}
            {period === "month" && (
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {monthName(m, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t("common.allAccounts")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("common.allAccounts")}</SelectItem>
                {accounts?.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("advice.customQuestion")}</label>
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t("advice.customQuestionPlaceholder")}
              rows={2}
            />
          </div>

          <Button onClick={runAnalysis} disabled={advice.isPending} className="w-fit">
            <Sparkles className="mr-1.5 size-4" />
            {advice.isPending ? t("advice.analyzing") : t("advice.startAnalysis")}
          </Button>
        </CardContent>
      </Card>

      {advice.isPending && <p className="text-sm text-muted-foreground">{t("advice.analyzingHint")}</p>}

      {advice.data && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4 text-primary" />
              {advice.data.period_label}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed">{advice.data.summary}</p>
            {advice.data.items.length > 0 && (
              <ul className="flex flex-col gap-3">
                {advice.data.items.map((item, i) => (
                  <li key={i} className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
