import { toast } from "sonner"

import { useCategories, useDeleteRule, useRules } from "@/api/hooks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useT } from "@/lib/i18n"

export function RulesTab() {
  const t = useT()
  const { data: rules, isLoading } = useRules()
  const { data: categories } = useCategories(true)
  const deleteRule = useDeleteRule()

  const categoryName = (id: number) =>
    categories?.find((c) => c.id === id)?.name ?? `#${id}`

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.rules.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !rules?.length ? (
          <p className="text-sm text-muted-foreground">{t("settings.rules.noRulesYet")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.rules.matchText")}</TableHead>
                <TableHead>{t("common.category")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-mono text-sm">{rule.match_text}</TableCell>
                  <TableCell>{categoryName(rule.category_id)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        deleteRule.mutate(rule.id, { onError: (err) => toast.error(err.message) })
                      }
                      disabled={deleteRule.isPending}
                    >
                      {t("common.delete")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
