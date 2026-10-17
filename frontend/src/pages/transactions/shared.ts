import type { components } from "@/api/schema"
import { useT } from "@/lib/i18n"

type CategoryRead = components["schemas"]["CategoryRead"]
export type Direction = "expense" | "income"

export const NO_CATEGORY = "none"

export function todayIso(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Categories that make sense for money going in this direction. Transfers fit both. */
export function categoriesFor(categories: CategoryRead[] | undefined, direction: Direction) {
  return (categories ?? []).filter((c) => c.kind === direction || c.kind === "transfer")
}

export function useDirectionOptions() {
  const t = useT()
  return [
    { value: "expense" as const, label: t("transactions.form.expense"), tone: "text-destructive" },
    { value: "income" as const, label: t("transactions.form.income"), tone: "text-income" },
  ]
}

/** URL keys owned by this popover; everything else stays in the toolbar. */
export const MORE_FILTER_KEYS = ["type", "min", "max", "source", "needs_review"] as const

export function activeMoreFilters(params: URLSearchParams): number {
  const amount = params.has("min") || params.has("max") ? 1 : 0
  return amount + ["type", "source", "needs_review"].filter((k) => params.has(k)).length
}
