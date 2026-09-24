import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"
import { useT } from "@/lib/i18n"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const t = useT()
  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={t("app.toggleTheme")}>
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
