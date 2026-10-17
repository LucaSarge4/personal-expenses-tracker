import { ArrowLeft, Plus, X } from "lucide-react"
import { useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { useAccounts, useCategories, useCreateTransactions } from "@/api/hooks"
import { PageHeader } from "@/components/page-header"
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { parseAmount } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import {
  categoriesFor,
  type Direction,
  NO_CATEGORY,
  todayIso,
  useDirectionOptions,
} from "@/pages/transactions/shared"

interface DraftRow {
  key: number
  date: string
  description: string
  amount: string
  direction: Direction
  categoryId: string
}

const INITIAL_ROWS = 5
const COLUMNS = "md:grid-cols-[148px_minmax(0,1fr)_150px_120px_180px_32px]"

let nextKey = 0
function emptyRow(date: string): DraftRow {
  return { key: nextKey++, date, description: "", amount: "", direction: "expense", categoryId: NO_CATEGORY }
}

type RowState = { status: "blank" } | { status: "invalid"; amountBad: boolean; descriptionBad: boolean; dateBad: boolean } | { status: "ready"; cents: number }

function rowState(row: DraftRow): RowState {
  if (row.description.trim() === "" && row.amount.trim() === "") return { status: "blank" }
  const cents = parseAmount(row.amount)
  const amountBad = cents === null || cents === 0
  const descriptionBad = row.description.trim() === ""
  const dateBad = row.date === ""
  if (amountBad || descriptionBad || dateBad) return { status: "invalid", amountBad, descriptionBad, dateBad }
  return { status: "ready", cents: row.direction === "expense" ? -cents : cents }
}

/** Spreadsheet-style entry of many transactions for one account. */
export function BulkAdd() {
  const { t, tn, formatMoney } = useI18n()
  const navigate = useNavigate()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const createTransactions = useCreateTransactions()
  const directionOptions = useDirectionOptions()

  const [accountId, setAccountId] = useState("")
  const [rows, setRows] = useState<DraftRow[]>(() => {
    const today = todayIso()
    return Array.from({ length: INITIAL_ROWS }, () => emptyRow(today))
  })
  const dateInputs = useRef(new Map<number, HTMLInputElement>())
  // A row added from the keyboard gets focus as soon as its input mounts.
  const focusOnMount = useRef<number | null>(null)

  const effectiveAccountId = accountId || (accounts?.length === 1 ? String(accounts[0].id) : "")
  const states = rows.map(rowState)
  const ready = states.flatMap((s) => (s.status === "ready" ? [s.cents] : []))
  const invalidCount = states.filter((s) => s.status === "invalid").length
  // Client-side sum of unsaved drafts, shown as feedback while typing.
  const moneyIn = ready.filter((c) => c > 0).reduce((a, b) => a + b, 0)
  const moneyOut = ready.filter((c) => c < 0).reduce((a, b) => a + b, 0)
  const canSave = ready.length > 0 && invalidCount === 0 && effectiveAccountId !== ""

  const update = (key: number, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const addRow = () => {
    const row = emptyRow(rows.at(-1)?.date || todayIso())
    setRows((prev) => [...prev, row])
    focusOnMount.current = row.key
  }

  const removeRow = (key: number) =>
    setRows((prev) => (prev.length === 1 ? [emptyRow(todayIso())] : prev.filter((r) => r.key !== key)))

  /** Enter moves to the next row's first cell, adding a row at the end. */
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return
    event.preventDefault()
    const next = rows[index + 1]
    if (next) dateInputs.current.get(next.key)?.focus()
    else addRow()
  }

  const save = () => {
    if (!canSave) return
    const items = rows.flatMap((row, i) => {
      const state = states[i]
      if (state.status !== "ready") return []
      return [
        {
          account_id: Number(effectiveAccountId),
          date: row.date,
          description_raw: row.description.trim(),
          amount_cents: state.cents,
          category_id: row.categoryId === NO_CATEGORY ? null : Number(row.categoryId),
          notes: "",
        },
      ]
    })
    createTransactions.mutate(items, {
      onSuccess: () => {
        toast.success(tn("transactions.bulk.toastAdded", items.length))
        navigate("/transactions")
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link to="/transactions">
            <ArrowLeft />
            {t("transactions.title")}
          </Link>
        </Button>
      </div>
      <PageHeader title={t("transactions.bulk.title")} subtitle={t("transactions.bulk.subtitle")} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bulk-account">{t("transactions.form.account")}</Label>
        <Select value={effectiveAccountId} onValueChange={setAccountId}>
          <SelectTrigger id="bulk-account" className="w-full sm:w-64">
            <SelectValue placeholder={t("transactions.form.chooseAccount")} />
          </SelectTrigger>
          <SelectContent>
            {accounts?.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="gap-0 p-2 md:p-3">
        <div
          aria-hidden
          className={cn(
            "hidden gap-2 px-1 pb-2 text-xs font-medium text-muted-foreground md:grid",
            COLUMNS,
          )}
        >
          <span>{t("common.date")}</span>
          <span>{t("common.description")}</span>
          <span>{t("transactions.form.direction")}</span>
          <span className="text-right">{t("common.amount")}</span>
          <span>{t("common.category")}</span>
          <span />
        </div>
        <ol className="flex flex-col gap-2 md:gap-1">
          {rows.map((row, index) => {
            const state = states[index]
            const bad = state.status === "invalid" ? state : null
            const rowLabel = t("transactions.bulk.row", { n: index + 1 })
            return (
              <li
                key={row.key}
                aria-label={rowLabel}
                className={cn(
                  "grid grid-cols-2 gap-2 rounded-xl p-2 md:items-center md:p-1",
                  COLUMNS,
                  "max-md:bg-elevated/50",
                  bad && "ring-1 ring-destructive/50",
                )}
              >
                <Input
                  ref={(el) => {
                    if (!el) {
                      dateInputs.current.delete(row.key)
                      return
                    }
                    dateInputs.current.set(row.key, el)
                    if (focusOnMount.current === row.key) {
                      focusOnMount.current = null
                      el.focus()
                    }
                  }}
                  type="date"
                  aria-label={`${rowLabel}: ${t("common.date")}`}
                  aria-invalid={bad?.dateBad || undefined}
                  value={row.date}
                  onChange={(e) => update(row.key, { date: e.target.value })}
                  onKeyDown={(e) => onKeyDown(e, index)}
                  className="col-span-1"
                />
                <Input
                  aria-label={`${rowLabel}: ${t("common.description")}`}
                  aria-invalid={bad?.descriptionBad || undefined}
                  placeholder={t("transactions.form.descriptionPlaceholder")}
                  value={row.description}
                  onChange={(e) => update(row.key, { description: e.target.value })}
                  onKeyDown={(e) => onKeyDown(e, index)}
                  className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto"
                />
                <Segmented
                  size="sm"
                  label={`${rowLabel}: ${t("transactions.form.direction")}`}
                  value={row.direction}
                  onChange={(direction) =>
                    update(row.key, {
                      direction,
                      categoryId: categoriesFor(categories, direction).some(
                        (c) => String(c.id) === row.categoryId,
                      )
                        ? row.categoryId
                        : NO_CATEGORY,
                    })
                  }
                  options={directionOptions}
                  className="col-start-2 row-start-1 w-full md:col-start-auto md:row-start-auto"
                />
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={`${rowLabel}: ${t("common.amount")}`}
                  aria-invalid={bad?.amountBad || undefined}
                  placeholder="0,00"
                  value={row.amount}
                  onChange={(e) => update(row.key, { amount: e.target.value })}
                  onKeyDown={(e) => onKeyDown(e, index)}
                  className="text-right font-figures"
                />
                <Select
                  value={row.categoryId}
                  onValueChange={(categoryId) => update(row.key, { categoryId })}
                >
                  <SelectTrigger
                    aria-label={`${rowLabel}: ${t("common.category")}`}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>{t("common.uncategorized")}</SelectItem>
                    {categoriesFor(categories, row.direction).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("transactions.bulk.removeRow", { n: index + 1 })}
                  className="col-span-2 size-8 justify-self-end text-muted-foreground hover:text-destructive md:col-span-1"
                  onClick={() => removeRow(row.key)}
                >
                  <X />
                </Button>
              </li>
            )
          })}
        </ol>
        <div className="px-1 pt-2">
          <Button variant="ghost" size="sm" onClick={addRow} className="text-primary">
            <Plus />
            {t("transactions.bulk.addRow")}
          </Button>
        </div>
      </Card>

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3",
          // Phones: keep the save bar in reach above the tab bar while scrolling rows.
          "max-md:sticky max-md:bottom-0 max-md:z-20 max-md:-mx-4 max-md:-mb-8 max-md:border-t max-md:border-hairline max-md:bg-card max-md:px-4 max-md:py-3 max-md:backdrop-blur-xl",
        )}
      >
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {invalidCount > 0 ? (
            <span className="text-destructive">{tn("transactions.bulk.invalidCount", invalidCount)}</span>
          ) : (
            <>
              {tn("transactions.bulk.readyCount", ready.length)}
              {ready.length > 0 && (
                <span className="font-figures">
                  {" "}
                  <span className="text-income">+{formatMoney(moneyIn)}</span>{" "}
                  <span>{formatMoney(moneyOut)}</span>
                </span>
              )}
            </>
          )}
        </p>
        <Button onClick={save} disabled={!canSave || createTransactions.isPending}>
          {ready.length > 0
            ? tn("transactions.bulk.save", ready.length)
            : t("transactions.bulk.saveNone")}
        </Button>
      </div>
    </div>
  )
}
