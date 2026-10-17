import { Cpu, Landmark, ListFilter, Settings2, Tags, TriangleAlert } from "lucide-react"
import { useState } from "react"

import { PageHeader } from "@/components/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { AccountsTab } from "@/pages/settings/AccountsTab"
import { CategoriesTab } from "@/pages/settings/CategoriesTab"
import { DangerZoneTab } from "@/pages/settings/DangerZoneTab"
import { GeneralTab } from "@/pages/settings/GeneralTab"
import { LlmTab } from "@/pages/settings/LlmTab"
import { RulesTab } from "@/pages/settings/RulesTab"

const SECTIONS = [
  { value: "general", labelKey: "settings.tabGeneral", icon: Settings2, tile: "bg-[#8e8e93]", Content: GeneralTab },
  { value: "categories", labelKey: "settings.tabCategories", icon: Tags, tile: "bg-[#ff9500]", Content: CategoriesTab },
  { value: "accounts", labelKey: "settings.tabAccounts", icon: Landmark, tile: "bg-[#34c759]", Content: AccountsTab },
  { value: "rules", labelKey: "settings.tabRules", icon: ListFilter, tile: "bg-[#30b0c7]", Content: RulesTab },
  { value: "llm", labelKey: "settings.tabLlm", icon: Cpu, tile: "bg-[#5856d6]", Content: LlmTab },
  { value: "danger", labelKey: "settings.tabDanger", icon: TriangleAlert, tile: "bg-[#ff3b30]", Content: DangerZoneTab },
]

export function Settings() {
  const t = useT()
  const [section, setSection] = useState("general")
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.title")} />
      <Tabs value={section} onValueChange={setSection} className="lg:grid lg:grid-cols-[220px_1fr] lg:items-start lg:gap-6">
        {/* Narrow screens: segmented control. Wide screens: System Settings-style list. */}
        <TabsList className="max-w-full overflow-x-auto lg:hidden">
          {SECTIONS.map(({ value, labelKey }) => (
            <TabsTrigger key={value} value={value}>
              {t(labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
        <nav className="hidden flex-col gap-0.5 rounded-2xl bg-card p-2 shadow-surface backdrop-blur-xl lg:flex">
          {SECTIONS.map(({ value, labelKey, icon: Icon, tile }) => (
            <button
              key={value}
              type="button"
              aria-current={section === value ? "page" : undefined}
              onClick={() => setSection(value)}
              className={cn(
                "flex items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-left text-[13px] font-medium transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
                section === value && "bg-primary/12 text-primary hover:bg-primary/15",
              )}
            >
              <span className={cn("flex size-6 items-center justify-center rounded-[6px] text-white", tile)}>
                <Icon className="size-3.5" />
              </span>
              {t(labelKey)}
            </button>
          ))}
        </nav>
        {SECTIONS.map(({ value, Content }) => (
          <TabsContent key={value} value={value} className="mt-4 min-w-0 lg:mt-0">
            <Content />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
