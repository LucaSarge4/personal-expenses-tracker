import type { CSSProperties } from "react"
import { Link } from "react-router-dom"

import type { GridResponse, GridRow, GroupSubtotal } from "@/api/types"
import { MONTH_NAMES_SHORT, formatAmount } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type LineItem =
  | { kind: "row"; row: GridRow }
  | { kind: "subtotal"; subtotal: GroupSubtotal }

// Expense rows are negative cents; inside the "Expenses" section the sign is
// redundant noise, so they're displayed flipped (a refund then shows as negative).
type Section = "income" | "expense"

const STICKY_CELL = "sticky left-0 z-10 bg-white dark:bg-[#1c1c1e]"

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
  section,
  href,
  tint,
  idle,
}: {
  value: number
  section?: Section
  href?: string
  /** Row color plus this cell's share of the row's largest month, for the heat tint. */
  tint?: { color: string; share: number }
  /** A month with no data at all (e.g. the future): keep it visually quiet. */
  idle?: boolean
}) {
  const { locale } = useI18n()
  if (value === 0) {
    return (
      <td className={cn("px-2 py-1.5 text-right text-sm text-muted-foreground/40", idle && "px-1")}>
        –
      </td>
    )
  }
  const shown = section === "expense" ? -value : value
  const content = formatAmount(shown, locale)
  const style = tint
    ? ({
        backgroundColor: `color-mix(in srgb, ${tint.color} ${Math.round(4 + tint.share * 20)}%, transparent)`,
      } as CSSProperties)
    : undefined
  return (
    <td
      className={cn("px-2 py-1.5 text-right text-sm font-figures", shown < 0 && "text-destructive")}
      style={style}
    >
      {href ? (
        <Link to={href} className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">
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
  section,
  year,
  totalLabel,
  idleMonths,
}: {
  items: LineItem[]
  section: Section
  year: number
  totalLabel: string
  idleMonths: boolean[]
}) {
  return (
    <>
      {items.map((item, idx) => {
        if (item.kind === "subtotal") {
          return (
            <tr
              key={`subtotal-${item.subtotal.group}-${idx}`}
              className="border-b border-hairline text-muted-foreground"
            >
              <td className={cn(STICKY_CELL, "py-1.5 pr-2 pl-6 text-[13px] font-medium")}>
                {totalLabel} {item.subtotal.group}
              </td>
              {item.subtotal.months.map((value, m) => (
                <Cell key={m} value={value} section={section} idle={idleMonths[m]} />
              ))}
              <Cell value={item.subtotal.total} section={section} />
            </tr>
          )
        }
        const { row } = item
        const rowMax = Math.max(...row.months.map(Math.abs))
        return (
          <tr key={`row-${row.category_id}`} className="border-b border-hairline">
            <td className={cn(STICKY_CELL, "px-2 py-1.5 text-sm whitespace-nowrap")}>
              <span
                className="mr-2 inline-block size-2 rounded-full align-middle"
                style={{ backgroundColor: row.color }}
              />
              {row.name}
            </td>
            {row.months.map((value, m) => (
              <Cell
                key={m}
                value={value}
                section={section}
                idle={idleMonths[m]}
                tint={rowMax ? { color: row.color, share: Math.abs(value) / rowMax } : undefined}
                href={
                  value !== 0
                    ? `/transactions?year=${year}&month=${m + 1}&category_id=${row.category_id}`
                    : undefined
                }
              />
            ))}
            <td className="px-2 py-1.5 text-right text-sm font-semibold font-figures">
              {row.total !== 0 ? (
                <TotalAmount value={section === "expense" ? -row.total : row.total} />
              ) : (
                <span className="text-muted-foreground/40">–</span>
              )}
            </td>
          </tr>
        )
      })}
    </>
  )
}

function TotalAmount({ value }: { value: number }) {
  const { locale } = useI18n()
  return <span className={cn(value < 0 && "text-destructive")}>{formatAmount(value, locale)}</span>
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
  const allRows = [...grid.income_rows, ...grid.expense_rows]
  const idleMonths = grid.month_totals.map((_, m) => allRows.every((r) => r.months[m] === 0))

  const sectionHeading = (label: string) => (
    <tr>
      <td colSpan={14} className={cn(STICKY_CELL, "px-2 pt-5 pb-1.5 text-[13px] font-semibold")}>
        {label}
      </td>
    </tr>
  )

  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse">
        <thead>
          <tr className="border-b border-hairline">
            <th className={cn(STICKY_CELL, "min-w-44 px-2 py-2 text-left text-xs font-medium text-muted-foreground")}>
              {t("common.category")}
            </th>
            {MONTH_NAMES_SHORT[locale].map((m, i) => (
              <th
                key={m}
                className={cn(
                  "px-2 py-2 text-right text-xs font-medium text-muted-foreground",
                  idleMonths[i] && "px-1 text-muted-foreground/50",
                )}
              >
                {m}
              </th>
            ))}
            <th className="px-2 py-2 text-right text-xs font-semibold text-foreground">
              {t("common.total")}
            </th>
          </tr>
        </thead>
        <tbody>
          {incomeItems.length > 0 && sectionHeading(t("dashboard.kpiIncome"))}
          <SectionRows items={incomeItems} section="income" year={year} totalLabel={totalLabel} idleMonths={idleMonths} />
          {expenseItems.length > 0 && sectionHeading(t("dashboard.kpiExpenses"))}
          <SectionRows items={expenseItems} section="expense" year={year} totalLabel={totalLabel} idleMonths={idleMonths} />
          <tr className="border-t border-foreground/15 font-semibold">
            <td className={cn(STICKY_CELL, "px-2 py-2.5 text-sm")}>{t("dashboard.gridNet")}</td>
            {grid.month_totals.map((value, m) => (
              <td key={m} className={cn("px-2 py-2.5 text-right text-sm font-figures", idleMonths[m] && "px-1")}>
                {value === 0 ? (
                  <span className="text-muted-foreground/40">–</span>
                ) : (
                  <span className={value > 0 ? "text-income" : "text-destructive"}>
                    {value > 0 ? "+" : ""}
                    {formatAmount(value, locale)}
                  </span>
                )}
              </td>
            ))}
            <td className="px-2 py-2.5 text-right text-sm font-figures">
              <span className={grid.year_total >= 0 ? "text-income" : "text-destructive"}>
                {grid.year_total > 0 ? "+" : ""}
                {formatAmount(grid.year_total, locale)}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
