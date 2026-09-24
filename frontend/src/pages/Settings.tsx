import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useT } from "@/lib/i18n"
import { AccountsTab } from "@/pages/settings/AccountsTab"
import { CategoriesTab } from "@/pages/settings/CategoriesTab"
import { DangerZoneTab } from "@/pages/settings/DangerZoneTab"
import { GeneralTab } from "@/pages/settings/GeneralTab"
import { LlmTab } from "@/pages/settings/LlmTab"
import { RulesTab } from "@/pages/settings/RulesTab"

export function Settings() {
  const t = useT()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">{t("settings.tabGeneral")}</TabsTrigger>
          <TabsTrigger value="categories">{t("settings.tabCategories")}</TabsTrigger>
          <TabsTrigger value="accounts">{t("settings.tabAccounts")}</TabsTrigger>
          <TabsTrigger value="rules">{t("settings.tabRules")}</TabsTrigger>
          <TabsTrigger value="llm">{t("settings.tabLlm")}</TabsTrigger>
          <TabsTrigger value="danger">{t("settings.tabDanger")}</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-4">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="accounts" className="mt-4">
          <AccountsTab />
        </TabsContent>
        <TabsContent value="rules" className="mt-4">
          <RulesTab />
        </TabsContent>
        <TabsContent value="llm" className="mt-4">
          <LlmTab />
        </TabsContent>
        <TabsContent value="danger" className="mt-4">
          <DangerZoneTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
