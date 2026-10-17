import { Pencil, Plus, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import {
  type TransactionFilters,
  useAccounts,
  useBulkUpdateTransactions,
  useCategories,
  useDeleteTransaction,
  useTransactions,
  useUpdateTransaction,
} from "@/api/hooks"
import type { TransactionRead } from "@/api/types"
import { BulkApplyDialog } from "@/components/bulk-apply-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { PageHeader } from "@/components/page-header"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { ExpandableText } from "@/components/expandable-text"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { formatDate, monthName } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { guessMerchantSnippet } from "@/lib/merchant"
import { cn } from "@/lib/utils"
import { FilterChips, MoreFilters } from "@/pages/transactions/MoreFilters"
import { NO_CATEGORY } from "@/pages/transactions/shared"
import { TransactionFormDialog } from "@/pages/transactions/TransactionFormDialog"

const ALL = "all"
const CUSTOM = "custom"
const PAGE_SIZE = 50

function currentYear() {
  return new Date().getFullYear()
}

function NotesPopover({ id, notes }: { id: number; notes: string }) {
  const t = useI18n().t
  const [value, setValue] = useState(notes)
  const [open, setOpen] = useState(false)
  const updateTransaction = useUpdateTransaction()

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setValue(notes)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          {notes ? t("transactions.notesSet") : t("transactions.notesAdd")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("transactions.notesPlaceholder")}
          rows={3}
        />
        <Button
          size="sm"
          onClick={() =>
            updateTransaction.mutate(
              { id, payload: { notes: value } },
              {
                onSuccess: () => setOpen(false),
                onError: (err) => toast.error(err.message),
              },
            )
          }
          disabled={updateTransaction.isPending}
        >
          {t("common.save")}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

export function Transactions() {
  const { t, tn, locale, formatMoney } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const updateTransaction = useUpdateTransaction()
  const bulkUpdate = useBulkUpdateTransactions()
  const deleteTransaction = useDeleteTransaction()
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; description_raw: string } | null>(
    null,
  )
  // "new" opens the form empty; a transaction opens it for editing.
  const [formTarget, setFormTarget] = useState<TransactionRead | "new" | null>(null)

  const custom = searchParams.get("period") === CUSTOM
  const year = searchParams.get("year") ?? String(currentYear())
  const month = custom ? CUSTOM : (searchParams.get("month") ?? ALL)
  const from = searchParams.get("from") ?? ""
  const to = searchParams.get("to") ?? ""
  const accountId = searchParams.get("account_id") ?? ALL
  const categoryId = searchParams.get("category_id") ?? ALL
  const needsReview = searchParams.get("needs_review") === "true"
  const type = searchParams.get("type")
  const min = searchParams.get("min")
  const max = searchParams.get("max")
  const source = searchParams.get("source")
  const q = searchParams.get("q") ?? ""
  const page = Number(searchParams.get("page") ?? "1")

  const setFilters = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "" || value === ALL) next.delete(key)
      else next.set(key, value)
    }
    if (!("page" in patch)) next.delete("page")
    setSearchParams(next)
  }
  const setFilter = (key: string, value: string | null) => setFilters({ [key]: value })

  const setPeriod = (value: string) =>
    value === CUSTOM
      ? setFilters({ period: CUSTOM, month: null })
      : setFilters({ period: null, from: null, to: null, month: value })

  const [searchInput, setSearchInput] = useState(q)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => setSearchInput(q), [q])
  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setFilter("q", value), 300)
  }

  const filters = useMemo(
    (): TransactionFilters => ({
      ...(custom
        ? { date_from: from || undefined, date_to: to || undefined }
        : { year: Number(year), month: month !== ALL ? Number(month) : undefined }),
      account_id: accountId !== ALL ? Number(accountId) : undefined,
      ...(categoryId === NO_CATEGORY
        ? { uncategorized: true }
        : { category_id: categoryId !== ALL ? Number(categoryId) : undefined }),
      needs_review: needsReview || undefined,
      type: type === "income" || type === "expense" ? type : undefined,
      amount_min: min ? Number(min) : undefined,
      amount_max: max ? Number(max) : undefined,
      source: source === "manual" || source === "imported" ? source : undefined,
      q: q || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    [custom, from, to, year, month, accountId, categoryId, needsReview, type, min, max, source, q, page],
  )

  const { data, isLoading } = useTransactions(filters)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  useEffect(() => setSelected(new Set()), [filters])

  const [bulkCategory, setBulkCategory] = useState<string>(ALL)
  const [bulkDialog, setBulkDialog] = useState<{
    categoryId: number
    categoryName: string
    snippet: string
    siblings: TransactionRead[]
  } | null>(null)

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const categoryName = (id: number | null) =>
    id === null ? t("common.uncategorized") : categories?.find((c) => c.id === id)?.name ?? `#${id}`

  const toggleAll = (checked: boolean) => {
    if (!data) return
    setSelected(checked ? new Set(data.items.map((t) => t.id)) : new Set())
  }
  const toggleOne = (id: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {bulkDialog && (
        <BulkApplyDialog
          categoryId={bulkDialog.categoryId}
          categoryName={bulkDialog.categoryName}
          initialSnippet={bulkDialog.snippet}
          siblings={bulkDialog.siblings}
          onDone={() => setBulkDialog(null)}
        />
      )}
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("transactions.deleteTitle")}
        description={
          deleteTarget
            ? t("transactions.deleteDescription", { description: deleteTarget.description_raw })
            : ""
        }
        pending={deleteTransaction.isPending}
        onConfirm={() => {
          if (!deleteTarget) return
          deleteTransaction.mutate(deleteTarget.id, {
            onSuccess: () => {
              toast.success(t("transactions.toastDeleted"))
              setDeleteTarget(null)
            },
            onError: (err) => toast.error(err.message),
          })
        }}
      />
      {formTarget !== null && (
        <TransactionFormDialog
          transaction={formTarget === "new" ? undefined : formTarget}
          defaultAccountId={accountId !== ALL ? Number(accountId) : undefined}
          onClose={() => setFormTarget(null)}
        />
      )}
      <PageHeader
        title={t("transactions.title")}
        actions={
          <>
            <Button asChild variant="tinted">
              <Link to="/transactions/new">{t("transactions.bulk.open")}</Link>
            </Button>
            <Button onClick={() => setFormTarget("new")}>
              <Plus />
              {t("transactions.form.addTitle")}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {custom ? (
          <>
            <Input
              type="date"
              aria-label={t("transactions.filters.from")}
              value={from}
              max={to || undefined}
              onChange={(e) => setFilter("from", e.target.value)}
              className="w-40"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="date"
              aria-label={t("transactions.filters.to")}
              value={to}
              min={from || undefined}
              onChange={(e) => setFilter("to", e.target.value)}
              className="w-40"
            />
          </>
        ) : (
          <Input
            aria-label={t("transactions.filters.year")}
            value={year}
            onChange={(e) => setFilter("year", e.target.value)}
            className="w-24"
            type="number"
          />
        )}
        <Select value={month} onValueChange={setPeriod}>
          <SelectTrigger className="w-40" aria-label={t("transactions.filters.period")}>
            <SelectValue placeholder={t("common.allMonths")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("common.allMonths")}</SelectItem>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <SelectItem key={m} value={String(m)}>
                {monthName(m, locale)}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM}>{t("transactions.filters.customRange")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={accountId} onValueChange={(v) => setFilter("account_id", v)}>
          <SelectTrigger className="w-44" aria-label={t("transactions.form.account")}>
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
        <Select value={categoryId} onValueChange={(v) => setFilter("category_id", v)}>
          <SelectTrigger className="w-48" aria-label={t("common.category")}>
            <SelectValue placeholder={t("common.allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("common.allCategories")}</SelectItem>
            <SelectItem value={NO_CATEGORY}>{t("common.uncategorized")}</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={t("transactions.searchPlaceholder")}
          aria-label={t("transactions.searchPlaceholder")}
          className="w-56"
        />
        <MoreFilters params={searchParams} onChange={setFilters} />
      </div>
      <FilterChips params={searchParams} onChange={setFilters} />

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm font-medium">
          <span>{tn("transactions.selectedCount", selected.size)}</span>
          <Select value={bulkCategory} onValueChange={setBulkCategory}>
            <SelectTrigger className="h-8 w-48">
              <SelectValue placeholder={t("transactions.setCategory")} />
            </SelectTrigger>
            <SelectContent>
              {categories?.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={bulkCategory === ALL || bulkUpdate.isPending}
            onClick={() =>
              bulkUpdate.mutate(
                { ids: Array.from(selected), category_id: Number(bulkCategory), reviewed: true },
                {
                  onSuccess: () => {
                    toast.success(tn("transactions.toastBulkUpdated", selected.size))
                    setSelected(new Set())
                    setBulkCategory(ALL)
                  },
                  onError: (err) => toast.error(err.message),
                },
              )
            }
          >
            {t("common.apply")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {t("common.clear")}
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : !data?.items.length ? (
        <p className="text-sm text-muted-foreground">{t("transactions.noMatches")}</p>
      ) : (
        <Card className="gap-0 py-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={selected.size === data.items.length}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                  />
                </TableHead>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("common.description")}</TableHead>
                <TableHead className="text-right">{t("common.amount")}</TableHead>
                <TableHead>{t("common.category")}</TableHead>
                <TableHead>{t("transactions.notes")}</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((txn) => (
                <TableRow key={txn.id} className={cn(!txn.reviewed && "bg-warning/6")}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(txn.id)}
                      onCheckedChange={(checked) => toggleOne(txn.id, checked === true)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(txn.date, locale)}
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <ExpandableText text={txn.description_raw} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-figures whitespace-nowrap",
                      txn.amount_cents < 0 ? "text-foreground" : "text-income",
                    )}
                  >
                    {formatMoney(txn.amount_cents)}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={txn.category_id !== null ? String(txn.category_id) : ALL}
                      onValueChange={(value) => {
                        const newCategoryId = value === ALL ? null : Number(value)
                        const oldCategoryId = txn.category_id
                        updateTransaction.mutate(
                          { id: txn.id, payload: { category_id: newCategoryId } },
                          {
                            onSuccess: () => {
                              if (newCategoryId === null) return
                              const category = categories?.find((c) => c.id === newCategoryId)
                              const guess = guessMerchantSnippet(txn.description_raw)
                              // Only offer to bulk-move siblings still sitting in the
                              // category this one just left — e.g. cleaning up "Altro"
                              // into a newly split-out category, one merchant at a time.
                              const siblings = (data?.items ?? []).filter(
                                (t) =>
                                  t.id !== txn.id &&
                                  t.category_id === oldCategoryId &&
                                  t.description_raw.toLowerCase().includes(guess.toLowerCase()),
                              )
                              if (siblings.length > 0) {
                                setBulkDialog({
                                  categoryId: newCategoryId,
                                  categoryName: category?.name ?? "",
                                  snippet: guess,
                                  siblings,
                                })
                              }
                            },
                            onError: (err) => toast.error(err.message),
                          },
                        )
                      }}
                    >
                      <SelectTrigger className="h-8 w-44 bg-transparent hover:bg-elevated">
                        <SelectValue>{categoryName(txn.category_id)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>{t("common.uncategorized")}</SelectItem>
                        {categories?.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <NotesPopover id={txn.id} notes={txn.notes} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("transactions.form.editTitle")}
                        className="size-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setFormTarget(txn)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("common.delete")}
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(txn)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-hairline px-4 pt-3 pb-1 text-sm text-muted-foreground">
            <span className="font-figures">
              {tn("transactions.totalCount", data.total)}, {t("transactions.pageOf", { page, totalPages })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setFilter("page", String(page - 1))}
              >
                {t("common.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setFilter("page", String(page + 1))}
              >
                {t("common.next")}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
