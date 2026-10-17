import { ArrowDown, ArrowUp, PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { deltaPercent, formatPercent } from "@/lib/format"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Accent = "green" | "orange" | "blue" | "purple"

const ACCENTS: Record<Accent, { icon: LucideIcon; tileClass: string }> = {
  green: { icon: TrendingUp, tileClass: "bg-income" },
  orange: { icon: TrendingDown, tileClass: "bg-spend" },
  blue: { icon: Wallet, tileClass: "bg-primary" },
  purple: { icon: PiggyBank, tileClass: "bg-info" },
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
  const { icon: Icon, tileClass } = ACCENTS[accent]

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="flex items-center gap-2.5">
        <span className={cn("flex size-7 items-center justify-center rounded-[8px] text-white", tileClass)}>
          <Icon className="size-4" />
        </span>
        <CardTitle className="text-[13px] font-medium tracking-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-2xl leading-none font-semibold font-figures sm:text-[30px]">
          {isPercent ? formatPercent(cents) : formatMoney(cents)}
        </span>
        {delta !== null && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold font-figures",
              good && "bg-income/14 text-income",
              bad && "bg-destructive/12 text-destructive",
              !good && !bad && "bg-elevated text-muted-foreground",
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
