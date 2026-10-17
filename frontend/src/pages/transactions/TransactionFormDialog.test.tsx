import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"

import { Transactions } from "@/pages/Transactions"
import { todayIso } from "@/pages/transactions/shared"
import { callsTo, FakeResponse, mockApi } from "@/test/fake-api"
import { makeAccount, makeCategory, makeTransaction } from "@/test/factories"
import { renderWithProviders } from "@/test/render"

const CATEGORIES = [
  makeCategory({ id: 1, name: "Groceries", kind: "expense" }),
  makeCategory({ id: 2, name: "Salary", kind: "income" }),
  makeCategory({ id: 3, name: "Savings transfer", kind: "transfer" }),
]

function setup(overrides: Parameters<typeof mockApi>[0] = {}, extra: ReactNode = null) {
  mockApi({
    "GET /api/accounts": [makeAccount({ id: 4, name: "Checking" })],
    "GET /api/categories": CATEGORIES,
    "POST /api/transactions": (call: { body: unknown }) => makeTransaction(call.body as object),
    "PATCH /api/transactions/{id}": (call: { body: unknown }) => makeTransaction(call.body as object),
    ...overrides,
  })
  renderWithProviders(
    <>
      <Transactions />
      {extra}
    </>,
    { route: "/transactions" },
  )
  return userEvent.setup()
}

async function openAddForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Add transaction" }))
  return screen.findByRole("dialog")
}

async function pickCategory(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, name: string) {
  await user.click(within(dialog).getByRole("combobox", { name: "Category" }))
  await user.click(await screen.findByRole("option", { name }))
}

describe("Transaction form", () => {
  it("adds an expense as a negative amount on the only account", async () => {
    const user = setup()
    const dialog = await openAddForm(user)

    await user.type(within(dialog).getByLabelText("Amount"), "12,50")
    expect(within(dialog).getByText("-€12.50")).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText("Description"), "Coffee")
    await pickCategory(user, dialog, "Groceries")
    await user.click(within(dialog).getByRole("button", { name: "Add" }))

    await waitFor(() => expect(callsTo("POST /api/transactions")).toHaveLength(1))
    expect(callsTo("POST /api/transactions")[0].body).toEqual({
      account_id: 4,
      date: todayIso(),
      description_raw: "Coffee",
      amount_cents: -1250,
      category_id: 1,
      notes: "",
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("adds income as a positive amount and offers income categories", async () => {
    const user = setup()
    const dialog = await openAddForm(user)

    await user.click(within(dialog).getByRole("radio", { name: "Income" }))
    await user.click(within(dialog).getByRole("combobox", { name: "Category" }))
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent)
    expect(options).toEqual(["Uncategorized", "Salary", "Savings transfer"])
    await user.click(screen.getByRole("option", { name: "Salary" }))

    await user.type(within(dialog).getByLabelText("Amount"), "2.500")
    await user.type(within(dialog).getByLabelText("Description"), "October salary")
    await user.click(within(dialog).getByRole("button", { name: "Add" }))

    await waitFor(() => expect(callsTo("POST /api/transactions")).toHaveLength(1))
    expect(callsTo("POST /api/transactions")[0].body).toMatchObject({ amount_cents: 250000, category_id: 2 })
  })

  it("drops a category that doesn't fit when switching direction", async () => {
    const user = setup()
    const dialog = await openAddForm(user)
    await pickCategory(user, dialog, "Groceries")
    await user.click(within(dialog).getByRole("radio", { name: "Income" }))
    expect(within(dialog).getByRole("combobox", { name: "Category" })).toHaveTextContent("Uncategorized")
  })

  it("keeps Add disabled until the form is complete and explains a bad amount", async () => {
    const user = setup()
    const dialog = await openAddForm(user)
    const add = within(dialog).getByRole("button", { name: "Add" })
    expect(add).toBeDisabled()

    await user.type(within(dialog).getByLabelText("Amount"), "abc")
    expect(within(dialog).getByText("Enter an amount like 12,50 or 12.50.")).toBeInTheDocument()
    expect(within(dialog).getByLabelText("Amount")).toHaveAttribute("aria-invalid", "true")

    await user.clear(within(dialog).getByLabelText("Amount"))
    await user.type(within(dialog).getByLabelText("Amount"), "5")
    expect(add).toBeDisabled() // still no description
    await user.type(within(dialog).getByLabelText("Description"), "Parking")
    expect(add).toBeEnabled()
  })

  it("asks for an account when there is more than one", async () => {
    const user = setup({
      "GET /api/accounts": [makeAccount({ id: 1, name: "Checking" }), makeAccount({ id: 2, name: "Card" })],
    })
    const dialog = await openAddForm(user)
    await user.type(within(dialog).getByLabelText("Amount"), "5")
    await user.type(within(dialog).getByLabelText("Description"), "Parking")
    expect(within(dialog).getByRole("button", { name: "Add" })).toBeDisabled()

    await user.click(within(dialog).getByRole("combobox", { name: "Account" }))
    await user.click(await screen.findByRole("option", { name: "Card" }))
    await user.click(within(dialog).getByRole("button", { name: "Add" }))
    await waitFor(() => expect(callsTo("POST /api/transactions")[0]?.body).toMatchObject({ account_id: 2 }))
  })

  it("keeps the dialog open and shows the server error", async () => {
    const { Toaster } = await import("@/components/ui/sonner")
    const user = setup({ "POST /api/transactions": new FakeResponse(404, { detail: "Account not found" }) }, <Toaster />)
    const dialog = await openAddForm(user)
    await user.type(within(dialog).getByLabelText("Amount"), "5")
    await user.type(within(dialog).getByLabelText("Description"), "Parking")
    await user.click(within(dialog).getByRole("button", { name: "Add" }))
    expect(await screen.findByText("Account not found")).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("edits a transaction and sends only the changed fields", async () => {
    const user = setup({
      "GET /api/transactions": {
        items: [makeTransaction({ id: 9, description_raw: "ESSELUNGA", amount_cents: -2550, category_id: 1 })],
        total: 1,
        page: 1,
        page_size: 50,
      },
    })
    const row = (await screen.findByText("ESSELUNGA")).closest("tr") as HTMLElement
    await user.click(within(row).getByRole("button", { name: "Edit transaction" }))
    const dialog = await screen.findByRole("dialog")

    expect(within(dialog).getByLabelText("Amount")).toHaveValue("25.50")
    expect(within(dialog).getByRole("radio", { name: "Expense" })).toHaveAttribute("aria-checked", "true")
    expect(within(dialog).getByText(/Imported from a statement/)).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText("Amount"))
    await user.type(within(dialog).getByLabelText("Amount"), "26")
    await user.click(within(dialog).getByRole("button", { name: "Save" }))

    await waitFor(() => expect(callsTo("PATCH /api/transactions/9")).toHaveLength(1))
    expect(callsTo("PATCH /api/transactions/9")[0].body).toEqual({ amount_cents: -2600 })
  })

  it("closes without a request when nothing changed", async () => {
    const user = setup({
      "GET /api/transactions": { items: [makeTransaction({ id: 9, description_raw: "ESSELUNGA" })], total: 1, page: 1, page_size: 50 },
    })
    const row = (await screen.findByText("ESSELUNGA")).closest("tr") as HTMLElement
    await user.click(within(row).getByRole("button", { name: "Edit transaction" }))
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(callsTo("PATCH /api/transactions/{id}")).toHaveLength(0)
  })
})
