import { useState } from "react"
import { toast } from "sonner"

import { useAccounts, useCategories, useCreateTransaction, useUpdateTransaction } from "@/api/hooks"
import type { components } from "@/api/schema"
import type { TransactionRead } from "@/api/types"
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { parseAmount } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import {
  categoriesFor,
  type Direction,
  NO_CATEGORY,
  todayIso,
  useDirectionOptions,
} from "@/pages/transactions/shared"

type TransactionUpdate = components["schemas"]["TransactionUpdate"]

/** Add a transaction by hand (no `transaction`) or edit an existing one. */
export function TransactionFormDialog({
  transaction,
  defaultAccountId,
  onClose,
}: {
  transaction?: TransactionRead
  defaultAccountId?: number
  onClose: () => void
}) {
  const { t, formatMoney } = useI18n()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const createTransaction = useCreateTransaction()
  const updateTransaction = useUpdateTransaction()
  const directionOptions = useDirectionOptions()
  const editing = transaction !== undefined

  const [direction, setDirection] = useState<Direction>(
    transaction && transaction.amount_cents > 0 ? "income" : "expense",
  )
  const [amount, setAmount] = useState(
    transaction ? (Math.abs(transaction.amount_cents) / 100).toFixed(2) : "",
  )
  const [date, setDate] = useState(transaction?.date ?? todayIso())
  const [description, setDescription] = useState(transaction?.description_raw ?? "")
  const [accountId, setAccountId] = useState<string>(() => {
    const id = transaction?.account_id ?? defaultAccountId
    return id !== undefined ? String(id) : ""
  })
  const [categoryId, setCategoryId] = useState(
    transaction?.category_id != null ? String(transaction.category_id) : NO_CATEGORY,
  )
  const [notes, setNotes] = useState(transaction?.notes ?? "")

  // With a single account there's nothing to choose.
  const effectiveAccountId = accountId || (accounts?.length === 1 ? String(accounts[0].id) : "")
  const cents = parseAmount(amount)
  const amountInvalid = amount.trim() !== "" && (cents === null || cents === 0)
  const valid =
    cents !== null && cents > 0 && description.trim() !== "" && date !== "" && effectiveAccountId !== ""
  const pending = createTransaction.isPending || updateTransaction.isPending
  const options = categoriesFor(categories, direction)

  const changeDirection = (next: Direction) => {
    setDirection(next)
    if (!categoriesFor(categories, next).some((c) => String(c.id) === categoryId)) {
      setCategoryId(NO_CATEGORY)
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!valid || cents === null) return
    const fields = {
      account_id: Number(effectiveAccountId),
      date,
      description_raw: description.trim(),
      amount_cents: direction === "expense" ? -cents : cents,
      category_id: categoryId === NO_CATEGORY ? null : Number(categoryId),
      notes,
    }
    const callbacks = { onError: (err: Error) => toast.error(err.message) }

    if (!editing) {
      createTransaction.mutate(fields, {
        ...callbacks,
        onSuccess: () => {
          toast.success(t("transactions.form.toastAdded"))
          onClose()
        },
      })
      return
    }
    // Only send what changed: a category in the payload marks the row as
    // user-classified and reviewed, which shouldn't happen as a side effect.
    const original = transaction as unknown as Record<string, unknown>
    const payload: TransactionUpdate = Object.fromEntries(
      Object.entries(fields).filter(([key, value]) => original[key] !== value),
    )
    if (Object.keys(payload).length === 0) {
      onClose()
      return
    }
    updateTransaction.mutate(
      { id: transaction.id, payload },
      {
        ...callbacks,
        onSuccess: () => {
          toast.success(t("transactions.form.toastSaved"))
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? t("transactions.form.editTitle") : t("transactions.form.addTitle")}
          </DialogTitle>
          <DialogDescription>
            {editing && transaction.import_id !== null
              ? t("transactions.form.importedHint")
              : t("transactions.form.manualHint")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Segmented
            label={t("transactions.form.direction")}
            value={direction}
            onChange={changeDirection}
            options={directionOptions}
            className="w-full"
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="txn-amount">{t("common.amount")}</Label>
            <Input
              id="txn-amount"
              inputMode="decimal"
              autoComplete="off"
              autoFocus={!editing}
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={amountInvalid || undefined}
              aria-describedby="txn-amount-hint"
              className="h-12 font-figures text-2xl md:text-2xl"
            />
            <p
              id="txn-amount-hint"
              className={amountInvalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
            >
              {amountInvalid
                ? t("transactions.form.amountInvalid")
                : cents
                  ? formatMoney(direction === "expense" ? -cents : cents)
                  : t("transactions.form.amountHint")}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="txn-date">{t("common.date")}</Label>
              <Input
                id="txn-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="txn-account">{t("transactions.form.account")}</Label>
              <Select value={effectiveAccountId} onValueChange={setAccountId}>
                <SelectTrigger id="txn-account" className="w-full">
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
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="txn-description">{t("common.description")}</Label>
            <Input
              id="txn-description"
              value={description}
              placeholder={t("transactions.form.descriptionPlaceholder")}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="txn-category">{t("common.category")}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="txn-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>{t("common.uncategorized")}</SelectItem>
                {options.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="txn-notes">{t("transactions.notes")}</Label>
            <Textarea
              id="txn-notes"
              rows={2}
              value={notes}
              placeholder={t("transactions.notesPlaceholder")}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!valid || pending}>
              {editing ? t("common.save") : t("transactions.form.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
