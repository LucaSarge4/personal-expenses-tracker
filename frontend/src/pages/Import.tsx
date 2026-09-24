import { useRef, useState } from "react"
import { toast } from "sonner"

import type { ImportRead } from "@/api/hooks"
import {
  useAccounts,
  useCategories,
  useConfirmImport,
  useCreateImports,
  useDeleteImport,
  useImports,
  useReclassifyImport,
} from "@/api/hooks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatEUR } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { ReviewTable } from "@/pages/import/ReviewTable"

const STATUS_VARIANT: Record<ImportRead["status"], "secondary" | "default" | "outline" | "destructive"> = {
  queued: "secondary",
  extracting: "secondary",
  classifying: "secondary",
  review: "default",
  done: "outline",
  error: "destructive",
}

const ACTIVE_STATUSES = new Set(["queued", "extracting", "classifying"])

function ImportRow({
  statementImport,
  selected,
  onSelect,
}: {
  statementImport: ImportRead
  selected: boolean
  onSelect: () => void
}) {
  const { t, tn, locale } = useI18n()
  const deleteImport = useDeleteImport()
  const active = ACTIVE_STATUSES.has(statementImport.status)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div
      className={cn(
        "flex cursor-pointer flex-col gap-1.5 rounded-md border px-3 py-2 hover:bg-accent/50",
        selected && "border-primary bg-accent/40",
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {statementImport.filename}
        </span>
        <Badge className="shrink-0" variant={STATUS_VARIANT[statementImport.status]}>
          {t(`import.status.${statementImport.status}`)}
        </Badge>
      </div>
      {active && <Progress value={statementImport.progress} className="h-1.5" />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{t("import.extracted", { count: statementImport.extracted_count })}</span>
        <span>{t("import.inserted", { count: statementImport.inserted_count })}</span>
        {statementImport.duplicate_count > 0 && (
          <span>{t("import.duplicates", { count: statementImport.duplicate_count })}</span>
        )}
        {statementImport.low_confidence_count > 0 && (
          <span className="text-amber-600">
            {t("import.lowConfidence", { count: statementImport.low_confidence_count })}
          </span>
        )}
        {!!statementImport.reconcile_diff_cents && (
          <span className="text-destructive">
            {t("import.reconcileDiff", {
              amount: formatEUR(statementImport.reconcile_diff_cents, locale),
            })}
          </span>
        )}
        {statementImport.error && <span className="text-destructive">{statementImport.error}</span>}
      </div>
      <div
        className="flex gap-2 pt-1"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-destructive"
          onClick={() => setConfirmingDelete(true)}
          disabled={deleteImport.isPending}
        >
          {t("common.delete")}
        </Button>
      </div>
      <ConfirmDeleteDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t("import.deleteTitle")}
        description={t("import.deleteDescription", {
          filename: statementImport.filename,
          transactions: tn("import.deleteDescriptionTransactions", statementImport.inserted_count),
        })}
        pending={deleteImport.isPending}
        onConfirm={() =>
          deleteImport.mutate(statementImport.id, {
            onSuccess: () => setConfirmingDelete(false),
            onError: (err) => toast.error(err.message),
          })
        }
      />
    </div>
  )
}

export function Import() {
  const { t } = useI18n()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const { data: imports, isLoading } = useImports()
  const createImports = useCreateImports()
  const confirmImport = useConfirmImport()
  const reclassifyImport = useReclassifyImport()

  const [accountId, setAccountId] = useState<string>("")
  const [selectedImportId, setSelectedImportId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const uploadFiles = (files: FileList | null) => {
    if (!files?.length || !accountId) {
      if (!accountId) toast.error(t("import.toastChooseAccount"))
      return
    }
    createImports.mutate(
      { accountId: Number(accountId), files: Array.from(files) },
      {
        onSuccess: (created) => {
          if (created.length === 1) setSelectedImportId(created[0].id)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  const selectedImport = imports?.find((i) => i.id === selectedImportId) ?? null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("import.title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("import.uploadTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("import.account")}</span>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder={t("import.selectAccount")} />
              </SelectTrigger>
              <SelectContent>
                {accounts?.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!accounts?.length && (
              <span className="text-xs text-muted-foreground">{t("import.createAccountFirst")}</span>
            )}
          </div>

          <div
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center text-sm text-muted-foreground transition-colors",
              dragOver && "border-primary bg-accent/30",
            )}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              uploadFiles(e.dataTransfer.files)
            }}
          >
            <p>{t("import.dragHint")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={createImports.isPending}
            >
              {createImports.isPending ? t("import.uploading") : t("import.chooseFiles")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.csv,.xlsx"
              className="hidden"
              onChange={(e) => {
                uploadFiles(e.target.files)
                e.target.value = ""
              }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("import.imports")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : !imports?.length ? (
              <p className="text-sm text-muted-foreground">{t("import.noImportsYet")}</p>
            ) : (
              imports.map((statementImport) => (
                <ImportRow
                  key={statementImport.id}
                  statementImport={statementImport}
                  selected={statementImport.id === selectedImportId}
                  onSelect={() => setSelectedImportId(statementImport.id)}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {selectedImport
                ? `${t("import.review")} · ${selectedImport.filename}`
                : t("import.review")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!selectedImport ? (
              <p className="text-sm text-muted-foreground">{t("import.selectImportHint")}</p>
            ) : ACTIVE_STATUSES.has(selectedImport.status) ? (
              <p className="text-sm text-muted-foreground">
                {t("import.stillProcessing", { status: t(`import.status.${selectedImport.status}`) })}
              </p>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reclassifyImport.mutate(selectedImport.id)}
                    disabled={reclassifyImport.isPending}
                  >
                    {t("import.reclassify")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      confirmImport.mutate(selectedImport.id, {
                        onSuccess: () => toast.success(t("import.toastConfirmed")),
                        onError: (err) => toast.error(err.message),
                      })
                    }
                    disabled={confirmImport.isPending || selectedImport.status === "done"}
                  >
                    {selectedImport.status === "done" ? t("import.confirmed") : t("import.confirmAll")}
                  </Button>
                </div>
                <ReviewTable importId={selectedImport.id} categories={categories ?? []} />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
