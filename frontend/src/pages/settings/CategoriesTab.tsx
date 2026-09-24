import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  type CategoryRead,
  useArchiveCategory,
  useCategories,
  useCreateCategory,
  useMergeCategory,
  useReorderCategories,
  useUpdateCategory,
} from "@/api/hooks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/lib/i18n"

const KINDS = ["income", "expense", "transfer"] as const

function CategoryRow({
  category,
  onUpdate,
  onArchive,
  onMerge,
}: {
  category: CategoryRead
  onUpdate: (id: number, payload: Record<string, unknown>) => void
  onArchive: (id: number) => void
  onMerge: (category: CategoryRead) => void
}) {
  const t = useT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  })

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "bg-accent" : undefined}
    >
      <TableCell className="w-8">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </TableCell>
      <TableCell>
        <Input
          defaultValue={category.name}
          className="h-8 min-w-32"
          onBlur={(e) => {
            const value = e.target.value.trim()
            if (value && value !== category.name) onUpdate(category.id, { name: value })
          }}
        />
      </TableCell>
      <TableCell>
        <Select
          value={category.kind}
          onValueChange={(value) => onUpdate(category.id, { kind: value })}
        >
          <SelectTrigger className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(`category.kind.${kind}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          defaultValue={category.group ?? ""}
          className="h-8 w-28"
          placeholder="—"
          onBlur={(e) => {
            const value = e.target.value.trim()
            if (value !== (category.group ?? "")) onUpdate(category.id, { group: value || null })
          }}
        />
      </TableCell>
      <TableCell>
        <input
          type="color"
          defaultValue={category.color}
          className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
          onChange={(e) => onUpdate(category.id, { color: e.target.value })}
        />
      </TableCell>
      <TableCell>
        <Textarea
          defaultValue={category.llm_hint}
          className="h-8 min-h-8 w-48 resize-y"
          placeholder={t("settings.categories.llmHintPlaceholder")}
          onBlur={(e) => {
            const value = e.target.value
            if (value !== category.llm_hint) onUpdate(category.id, { llm_hint: value })
          }}
        />
      </TableCell>
      <TableCell>
        <Switch
          checked={category.exclude_from_totals}
          onCheckedChange={(checked) => onUpdate(category.id, { exclude_from_totals: checked })}
        />
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Button variant="ghost" size="sm" onClick={() => onMerge(category)}>
          {t("settings.categories.merge")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onArchive(category.id)}>
          {t("settings.categories.archive")}
        </Button>
      </TableCell>
    </TableRow>
  )
}

export function CategoriesTab() {
  const t = useT()
  const { data: categories, isLoading } = useCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const reorderCategories = useReorderCategories()
  const archiveCategory = useArchiveCategory()
  const mergeCategory = useMergeCategory()

  const [ordered, setOrdered] = useState<CategoryRead[]>([])
  useEffect(() => {
    if (categories) setOrdered(categories)
  }, [categories])

  const [newName, setNewName] = useState("")
  const [newKind, setNewKind] = useState<(typeof KINDS)[number]>("expense")
  const [mergeSource, setMergeSource] = useState<CategoryRead | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<string>("")

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ordered.findIndex((c) => c.id === active.id)
    const newIndex = ordered.findIndex((c) => c.id === over.id)
    const next = arrayMove(ordered, oldIndex, newIndex)
    setOrdered(next)
    reorderCategories.mutate(
      next.map((c) => c.id),
      { onError: (err) => toast.error(err.message) },
    )
  }

  const handleCreate = () => {
    if (!newName.trim()) return
    createCategory.mutate(
      {
        name: newName.trim(),
        kind: newKind,
        color: "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"),
        llm_hint: "",
        exclude_from_totals: false,
      },
      {
        onSuccess: () => setNewName(""),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  const handleUpdate = (id: number, payload: Record<string, unknown>) => {
    updateCategory.mutate({ id, payload }, { onError: (err) => toast.error(err.message) })
  }

  const handleArchive = (id: number) => {
    archiveCategory.mutate(id, { onError: (err) => toast.error(err.message) })
  }

  const confirmMerge = () => {
    if (!mergeSource || !mergeTargetId) return
    mergeCategory.mutate(
      { id: mergeSource.id, targetId: Number(mergeTargetId) },
      {
        onSuccess: () => {
          toast.success(
            t("settings.categories.toastMerged", {
              name: categories?.find((c) => c.id === Number(mergeTargetId))?.name ?? "",
            }),
          )
          setMergeSource(null)
          setMergeTargetId("")
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.categories.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input
            placeholder={t("settings.categories.newNamePlaceholder")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Select value={newKind} onValueChange={(v) => setNewKind(v as (typeof KINDS)[number])}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`category.kind.${kind}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleCreate} disabled={!newName.trim() || createCategory.isPending}>
            {t("common.add")}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("settings.categories.kind")}</TableHead>
                  <TableHead>{t("settings.categories.group")}</TableHead>
                  <TableHead>{t("settings.categories.color")}</TableHead>
                  <TableHead>{t("settings.categories.llmHint")}</TableHead>
                  <TableHead>{t("settings.categories.exclude")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext
                  items={ordered.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {ordered.map((category) => (
                    <CategoryRow
                      key={category.id}
                      category={category}
                      onUpdate={handleUpdate}
                      onArchive={handleArchive}
                      onMerge={(c) => setMergeSource(c)}
                    />
                  ))}
                </SortableContext>
              </TableBody>
            </Table>
          </DndContext>
        )}
      </CardContent>

      <Dialog open={mergeSource !== null} onOpenChange={(open) => !open && setMergeSource(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("settings.categories.mergeDialogTitle", { name: mergeSource?.name ?? "" })}
            </DialogTitle>
          </DialogHeader>
          <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("settings.categories.targetCategory")} />
            </SelectTrigger>
            <SelectContent>
              {categories
                ?.filter((c) => c.id !== mergeSource?.id)
                .map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {t("settings.categories.mergeDialogDescription", { name: mergeSource?.name ?? "" })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeSource(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirmMerge} disabled={!mergeTargetId || mergeCategory.isPending}>
              {t("settings.categories.merge")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
