import { ArrowDown, ArrowUp, PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { deltaPercent, formatPercent } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Accent = "green" | "orange" | "blue" | "purple"

const ACCENTS: Record<
  Accent,
  { icon: LucideIcon; iconClass: string; tintClass: string }
> = {
  green: {
    icon: TrendingUp,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    tintClass: "bg-emerald-500/10",
  },
  orange: {
    icon: TrendingDown,
    iconClass: "text-orange-600 dark:text-orange-400",
    tintClass: "bg-orange-500/10",
  },
  blue: {
    icon: Wallet,
    iconClass: "text-blue-600 dark:text-blue-400",
    tintClass: "bg-blue-500/10",
  },
  purple: {
    icon: PiggyBank,
    iconClass: "text-purple-600 dark:text-purple-400",
    tintClass: "bg-purple-500/10",
  },
}

export function Kpi({
  label,
  cents,
  prevCents,
  goodDirection = "up",
  isPercent = false,
  accent = "blue",
}: {
  label: string
  cents: number
  prevCents: number
  goodDirection?: "up" | "down"
  isPercent?: boolean
  accent?: Accent
}) {
  const { formatMoney } = useI18n()
  const delta = isPercent ? cents - prevCents : deltaPercent(cents, prevCents)
  const positive = delta !== null && delta > 0
  const negative = delta !== null && delta < 0
  const good = goodDirection === "up" ? positive : negative
  const bad = goodDirection === "up" ? negative : positive
  const { icon: Icon, iconClass, tintClass } = ACCENTS[accent]

  return (
    <Card className="gap-3 py-5 transition-shadow hover:shadow-md">
      <CardHeader className="flex-row items-center justify-between pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className={cn("flex size-8 items-center justify-center rounded-full", tintClass)}>
          <Icon className={cn("size-4", iconClass)} />
        </span>
      </CardHeader>
      <CardContent className="flex items-end justify-between">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">
          {isPercent ? formatPercent(cents) : formatMoney(cents)}
        </span>
        {delta !== null && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium",
              good && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              bad && "bg-red-500/10 text-red-600 dark:text-red-400",
              !good && !bad && "text-muted-foreground",
            )}
          >
            {positive ? <ArrowUp className="size-3" /> : negative ? <ArrowDown className="size-3" /> : null}
            {isPercent
              ? `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp`
              : formatPercent(Math.abs(delta))}
          </span>
        )}
      </CardContent>
    </Card>
  )
}
