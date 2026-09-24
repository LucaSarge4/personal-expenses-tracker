import { Route, Routes } from "react-router-dom"

import { AppShell } from "@/components/app-shell"
import { Advice } from "@/pages/Advice"
import { Dashboard } from "@/pages/Dashboard"
import { Import } from "@/pages/Import"
import { Settings } from "@/pages/Settings"
import { Transactions } from "@/pages/Transactions"

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="import" element={<Import />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="advice" element={<Advice />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
