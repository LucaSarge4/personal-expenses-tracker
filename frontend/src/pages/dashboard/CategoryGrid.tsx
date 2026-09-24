import { Link } from "react-router-dom"

import type { GridResponse, GridRow, GroupSubtotal } from "@/api/types"
import { formatEUR, MONTH_NAMES_SHORT } from "@/lib/format"
import type { FormatLocale } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type LineItem =
  | { kind: "row"; row: GridRow }
  | { kind: "subtotal"; subtotal: GroupSubtotal }

function withSubtotals(rows: GridRow[], subtotals: GroupSubtotal[]): LineItem[] {
  const byGroup = new Map(subtotals.map((s) => [s.group, s]))
  const items: LineItem[] = []
  rows.forEach((row, i) => {
    items.push({ kind: "row", row })
    const nextGroup = rows[i + 1]?.group ?? null
    if (row.group && row.group !== nextGroup) {
      const subtotal = byGroup.get(row.group)
      if (subtotal) items.push({ kind: "subtotal", subtotal })
    }
  })
  return items
}

function Cell({
  value,
  locale,
  href,
}: {
  value: number
  locale: FormatLocale
  href?: string
}) {
  if (value === 0) {
    return <td className="px-2 py-1 text-right text-sm text-muted-foreground/60">–</td>
  }
  const content = formatEUR(value, locale)
  return (
    <td className="px-2 py-1 text-right text-sm tabular-nums">
      {href ? (
        <Link to={href} className="hover:underline">
          {content}
        </Link>
      ) : (
        content
      )}
    </td>
  )
}

function SectionRows({
  items,
  year,
  locale,
  totalLabel,
}: {
  items: LineItem[]
  year: number
  locale: FormatLocale
  totalLabel: string
}) {
  return (
    <>
      {items.map((item, idx) =>
        item.kind === "row" ? (
          <tr key={`row-${item.row.category_id}`} className="border-b border-border/50">
            <td className="sticky left-0 z-10 bg-background px-2 py-1 text-sm">
              <span
                className="mr-1.5 inline-block size-2 rounded-full align-middle"
                style={{ backgroundColor: item.row.color }}
              />
              {item.row.name}
            </td>
            {item.row.months.map((value, m) => (
              <Cell
                key={m}
                value={value}
                locale={locale}
                href={
                  value !== 0
                    ? `/transactions?year=${year}&month=${m + 1}&category_id=${item.row.category_id}`
                    : undefined
                }
              />
            ))}
            <Cell value={item.row.total} locale={locale} />
          </tr>
        ) : (
          <tr key={`subtotal-${item.subtotal.group}-${idx}`} className="border-b bg-muted/50 font-medium">
            <td className="sticky left-0 z-10 bg-muted/50 px-2 py-1 text-sm">
              {totalLabel} {item.subtotal.group}
            </td>
            {item.subtotal.months.map((value, m) => (
              <Cell key={m} value={value} locale={locale} />
            ))}
            <Cell value={item.subtotal.total} locale={locale} />
          </tr>
        ),
      )}
    </>
  )
}

export function CategoryGrid({ grid, year }: { grid: GridResponse; year: number }) {
  const { t, locale } = useI18n()
  const incomeSubtotals = grid.group_subtotals.filter((s) =>
    grid.income_rows.some((r) => r.group === s.group),
  )
  const expenseSubtotals = grid.group_subtotals.filter((s) =>
    grid.expense_rows.some((r) => r.group === s.group),
  )
  const incomeItems = withSubtotals(grid.income_rows, incomeSubtotals)
  const expenseItems = withSubtotals(grid.expense_rows, expenseSubtotals)
  const totalLabel = t("dashboard.groupTotal")

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[900px] border-collapse">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="sticky left-0 z-10 bg-muted/30 px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">
              {t("common.category")}
            </th>
            {MONTH_NAMES_SHORT[locale].map((m) => (
              <th key={m} className="px-2 py-1.5 text-right text-xs font-medium text-muted-foreground">
                {m}
              </th>
            ))}
            <th className="px-2 py-1.5 text-right text-xs font-medium text-muted-foreground">
              {t("common.total")}
            </th>
          </tr>
        </thead>
        <tbody>
          {incomeItems.length > 0 && (
            <tr>
              <td
                colSpan={14}
                className="sticky left-0 bg-background px-2 pt-3 pb-1 text-xs font-semibold uppercase text-muted-foreground"
              >
                {t("dashboard.kpiIncome")}
              </td>
            </tr>
          )}
          <SectionRows items={incomeItems} year={year} locale={locale} totalLabel={totalLabel} />
          {expenseItems.length > 0 && (
            <tr>
              <td
                colSpan={14}
                className="sticky left-0 bg-background px-2 pt-3 pb-1 text-xs font-semibold uppercase text-muted-foreground"
              >
                {t("dashboard.kpiExpenses")}
              </td>
            </tr>
          )}
          <SectionRows items={expenseItems} year={year} locale={locale} totalLabel={totalLabel} />
          <tr className={cn("border-t-2 font-semibold")}>
            <td className="sticky left-0 z-10 bg-background px-2 py-1.5 text-sm">
              {t("common.total")}
            </td>
            {grid.month_totals.map((value, m) => (
              <Cell key={m} value={value} locale={locale} />
            ))}
            <Cell value={grid.year_total} locale={locale} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}
