import { ChevronLeft, ChevronRight, Upload } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"

import { useAccounts, useStatsSummary, useTransactions } from "@/api/hooks"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { monthName } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { MonthView } from "@/pages/dashboard/MonthView"
import { Kpi } from "@/pages/dashboard/Kpi"
import { YearView } from "@/pages/dashboard/YearView"

const ALL = "all"

function currentYear() {
  return new Date().getFullYear()
}
function currentMonth() {
  return new Date().getMonth() + 1
}

export function Dashboard() {
  const { t, locale } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: accounts } = useAccounts()
  const { data: anyTxns, isLoading: checkingEmpty } = useTransactions({ page_size: 1 })

  const period = searchParams.get("period") === "month" ? "month" : "year"
  const year = Number(searchParams.get("year") ?? currentYear())
  const month = Number(searchParams.get("month") ?? currentMonth())
  const accountIdParam = searchParams.get("account_id")
  const accountId = accountIdParam ? Number(accountIdParam) : undefined

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (value === null || value === ALL) next.delete(key)
    else next.set(key, value)
    setSearchParams(next)
  }

  const goPrev = () => {
    if (period === "year") {
      setParam("year", String(year - 1))
    } else if (month === 1) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set("year", String(year - 1))
        next.set("month", "12")
        return next
      })
    } else {
      setParam("month", String(month - 1))
    }
  }
  const goNext = () => {
    if (period === "year") {
      setParam("year", String(year + 1))
    } else if (month === 12) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set("year", String(year + 1))
        next.set("month", "1")
        return next
      })
    } else {
      setParam("month", String(month + 1))
    }
  }

  const { data: summary } = useStatsSummary({
    year,
    month: period === "month" ? month : undefined,
    account_id: accountId,
  })

  if (!checkingEmpty && anyTxns?.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">{t("dashboard.emptyTitle")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("dashboard.emptyDescription")}</p>
        <Button asChild>
          <Link to="/import">
            <Upload className="mr-1.5 size-4" />
            {t("dashboard.emptyCta")}
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={period} onValueChange={(v) => setParam("period", v === "year" ? null : v)}>
            <TabsList>
              <TabsTrigger value="year">{t("dashboard.periodYear")}</TabsTrigger>
              <TabsTrigger value="month">{t("dashboard.periodMonth")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-8" onClick={goPrev}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="w-32 text-center text-sm font-medium">
              {period === "year" ? year : `${monthName(month, locale)} ${year}`}
            </span>
            <Button variant="outline" size="icon" className="size-8" onClick={goNext}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Select value={accountIdParam ?? ALL} onValueChange={(v) => setParam("account_id", v)}>
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
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi
            label={t("dashboard.kpiIncome")}
            cents={summary.income}
            prevCents={summary.prev.income}
            accent="green"
          />
          <Kpi
            label={t("dashboard.kpiExpenses")}
            cents={summary.expenses}
            prevCents={summary.prev.expenses}
            goodDirection="down"
            accent="orange"
          />
          <Kpi
            label={t("dashboard.kpiNet")}
            cents={summary.net}
            prevCents={summary.prev.net}
            accent="blue"
          />
          <Kpi
            label={t("dashboard.kpiSavingsRate")}
            cents={summary.savings_rate}
            prevCents={summary.prev.savings_rate}
            isPercent
            accent="purple"
          />
        </div>
      )}

      {period === "year" ? (
        <YearView year={year} accountId={accountId} />
      ) : (
        <MonthView year={year} month={month} accountId={accountId} />
      )}
    </div>
  )
}
