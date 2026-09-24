import { useState } from "react"
import { toast } from "sonner"

import {
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useUpdateAccount,
} from "@/api/hooks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useT } from "@/lib/i18n"

export function AccountsTab() {
  const t = useT()
  const { data: accounts, isLoading } = useAccounts()
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()
  const deleteAccount = useDeleteAccount()

  const [name, setName] = useState("")
  const [bank, setBank] = useState("")

  const handleCreate = () => {
    if (!name.trim()) return
    createAccount.mutate(
      { name: name.trim(), bank, currency: "EUR", notes: "" },
      {
        onSuccess: () => {
          setName("")
          setBank("")
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  const handleDelete = (id: number) => {
    deleteAccount.mutate(id, {
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.accounts.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input
            placeholder={t("settings.accounts.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder={t("settings.accounts.bankPlaceholder")}
            value={bank}
            onChange={(e) => setBank(e.target.value)}
          />
          <Button onClick={handleCreate} disabled={!name.trim() || createAccount.isPending}>
            {t("common.add")}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !accounts?.length ? (
          <p className="text-sm text-muted-foreground">{t("settings.accounts.noAccountsYet")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("settings.accounts.bank")}</TableHead>
                <TableHead>{t("settings.accounts.currency")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <Input
                      defaultValue={account.name}
                      onBlur={(e) => {
                        const value = e.target.value.trim()
                        if (value && value !== account.name) {
                          updateAccount.mutate({ id: account.id, payload: { name: value } })
                        }
                      }}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      defaultValue={account.bank}
                      onBlur={(e) => {
                        const value = e.target.value
                        if (value !== account.bank) {
                          updateAccount.mutate({ id: account.id, payload: { bank: value } })
                        }
                      }}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {account.currency}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(account.id)}
                      disabled={deleteAccount.isPending}
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
