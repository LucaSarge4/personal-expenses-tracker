import type { ReactNode } from "react"

/** Large title on the left, page-level controls on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-[26px] leading-[1.1] sm:text-[30px] font-bold tracking-[-0.025em]">{title}</h1>
        {subtitle && <p className="max-w-prose text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
