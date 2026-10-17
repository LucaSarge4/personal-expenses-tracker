import { SlidersHorizontal, X } from "lucide-react"
import { useState } from "react"

import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { parseAmount } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { activeMoreFilters, MORE_FILTER_KEYS } from "@/pages/transactions/shared"

type Patch = Record<string, string | null>

function centsToInput(value: string | null): string {
  return value ? (Number(value) / 100).toString() : ""
}

/** Amount input that commits to the URL on blur or Enter, not on every keystroke.
 * Callers key it by the URL value so it resets when the filter changes elsewhere. */
function AmountBound({
  id,
  label,
  value,
  onCommit,
}: {
  id: string
  label: string
  value: string | null
  onCommit: (cents: string | null) => void
}) {
  const [text, setText] = useState(centsToInput(value))
  const commit = () => {
    const cents = parseAmount(text)
    onCommit(cents === null ? null : String(cents))
  }
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="font-figures"
      />
    </div>
  )
}

export function MoreFilters({ params, onChange }: { params: URLSearchParams; onChange: (patch: Patch) => void }) {
  const { t } = useI18n()
  const active = activeMoreFilters(params)
  const type = params.get("type") ?? "all"
  const source = params.get("source") ?? "all"

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontal />
          {t("transactions.filters.button")}
          {active > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[11px] leading-[18px] font-semibold text-primary-foreground">
              {active}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{t("transactions.filters.type")}</span>
          <Segmented
            label={t("transactions.filters.type")}
            value={type}
            onChange={(v) => onChange({ type: v === "all" ? null : v })}
            options={[
              { value: "all", label: t("transactions.filters.all") },
              { value: "income", label: t("transactions.form.income") },
              { value: "expense", label: t("transactions.form.expense") },
            ]}
            className="w-full"
          />
        </div>
        <div className="flex gap-2">
          <AmountBound
            key={`min-${params.get("min")}`}
            id="filter-min"
            label={t("transactions.filters.amountMin")}
            value={params.get("min")}
            onCommit={(min) => onChange({ min })}
          />
          <AmountBound
            key={`max-${params.get("max")}`}
            id="filter-max"
            label={t("transactions.filters.amountMax")}
            value={params.get("max")}
            onCommit={(max) => onChange({ max })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{t("transactions.filters.source")}</span>
          <Segmented
            label={t("transactions.filters.source")}
            value={source}
            onChange={(v) => onChange({ source: v === "all" ? null : v })}
            options={[
              { value: "all", label: t("transactions.filters.all") },
              { value: "manual", label: t("transactions.filters.manual") },
              { value: "imported", label: t("transactions.filters.imported") },
            ]}
            className="w-full"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={params.get("needs_review") === "true"}
            onCheckedChange={(checked) => onChange({ needs_review: checked ? "true" : null })}
          />
          {t("transactions.needsReview")}
        </label>
      </PopoverContent>
    </Popover>
  )
}

/** Removable chips for filters hidden inside the popover. */
export function FilterChips({ params, onChange }: { params: URLSearchParams; onChange: (patch: Patch) => void }) {
  const { t, formatMoney } = useI18n()
  const chips: { key: string; label: string; clear: Patch }[] = []

  const type = params.get("type")
  if (type) chips.push({ key: "type", label: t(`transactions.form.${type}`), clear: { type: null } })
  const min = params.get("min")
  const max = params.get("max")
  if (min || max) {
    const label =
      min && max
        ? `${formatMoney(Number(min))} – ${formatMoney(Number(max))}`
        : min
          ? t("transactions.filters.atLeast", { amount: formatMoney(Number(min)) })
          : t("transactions.filters.atMost", { amount: formatMoney(Number(max)) })
    chips.push({ key: "amount", label, clear: { min: null, max: null } })
  }
  const source = params.get("source")
  if (source) chips.push({ key: "source", label: t(`transactions.filters.${source}`), clear: { source: null } })
  if (params.get("needs_review") === "true") {
    chips.push({ key: "needs_review", label: t("transactions.needsReview"), clear: { needs_review: null } })
  }
  if (chips.length === 0) return null

  const clearAll = Object.fromEntries(MORE_FILTER_KEYS.map((k) => [k, null]))
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex h-7 items-center gap-1 rounded-full bg-primary/12 pr-1 pl-3 text-xs font-medium text-primary"
        >
          {chip.label}
          <button
            type="button"
            aria-label={t("transactions.filters.remove", { filter: chip.label })}
            onClick={() => onChange(chip.clear)}
            className="grid size-5 place-items-center rounded-full hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <Button variant="ghost" size="xs" onClick={() => onChange(clearAll)}>
          {t("transactions.filters.clearAll")}
        </Button>
      )}
    </div>
  )
}
