import { ArrowLeftRight, Trash2 } from "lucide-react"
import { Fragment, useState } from "react"
import { toast } from "sonner"

import type { CategoryRead } from "@/api/hooks"
import {
  useCreateRule,
  useDeleteTransaction,
  useTransactions,
  useUpdateTransaction,
} from "@/api/hooks"
import type { TransactionRead } from "@/api/types"
import { BulkApplyDialog } from "@/components/bulk-apply-dialog"
import { Button } from "@/components/ui/button"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { ExpandableText } from "@/components/expandable-text"
import { Input } from "@/components/ui/input"
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
import { formatDate } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { guessMerchantSnippet } from "@/lib/merchant"
import { cn } from "@/lib/utils"

const UNCATEGORIZED = "none"

function RuleSuggestion({
  categoryId,
  categoryName,
  description,
  onDone,
}: {
  categoryId: number
  categoryName: string
  description: string
  onDone: () => void
}) {
  const { t } = useI18n()
  // Default to the full description rather than guessing a substring: this
  // app's `counterparty` field is just a normalized copy of the whole
  // description (not an extracted merchant name), so for statement lines
  // like "Pagamento tramite POS 4 1619 PAGAMENTO POS ... ESSELUNGA" any
  // fixed-length prefix grabs generic boilerplate instead of the merchant.
  // Showing the full text and letting the user trim it is more honest than
  // guessing wrong.
  const [snippet, setSnippet] = useState(description.trim())
  const createRule = useCreateRule()

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 text-sm">
      <p className="text-muted-foreground">
        {t("review.ruleSuggestionQuestion")}{" "}
        <span className="font-medium text-foreground">{categoryName}</span>?
      </p>
      <Input
        value={snippet}
        onChange={(e) => setSnippet(e.target.value)}
        className="font-mono text-xs"
      />
      <p className="text-xs text-muted-foreground">{t("review.ruleSuggestionHint")}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!snippet.trim() || createRule.isPending}
          onClick={() =>
            createRule.mutate(
              { match_text: snippet.trim(), category_id: categoryId },
              {
                onSuccess: () => {
                  toast.success(t("review.toastRuleCreated"))
                  onDone()
                },
                onError: (err) => toast.error(err.message),
              },
            )
          }
        >
          {t("review.createRule")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t("review.dismiss")}
        </Button>
      </div>
    </div>
  )
}

export function ReviewTable({
  importId,
  categories,
}: {
  importId: number
  categories: CategoryRead[]
}) {
  const { t, locale, formatMoney } = useI18n()
  const { data, isLoading } = useTransactions({ import_id: importId, page_size: 500 })
  const updateTransaction = useUpdateTransaction()
  const deleteTransaction = useDeleteTransaction()
  const [suggestFor, setSuggestFor] = useState<{
    txnId: number
    categoryId: number
    categoryName: string
  } | null>(null)
  const [bulkDialog, setBulkDialog] = useState<{
    categoryId: number
    categoryName: string
    snippet: string
    siblings: TransactionRead[]
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TransactionRead | null>(null)
  const [skipPairTarget, setSkipPairTarget] = useState<{
    a: TransactionRead
    b: TransactionRead
  } | null>(null)

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("review.loadingTransactions")}</p>
  if (!data?.items.length) {
    return <p className="text-sm text-muted-foreground">{t("review.noTransactions")}</p>
  }

  return (
    <>
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("common.date")}</TableHead>
          <TableHead>{t("common.description")}</TableHead>
          <TableHead className="text-right">{t("common.amount")}</TableHead>
          <TableHead>{t("common.category")}</TableHead>
          <TableHead>{t("review.confidence")}</TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.items.map((txn) => {
          const lowConfidence = txn.confidence !== null && txn.confidence < 0.7
          const suggesting = suggestFor?.txnId === txn.id
          // A net-zero pair: same description, opposite amount (e.g. Revolut
          // Pocket transfers, which always post a matching +X and -X line).
          const pairTxn = data.items.find(
            (t) =>
              t.id !== txn.id &&
              t.description_raw === txn.description_raw &&
              t.amount_cents === -txn.amount_cents,
          )
          return (
            <Fragment key={txn.id}>
              <TableRow className={cn(lowConfidence && "bg-amber-500/10")}>
                <TableCell className="whitespace-nowrap">{formatDate(txn.date, locale)}</TableCell>
                <TableCell className="max-w-xs">
                  <ExpandableText text={txn.description_raw} />
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono whitespace-nowrap",
                    txn.amount_cents < 0 ? "text-foreground" : "text-emerald-600",
                  )}
                >
                  {formatMoney(txn.amount_cents)}
                </TableCell>
                <TableCell>
                  <Select
                    value={txn.category_id !== null ? String(txn.category_id) : UNCATEGORIZED}
                    onValueChange={(value) => {
                      const categoryId = value === UNCATEGORIZED ? null : Number(value)
                      updateTransaction.mutate(
                        { id: txn.id, payload: { category_id: categoryId } },
                        {
                          onSuccess: () => {
                            if (categoryId !== null) {
                              const category = categories.find((c) => c.id === categoryId)
                              const categoryName = category?.name ?? ""
                              const guess = guessMerchantSnippet(txn.description_raw)
                              const siblings = (data?.items ?? []).filter(
                                (t) =>
                                  t.id !== txn.id &&
                                  t.description_raw.toLowerCase().includes(guess.toLowerCase()),
                              )
                              if (siblings.length > 0) {
                                setBulkDialog({ categoryId, categoryName, snippet: guess, siblings })
                              } else {
                                setSuggestFor({ txnId: txn.id, categoryId, categoryName })
                              }
                            }
                          },
                          onError: (err) => toast.error(err.message),
                        },
                      )
                    }}
                  >
                    <SelectTrigger className="h-8 w-44">
                      <SelectValue placeholder={t("common.uncategorized")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNCATEGORIZED}>{t("common.uncategorized")}</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {txn.confidence !== null ? `${Math.round(txn.confidence * 100)}%` : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {pairTxn && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-foreground"
                      title={t("review.skipPairTooltip")}
                      onClick={() => setSkipPairTarget({ a: txn, b: pairTxn })}
                    >
                      <ArrowLeftRight className="size-4" />
                    </Button>
                  )}
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
              {suggesting && suggestFor && (
                <TableRow>
                  <TableCell colSpan={6} className="py-2">
                    <RuleSuggestion
                      categoryId={suggestFor.categoryId}
                      categoryName={suggestFor.categoryName}
                      description={txn.description_raw}
                      onDone={() => setSuggestFor(null)}
                    />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        })}
      </TableBody>
      </Table>
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
      <ConfirmDeleteDialog
        open={skipPairTarget !== null}
        onOpenChange={(open) => !open && setSkipPairTarget(null)}
        title={t("review.skipPairTitle")}
        description={
          skipPairTarget
            ? t("review.skipPairDescription", {
                description: skipPairTarget.a.description_raw,
                amountA: formatMoney(skipPairTarget.a.amount_cents),
                amountB: formatMoney(skipPairTarget.b.amount_cents),
              })
            : ""
        }
        pending={deleteTransaction.isPending}
        onConfirm={async () => {
          if (!skipPairTarget) return
          try {
            await deleteTransaction.mutateAsync(skipPairTarget.a.id)
            await deleteTransaction.mutateAsync(skipPairTarget.b.id)
            toast.success(t("review.toastPairSkipped"))
            setSkipPairTarget(null)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t("review.toastSkipPairFailed"))
          }
        }}
      />
    </>
  )
}
