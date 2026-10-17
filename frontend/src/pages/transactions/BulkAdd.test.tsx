import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { BulkAdd } from "@/pages/transactions/BulkAdd"
import { todayIso } from "@/pages/transactions/shared"
import { callsTo, mockApi } from "@/test/fake-api"
import { makeAccount, makeCategory } from "@/test/factories"
import { renderWithProviders } from "@/test/render"

function setup(accounts = [makeAccount({ id: 3, name: "Checking" })]) {
  mockApi({
    "GET /api/accounts": accounts,
    "GET /api/categories": [
      makeCategory({ id: 1, name: "Groceries", kind: "expense" }),
      makeCategory({ id: 2, name: "Salary", kind: "income" }),
    ],
    "POST /api/transactions/batch": (call: { body: unknown }) => (call.body as { items: unknown[] }).items,
  })
  renderWithProviders(<BulkAdd />, { route: "/transactions/new" })
  return userEvent.setup()
}

function row(n: number) {
  return screen.getByRole("listitem", { name: `Row ${n}` })
}

async function fill(user: ReturnType<typeof userEvent.setup>, n: number, description: string, amount: string) {
  await user.type(within(row(n)).getByLabelText(`Row ${n}: Description`), description)
  await user.type(within(row(n)).getByLabelText(`Row ${n}: Amount`), amount)
}

describe("Bulk add", () => {
  it("saves the filled rows in one request and skips blank ones", async () => {
    const user = setup()
    expect(await screen.findAllByRole("listitem")).toHaveLength(5)

    await fill(user, 1, "Rent", "900")
    await fill(user, 3, "Salary", "2.500,00")
    await user.click(within(row(3)).getByRole("radio", { name: "Income" }))
    await user.click(within(row(3)).getByRole("combobox", { name: "Row 3: Category" }))
    await user.click(await screen.findByRole("option", { name: "Salary" }))

    expect(screen.getByText("2 transactions ready")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Save 2 transactions" }))

    await waitFor(() => expect(callsTo("POST /api/transactions/batch")).toHaveLength(1))
    expect(callsTo("POST /api/transactions/batch")[0].body).toEqual({
      items: [
        { account_id: 3, date: todayIso(), description_raw: "Rent", amount_cents: -90000, category_id: null, notes: "" },
        { account_id: 3, date: todayIso(), description_raw: "Salary", amount_cents: 250000, category_id: 2, notes: "" },
      ],
    })
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/transactions$/))
  })

  it("blocks saving while a row is half filled", async () => {
    const user = setup()
    await screen.findAllByRole("listitem")
    await fill(user, 1, "Rent", "900")
    await user.type(within(row(2)).getByLabelText("Row 2: Description"), "Forgot the amount")

    expect(screen.getByText("Fix 1 incomplete row to save")).toBeInTheDocument()
    expect(within(row(2)).getByLabelText("Row 2: Amount")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("button", { name: "Save 1 transaction" })).toBeDisabled()

    await user.click(screen.getByRole("button", { name: "Remove row 2" }))
    expect(screen.getByRole("button", { name: "Save 1 transaction" })).toBeEnabled()
  })

  it("adds a row with Enter on the last row and focuses its date", async () => {
    const user = setup()
    await screen.findAllByRole("listitem")
    const lastDate = within(row(5)).getByLabelText("Row 5: Date")
    await user.clear(lastDate)
    await user.type(lastDate, "2026-02-03")
    await user.type(within(row(5)).getByLabelText("Row 5: Description"), "Taxi{Enter}")

    expect(screen.getAllByRole("listitem")).toHaveLength(6)
    const newDate = within(row(6)).getByLabelText("Row 6: Date")
    expect(newDate).toHaveFocus()
    // New rows start on the previous row's date, for runs of same-day entries.
    expect(newDate).toHaveValue("2026-02-03")
  })

  it("moves to the next row with Enter in the middle", async () => {
    const user = setup()
    await screen.findAllByRole("listitem")
    await user.type(within(row(1)).getByLabelText("Row 1: Amount"), "4{Enter}")
    expect(within(row(2)).getByLabelText("Row 2: Date")).toHaveFocus()
    expect(screen.getAllByRole("listitem")).toHaveLength(5)
  })

  it("needs an account when there are several", async () => {
    const user = setup([makeAccount({ id: 1, name: "Checking" }), makeAccount({ id: 2, name: "Card" })])
    await screen.findAllByRole("listitem")
    await fill(user, 1, "Rent", "900")
    expect(screen.getByRole("button", { name: "Save 1 transaction" })).toBeDisabled()

    await user.click(screen.getByRole("combobox", { name: "Account" }))
    await user.click(await screen.findByRole("option", { name: "Card" }))
    await user.click(screen.getByRole("button", { name: "Save 1 transaction" }))
    await waitFor(() =>
      expect(callsTo("POST /api/transactions/batch")[0]?.body).toMatchObject({ items: [{ account_id: 2 }] }),
    )
  })
})
