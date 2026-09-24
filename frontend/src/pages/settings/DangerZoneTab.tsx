import { useState } from "react"
import { toast } from "sonner"

import { useAdminReset } from "@/api/hooks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/lib/i18n"

const CONFIRM_WORD = "DELETE"

const TARGETS = [
  { key: "transactions" as const, labelKey: "transactions", descriptionKey: "transactionsDesc" },
  { key: "imports" as const, labelKey: "imports", descriptionKey: "importsDesc" },
  { key: "rules" as const, labelKey: "rules", descriptionKey: "rulesDesc" },
  { key: "categories" as const, labelKey: "categories", descriptionKey: "categoriesDesc" },
  { key: "accounts" as const, labelKey: "accounts", descriptionKey: "accountsDesc" },
]

type TargetKey = (typeof TARGETS)[number]["key"]

export function DangerZoneTab() {
  const { t, tn } = useI18n()
  const [selected, setSelected] = useState<Set<TargetKey>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const adminReset = useAdminReset()

  const toggle = (key: TargetKey, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const allSelected = selected.size === TARGETS.length
  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(TARGETS.map((t) => t.key)) : new Set())
  }

  const openConfirm = () => {
    setConfirmText("")
    setConfirmOpen(true)
  }

  const handleDelete = () => {
    const payload = Object.fromEntries(TARGETS.map((t) => [t.key, selected.has(t.key)])) as Record<
      TargetKey,
      boolean
    >
    adminReset.mutate(payload, {
      onSuccess: (result) => {
        const parts = [
          result.transactions_deleted &&
            tn("settings.danger.countTransactions", result.transactions_deleted),
          result.imports_deleted && tn("settings.danger.countImports", result.imports_deleted),
          result.rules_deleted && tn("settings.danger.countRules", result.rules_deleted),
          result.categories_deleted &&
            tn("settings.danger.countCategories", result.categories_deleted),
          result.accounts_deleted && tn("settings.danger.countAccounts", result.accounts_deleted),
        ].filter(Boolean)
        toast.success(
          parts.length
            ? t("settings.danger.toastDeleted", { parts: parts.join(", ") })
            : t("settings.danger.toastNothingToDelete"),
        )
        setConfirmOpen(false)
        setSelected(new Set())
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">{t("settings.danger.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t("settings.danger.description")}{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">data/backups/</code>
          {t("settings.danger.descriptionSuffix")}
        </p>

        <label className="flex items-center gap-2 border-b pb-2 text-sm font-medium">
          <Checkbox checked={allSelected} onCheckedChange={(c) => toggleAll(c === true)} />
          {t("settings.danger.selectAll")}
        </label>

        <div className="flex flex-col gap-3">
          {TARGETS.map((target) => (
            <label key={target.key} className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={selected.has(target.key)}
                onCheckedChange={(c) => toggle(target.key, c === true)}
              />
              <span>
                <span className="font-medium">{t(`settings.danger.${target.labelKey}`)}</span>
                <span className="block text-xs text-muted-foreground">
                  {t(`settings.danger.${target.descriptionKey}`)}
                </span>
              </span>
            </label>
          ))}
        </div>

        <Button
          variant="destructive"
          className="w-fit"
          disabled={selected.size === 0}
          onClick={openConfirm}
        >
          {t("settings.danger.deleteSelected")}
        </Button>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tn("settings.danger.confirmTitle", selected.size)}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {TARGETS.filter((target) => selected.has(target.key)).map((target) => (
                <li key={target.key}>{t(`settings.danger.${target.labelKey}`)}</li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              {t("settings.danger.confirmHint")}{" "}
              <span className="font-mono font-semibold text-foreground">{CONFIRM_WORD}</span>{" "}
              {t("settings.danger.confirmHintSuffix")}
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== CONFIRM_WORD || adminReset.isPending}
              onClick={handleDelete}
            >
              {adminReset.isPending ? t("settings.danger.deleting") : t("settings.danger.deletePermanently")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
