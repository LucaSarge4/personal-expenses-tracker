import { Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import {
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
import { Checkbox } from "@/components/ui/checkbox"
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
import { formatDate, formatEUR, monthName } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { guessMerchantSnippet } from "@/lib/merchant"
import { cn } from "@/lib/utils"

const ALL = "all"
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
  const { t, tn, locale } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const updateTransaction = useUpdateTransaction()
  const bulkUpdate = useBulkUpdateTransactions()
  const deleteTransaction = useDeleteTransaction()
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; description_raw: string } | null>(
    null,
  )

  const year = searchParams.get("year") ?? String(currentYear())
  const month = searchParams.get("month") ?? ALL
  const accountId = searchParams.get("account_id") ?? ALL
  const categoryId = searchParams.get("category_id") ?? ALL
  const needsReview = searchParams.get("needs_review") === "true"
  const q = searchParams.get("q") ?? ""
  const page = Number(searchParams.get("page") ?? "1")

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (value === null || value === "" || value === ALL) next.delete(key)
    else next.set(key, value)
    if (key !== "page") next.delete("page")
    setSearchParams(next)
  }

  const [searchInput, setSearchInput] = useState(q)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => setSearchInput(q), [q])
  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setFilter("q", value), 300)
  }

  const filters = useMemo(
    () => ({
      year: Number(year),
      month: month !== ALL ? Number(month) : undefined,
      account_id: accountId !== ALL ? Number(accountId) : undefined,
      category_id: categoryId !== ALL ? Number(categoryId) : undefined,
      needs_review: needsReview || undefined,
      q: q || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    [year, month, accountId, categoryId, needsReview, q, page],
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
      <h1 className="text-2xl font-semibold">{t("transactions.title")}</h1>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={year}
          onChange={(e) => setFilter("year", e.target.value)}
          className="w-24"
          type="number"
        />
        <Select value={month} onValueChange={(v) => setFilter("month", v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder={t("common.allMonths")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("common.allMonths")}</SelectItem>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <SelectItem key={m} value={String(m)}>
                {monthName(m, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={accountId} onValueChange={(v) => setFilter("account_id", v)}>
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
        <Select value={categoryId} onValueChange={(v) => setFilter("category_id", v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("common.allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("common.allCategories")}</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-sm">
          <Checkbox
            checked={needsReview}
            onCheckedChange={(checked) => setFilter("needs_review", checked ? "true" : null)}
          />
          {t("transactions.needsReview")}
        </label>
        <Input
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={t("transactions.searchPlaceholder")}
          className="w-56"
        />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-md border bg-accent/40 px-3 py-2 text-sm">
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
        <>
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
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((txn) => (
                <TableRow key={txn.id} className={cn(!txn.reviewed && "bg-amber-500/5")}>
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
                      "text-right font-mono whitespace-nowrap",
                      txn.amount_cents < 0 ? "text-foreground" : "text-emerald-600",
                    )}
                  >
                    {formatEUR(txn.amount_cents, locale)}
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
                      <SelectTrigger className="h-8 w-44">
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(txn)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {tn("transactions.totalCount", data.total)} ·{" "}
              {t("transactions.pageOf", { page, totalPages })}
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
        </>
      )}
    </div>
  )
}
