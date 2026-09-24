import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { CSSProperties } from "react"
import { Link } from "react-router-dom"

import { useStatsByCategory, useStatsGrid, useStatsMonthly } from "@/api/hooks"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatEUR, MONTH_NAMES_SHORT } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { CategoryGrid } from "@/pages/dashboard/CategoryGrid"

const CHART_COLORS = {
  income: "#34c759",
  expenses: "#ff9500",
  net: "#0a84ff",
}

const CHART_TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  boxShadow: "0 4px 16px rgb(0 0 0 / 0.1)",
  fontSize: 13,
}

export function YearView({ year, accountId }: { year: number; accountId?: number }) {
  const { t, locale } = useI18n()
  const { data: monthly, isLoading: monthlyLoading } = useStatsMonthly({
    year,
    account_id: accountId,
  })
  const { data: byCategory, isLoading: byCategoryLoading } = useStatsByCategory({
    year,
    account_id: accountId,
  })
  const { data: grid, isLoading: gridLoading } = useStatsGrid({ year, account_id: accountId })

  const chartData = monthly?.map((m) => ({
    month: MONTH_NAMES_SHORT[locale][m.month - 1],
    Income: m.income / 100,
    Expenses: m.expenses / 100,
    Net: m.net / 100,
  }))

  const expenseSlices = byCategory
    ?.filter((c) => c.kind === "expense" && c.total !== 0)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .map((c) => ({
      categoryId: c.category_id,
      name: c.name,
      value: Math.abs(c.total),
      color: c.color,
    }))
  const totalExpenses = expenseSlices?.reduce((sum, s) => sum + s.value, 0) ?? 0

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.incomeVsExpenses")}</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/60" />
                <XAxis
                  dataKey="month"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <YAxis
                  fontSize={12}
                  tickFormatter={(v) => formatEUR(v * 100, locale)}
                  width={80}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <Tooltip
                  formatter={(value) => formatEUR(Number(value) * 100, locale)}
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                />
                <Bar dataKey="Income" fill={CHART_COLORS.income} radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Expenses" fill={CHART_COLORS.expenses} radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Line
                  type="monotone"
                  dataKey="Net"
                  stroke={CHART_COLORS.net}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.expensesByCategory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {byCategoryLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : !expenseSlices?.length ? (
            <p className="text-sm text-muted-foreground">{t("dashboard.noExpensesThisYear")}</p>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <ResponsiveContainer width="100%" height={260} className="sm:max-w-xs">
                <PieChart>
                  <Pie
                    data={expenseSlices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={1}
                  >
                    {expenseSlices.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} stroke="var(--card)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatEUR(Number(value), locale)}
                    contentStyle={CHART_TOOLTIP_STYLE}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="w-full flex-1 space-y-1 text-sm">
                {expenseSlices.map((s) => (
                  <li key={s.name}>
                    <Link
                      to={`/transactions?year=${year}&category_id=${s.categoryId}${accountId ? `&account_id=${accountId}` : ""}`}
                      className="-mx-1 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/60"
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
                        <span
                          className="inline-block size-2.5 shrink-0 rounded-full ring-4"
                          style={{ backgroundColor: s.color, "--tw-ring-color": `${s.color}1a` } as CSSProperties}
                        />
                        <span className="min-w-0 truncate font-medium">{s.name}</span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
                        {formatEUR(s.value, locale)} ·{" "}
                        {totalExpenses ? Math.round((s.value / totalExpenses) * 100) : 0}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.categoryByMonth")}</CardTitle>
        </CardHeader>
        <CardContent>
          {gridLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : grid ? (
            <CategoryGrid grid={grid} year={year} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
