import { Lightbulb, LayoutDashboard, Lock, Settings2, Upload, WalletCards } from "lucide-react"
import { NavLink, Outlet } from "react-router-dom"

import { ThemeToggle } from "@/components/theme-toggle"
import { Toaster } from "@/components/ui/sonner"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// Each nav icon sits in a colored tile, like macOS System Settings.
const NAV_ITEMS = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, tile: "bg-[#5856d6]" },
  { to: "/import", labelKey: "nav.import", icon: Upload, tile: "bg-[#30b0c7]" },
  { to: "/transactions", labelKey: "nav.transactions", icon: WalletCards, tile: "bg-[#34c759]" },
  { to: "/advice", labelKey: "nav.advice", icon: Lightbulb, tile: "bg-[#ff9500]" },
  { to: "/settings", labelKey: "nav.settings", icon: Settings2, tile: "bg-[#8e8e93]" },
]

export function AppShell() {
  const t = useT()
  return (
    <div className="ambient-field flex h-svh flex-col overflow-hidden md:flex-row">
      <aside className="m-2 mr-0 hidden w-56 shrink-0 flex-col overflow-hidden rounded-2xl bg-card shadow-surface md:flex backdrop-blur-2xl backdrop-saturate-150">
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
          <span className="flex size-8 items-center justify-center rounded-[9px] bg-gradient-to-br from-accent-light to-primary text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]">
            <WalletCards className="size-[18px]" />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">{t("app.title")}</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV_ITEMS.map(({ to, labelKey, icon: Icon, tile }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-[13px] font-medium transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  isActive && "bg-primary/12 text-primary hover:bg-primary/15",
                )
              }
            >
              <span className={cn("flex size-6 items-center justify-center rounded-[6px] text-white", tile)}>
                <Icon className="size-3.5" />
              </span>
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center justify-between border-t border-hairline px-4 py-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3" />
            {t("app.localOnly")}
          </span>
          <ThemeToggle />
        </div>
      </aside>
      {/* Phones: slim top bar + bottom tab bar instead of the sidebar. */}
      <header className="flex shrink-0 items-center justify-between border-b border-hairline bg-card px-4 py-2 backdrop-blur-2xl md:hidden">
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="flex size-7 items-center justify-center rounded-[8px] bg-gradient-to-br from-accent-light to-primary text-white">
            <WalletCards className="size-4" />
          </span>
          {t("app.title")}
        </span>
        <ThemeToggle />
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-8 sm:px-6 md:px-8 md:pt-8 md:pb-12">
          <Outlet />
        </div>
      </main>
      <nav className="flex shrink-0 justify-around border-t border-hairline bg-card px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur-2xl md:hidden">
        {NAV_ITEMS.map(({ to, labelKey, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                isActive && "text-primary",
              )
            }
          >
            <Icon className="size-[22px]" strokeWidth={1.75} />
            <span className="max-w-full truncate">{t(labelKey)}</span>
          </NavLink>
        ))}
      </nav>
      <Toaster />
    </div>
  )
}
