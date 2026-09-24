import { useState } from "react"
import { toast } from "sonner"

import { useBulkUpdateTransactions, useCreateRule } from "@/api/hooks"
import type { TransactionRead } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatEUR } from "@/lib/format"
import { useI18n } from "@/lib/i18n"

export function BulkApplyDialog({
  categoryId,
  categoryName,
  initialSnippet,
  siblings,
  onDone,
}: {
  categoryId: number
  categoryName: string
  initialSnippet: string
  siblings: TransactionRead[]
  onDone: () => void
}) {
  const { t, tn, locale } = useI18n()
  const [titleBefore, titleAfter] = t("bulkApply.title").split("{{category}}")
  const [snippet, setSnippet] = useState(initialSnippet)
  const [alsoCreateRule, setAlsoCreateRule] = useState(true)
  const bulkUpdate = useBulkUpdateTransactions()
  const createRule = useCreateRule()

  const trimmed = snippet.trim()
  const matches = trimmed
    ? siblings.filter((t) => t.description_raw.toLowerCase().includes(trimmed.toLowerCase()))
    : []

  const handleApply = () => {
    if (!trimmed || matches.length === 0) return
    bulkUpdate.mutate(
      { ids: matches.map((t) => t.id), category_id: categoryId, reviewed: true },
      {
        onSuccess: () => {
          toast.success(tn("bulkApply.toastUpdated", matches.length))
          if (alsoCreateRule) {
            createRule.mutate(
              { match_text: trimmed, category_id: categoryId },
              { onError: (err) => toast.error(err.message) },
            )
          }
          onDone()
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {titleBefore}
            <span className="text-foreground">{categoryName}</span>
            {titleAfter}
          </DialogTitle>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-3">
          <p className="min-w-0 text-sm text-muted-foreground">{t("bulkApply.description")}</p>
          <Input
            value={snippet}
            onChange={(e) => setSnippet(e.target.value)}
            className="font-mono text-sm"
          />
          <div className="max-h-40 w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-md border text-sm">
            {matches.length === 0 ? (
              <p className="p-2 text-muted-foreground">{t("bulkApply.noMatches")}</p>
            ) : (
              <ul className="w-full min-w-0 divide-y">
                {matches.map((t) => (
                  <li key={t.id} className="flex w-full min-w-0 items-center justify-between gap-2 p-2">
                    <span className="min-w-0 flex-1 truncate" title={t.description_raw}>
                      {t.description_raw}
                    </span>
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {formatEUR(t.amount_cents, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={alsoCreateRule}
              onCheckedChange={(checked) => setAlsoCreateRule(checked === true)}
            />
            {t("bulkApply.alsoCreateRule")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            {t("common.skip")}
          </Button>
          <Button disabled={matches.length === 0 || bulkUpdate.isPending} onClick={handleApply}>
            {tn("bulkApply.applyButton", matches.length)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
