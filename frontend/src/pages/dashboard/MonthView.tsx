import { useMemo } from "react"
import type { CSSProperties } from "react"
import { Link } from "react-router-dom"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { useStatsByCategory, useTransactions } from "@/api/hooks"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ExpandableText } from "@/components/expandable-text"
import { formatDate, monthName } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { guessMerchantSnippet } from "@/lib/merchant"
import { cn } from "@/lib/utils"

const CHART_TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  boxShadow: "0 4px 16px rgb(0 0 0 / 0.1)",
  fontSize: 13,
}

export function MonthView({
  year,
  month,
  accountId,
}: {
  year: number
  month: number
  accountId?: number
}) {
  const { t, locale, formatMoney } = useI18n()
  const { data: byCategory, isLoading: byCategoryLoading } = useStatsByCategory({
    year,
    month,
    account_id: accountId,
  })
  const { data: txns, isLoading: txnsLoading } = useTransactions({
    year,
    month,
    account_id: accountId,
    page_size: 1000,
  })

  const expenseSlices = byCategory
    ?.filter((c) => c.kind === "expense" && c.total !== 0)
    .map((c) => ({
      categoryId: c.category_id,
      name: c.name,
      value: Math.abs(c.total),
      color: c.color,
    }))
    .sort((a, b) => b.value - a.value)
  const totalExpenses = expenseSlices?.reduce((sum, s) => sum + s.value, 0) ?? 0

  const topMerchants = useMemo(() => {
    if (!txns) return []
    // Group by a guessed merchant name (stripping statement boilerplate and
    // reference numbers), not the raw description, or every purchase at the
    // same merchant ends up its own "merchant" because of unique per-line
    // reference numbers (see the rule-suggestion snippet guesser).
    const byMerchant = new Map<string, { label: string; cents: number }>()
    for (const t of txns.items) {
      if (t.amount_cents >= 0) continue
      const label = guessMerchantSnippet(t.description_raw)
      const key = label.toLowerCase()
      const existing = byMerchant.get(key)
      if (existing) existing.cents += Math.abs(t.amount_cents)
      else byMerchant.set(key, { label, cents: Math.abs(t.amount_cents) })
    }
    return Array.from(byMerchant.values())
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 10)
  }, [txns])

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.expensesByCategory")}</CardTitle>
          </CardHeader>
          <CardContent>
            {byCategoryLoading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : !expenseSlices?.length ? (
              <p className="text-sm text-muted-foreground">
                {t("dashboard.noExpensesInMonth", { month: monthName(month, locale), year })}
              </p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={220}>
                  <PieChart>
                    <Pie
                      data={expenseSlices}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={1}
                    >
                      {expenseSlices.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} stroke="var(--card)" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatMoney(Number(value))}
                      contentStyle={CHART_TOOLTIP_STYLE}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex-1 space-y-1 text-sm">
                  {expenseSlices.map((s) => (
                    <li key={s.name}>
                      <Link
                        to={`/transactions?year=${year}&month=${month}&category_id=${s.categoryId}${accountId ? `&account_id=${accountId}` : ""}`}
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
                          {formatMoney(s.value)} ·{" "}
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
            <CardTitle className="text-base">{t("dashboard.topMerchants")}</CardTitle>
          </CardHeader>
          <CardContent>
            {txnsLoading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : !topMerchants.length ? (
              <p className="text-sm text-muted-foreground">{t("dashboard.noExpensesThisMonth")}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {topMerchants.map((m) => (
                  <li key={m.label}>
                    <Link
                      to={`/transactions?year=${year}&month=${month}${accountId ? `&account_id=${accountId}` : ""}&q=${encodeURIComponent(m.label)}`}
                      className="-mx-1 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/60"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{m.label || "—"}</span>
                      <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
                        {formatMoney(m.cents)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("dashboard.transactions")}{" "}
            <Link
              to={`/transactions?year=${year}&month=${month}${accountId ? `&account_id=${accountId}` : ""}`}
              className="text-sm font-normal text-primary hover:underline"
            >
              {t("dashboard.viewAll")}
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {txnsLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : !txns?.items.length ? (
            <p className="text-sm text-muted-foreground">{t("dashboard.noTransactionsThisMonth")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.description")}</TableHead>
                  <TableHead className="text-right">{t("common.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.items.slice(0, 20).map((t) => (
                  <TableRow key={t.id} className="hover:bg-accent/40">
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(t.date, locale)}
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <ExpandableText text={t.description_raw} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono whitespace-nowrap",
                        t.amount_cents < 0
                          ? "text-foreground"
                          : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {formatMoney(t.amount_cents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
