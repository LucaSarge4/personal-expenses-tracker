import { Lightbulb, LayoutDashboard, Settings2, Upload, WalletCards } from "lucide-react"
import { NavLink, Outlet } from "react-router-dom"

import { ThemeToggle } from "@/components/theme-toggle"
import { Toaster } from "@/components/ui/sonner"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/import", labelKey: "nav.import", icon: Upload },
  { to: "/transactions", labelKey: "nav.transactions", icon: WalletCards },
  { to: "/advice", labelKey: "nav.advice", icon: Lightbulb },
  { to: "/settings", labelKey: "nav.settings", icon: Settings2 },
]

export function AppShell() {
  const t = useT()
  return (
    <div className="flex h-svh overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-card">
        <div className="px-4 py-4 text-lg font-semibold">{t("app.title")}</div>
        <nav className="flex flex-1 flex-col gap-1 px-2">
          {NAV_ITEMS.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                )
              }
            >
              <Icon className="size-4" />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-xs text-muted-foreground">{t("app.localOnly")}</span>
          <ThemeToggle />
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}
