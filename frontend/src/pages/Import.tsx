import { Check, FileSpreadsheet, FileText, Inbox, Trash2 } from "lucide-react"
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
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { PageHeader } from "@/components/page-header"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { ReviewTable } from "@/pages/import/ReviewTable"

const STATUS_VARIANT: Record<
  ImportRead["status"],
  "info" | "default" | "success" | "destructive"
> = {
  queued: "info",
  extracting: "info",
  classifying: "info",
  review: "default",
  done: "success",
  error: "destructive",
}

const ACTIVE_STATUSES = new Set(["queued", "extracting", "classifying"])

const FILE_KINDS = [
  { ext: "PDF", className: "bg-[#ff3b30]" },
  { ext: "CSV", className: "bg-[#34c759]" },
  { ext: "XLSX", className: "bg-[#30b0c7]" },
]

function fileKind(filename: string) {
  const ext = filename.split(".").pop()?.toUpperCase() ?? ""
  return FILE_KINDS.find((k) => k.ext === ext) ?? { ext: ext.slice(0, 4), className: "bg-[#8e8e93]" }
}

function FileTile({ filename }: { filename: string }) {
  const kind = fileKind(filename)
  const Icon = kind.ext === "PDF" ? FileText : FileSpreadsheet
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-[9px] text-white",
        kind.className,
      )}
    >
      <Icon className="size-[18px]" />
    </span>
  )
}

/** The import flow is a real sequence: account, then files, then review. */
function Steps({ current }: { current: 1 | 2 | 3 }) {
  const { t } = useI18n()
  const steps = [t("import.stepAccount"), t("import.stepFiles"), t("import.stepReview")]
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
      {steps.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        return (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-hairline" aria-hidden />}
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold font-figures",
                done && "bg-primary text-primary-foreground",
                active && "bg-primary/14 text-primary ring-1 ring-primary/40",
                !done && !active && "bg-elevated text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : n}
            </span>
            <span
              className={cn(
                "font-medium",
                active ? "text-foreground" : "text-muted-foreground",
              )}
              aria-current={active ? "step" : undefined}
            >
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ImportRow({
  statementImport,
  selected,
  onSelect,
}: {
  statementImport: ImportRead
  selected: boolean
  onSelect: () => void
}) {
  const { t, tn, formatMoney } = useI18n()
  const deleteImport = useDeleteImport()
  const active = ACTIVE_STATUSES.has(statementImport.status)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      className={cn(
        "group flex cursor-pointer gap-3 rounded-xl px-3 py-3 transition-colors outline-none hover:bg-accent/70 focus-visible:ring-[3px] focus-visible:ring-ring/40",
        selected && "bg-primary/10 hover:bg-primary/12",
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <FileTile filename={statementImport.filename} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {statementImport.filename}
          </span>
          <Badge className="shrink-0" variant={STATUS_VARIANT[statementImport.status]}>
            {t(`import.status.${statementImport.status}`)}
          </Badge>
        </div>
        {active && <Progress value={statementImport.progress} className="my-1 h-1" />}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground font-figures">
          <span>{t("import.extracted", { count: statementImport.extracted_count })}</span>
          <span>{t("import.inserted", { count: statementImport.inserted_count })}</span>
          {statementImport.duplicate_count > 0 && (
            <span>{t("import.duplicates", { count: statementImport.duplicate_count })}</span>
          )}
          {statementImport.low_confidence_count > 0 && (
            <span className="text-warning">
              {t("import.lowConfidence", { count: statementImport.low_confidence_count })}
            </span>
          )}
          {!!statementImport.reconcile_diff_cents && (
            <span className="text-destructive">
              {t("import.reconcileDiff", {
                amount: formatMoney(statementImport.reconcile_diff_cents),
              })}
            </span>
          )}
        </div>
        {statementImport.error && (
          <p className="text-xs text-destructive">{statementImport.error}</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("common.delete")}
        className={cn(
          "-mr-1 shrink-0 self-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100",
          selected && "opacity-100",
        )}
        onClick={(e) => {
          e.stopPropagation()
          setConfirmingDelete(true)
        }}
        disabled={deleteImport.isPending}
      >
        <Trash2 />
      </Button>
      <div
        className="contents"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
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
  const step = !accountId ? 1 : selectedImport ? 3 : 2

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("import.title")} subtitle={t("import.subtitle")} />

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{t("import.account")}</span>
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
          <Steps current={step} />
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "relative flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-muted-foreground/25 bg-elevated/40 px-6 py-12 text-center transition-[background-color,border-color,box-shadow,transform] duration-200",
              dragOver && "scale-[1.01] border-primary bg-primary/8 shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_18%,transparent)]",
              !accountId && "opacity-70",
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
            <div className="flex items-end" aria-hidden>
              {FILE_KINDS.map((kind, i) => (
                <span
                  key={kind.ext}
                  className={cn(
                    "flex h-14 w-11 flex-col items-center justify-end rounded-[8px] pb-1.5 text-[9px] font-bold tracking-wide text-white shadow-md ring-2 ring-card transition-transform duration-200",
                    kind.className,
                    i === 0 && "-mr-2 -rotate-12",
                    i === 1 && "z-10 -translate-y-1.5",
                    i === 2 && "-ml-2 rotate-12",
                    dragOver && i === 0 && "-translate-x-1 -rotate-[16deg]",
                    dragOver && i === 1 && "-translate-y-3",
                    dragOver && i === 2 && "translate-x-1 rotate-[16deg]",
                  )}
                >
                  {kind.ext}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[17px] font-semibold tracking-[-0.015em]">
                {dragOver ? t("import.dropActive") : t("import.dropTitle")}
              </p>
              <p className="text-sm text-muted-foreground">
                {accountId ? t("import.dropFormats") : t("import.dropNeedsAccount")}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={createImports.isPending || !accountId}
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

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[340px_1fr]">
        <Card className="gap-3">
          <CardHeader>
            <CardTitle>{t("import.imports")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-0.5 px-2">
            {isLoading ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : !imports?.length ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">{t("import.noImportsYet")}</p>
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

        <Card className="min-w-0">
          {!selectedImport ? (
            <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-elevated text-muted-foreground">
                <Inbox className="size-6" />
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-[17px] font-semibold tracking-[-0.015em]">{t("import.review")}</p>
                <p className="max-w-xs text-sm text-muted-foreground">{t("import.selectImportHint")}</p>
              </div>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="truncate">{selectedImport.filename}</CardTitle>
                <p className="text-sm text-muted-foreground font-figures">
                  {t("import.inserted", { count: selectedImport.inserted_count })}
                  {selectedImport.low_confidence_count > 0 && (
                    <span className="text-warning">
                      {", "}
                      {t("import.lowConfidence", { count: selectedImport.low_confidence_count })}
                    </span>
                  )}
                </p>
                {!ACTIVE_STATUSES.has(selectedImport.status) && (
                  <CardAction className="flex gap-2">
                    <Button
                      variant="tinted"
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
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {ACTIVE_STATUSES.has(selectedImport.status) ? (
                  <p className="text-sm text-muted-foreground">
                    {t("import.stillProcessing", { status: t(`import.status.${selectedImport.status}`) })}
                  </p>
                ) : (
                  <ReviewTable importId={selectedImport.id} categories={categories ?? []} />
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
