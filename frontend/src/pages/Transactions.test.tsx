import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { Transactions } from "@/pages/Transactions"
import { callsTo, mockApi } from "@/test/fake-api"
import { makeCategory, makeTransaction } from "@/test/factories"
import { renderWithProviders } from "@/test/render"

const CATEGORIES = [
  makeCategory({ id: 1, name: "Groceries" }),
  makeCategory({ id: 2, name: "Dining Out" }),
  makeCategory({ id: 3, name: "Other" }),
]

function page(items = [makeTransaction()], total = items.length) {
  return { items, total, page: 1, page_size: 50 }
}

function location() {
  return screen.getByTestId("location").textContent ?? ""
}

function lastListQuery() {
  return callsTo("GET /api/transactions").at(-1)?.query
}

async function findRow(description: string) {
  return (await screen.findByText(description)).closest("tr") as HTMLElement
}

function rowFor(description: string) {
  return screen.getByText(description).closest("tr") as HTMLElement
}

describe("Transactions page", () => {
  it("turns URL filters into the API query", async () => {
    renderWithProviders(<Transactions />, {
      route: "/transactions?year=2025&month=3&category_id=2&needs_review=true&q=coop&page=2",
    })
    await waitFor(() =>
      expect(lastListQuery()).toEqual({
        year: "2025",
        month: "3",
        category_id: "2",
        needs_review: "true",
        q: "coop",
        page: "2",
        page_size: "50",
      }),
    )
  })

  it("debounces search into the URL and resets to the first page", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Transactions />, { route: "/transactions?page=3" })
    await user.type(screen.getByPlaceholderText("Search description…"), "esse")
    await waitFor(() => expect(location()).toBe("/transactions?q=esse"))
    await waitFor(() => expect(lastListQuery()).toMatchObject({ q: "esse", page: "1" }))
  })

  it("shows income in green and expenses neutral", async () => {
    mockApi({
      "GET /api/transactions": page([
        makeTransaction({ id: 1, description_raw: "SALARY", amount_cents: 300000 }),
        makeTransaction({ id: 2, description_raw: "COOP", amount_cents: -1999 }),
      ]),
    })
    renderWithProviders(<Transactions />)
    expect(within(await findRow("SALARY")).getByText("€3,000.00")).toHaveClass("text-income")
    expect(within(rowFor("COOP")).getByText("-€19.99")).not.toHaveClass("text-income")
  })

  it("bulk-assigns a category to the selected transactions", async () => {
    const user = userEvent.setup()
    mockApi({
      "GET /api/categories": CATEGORIES,
      "GET /api/transactions": page([
        makeTransaction({ id: 11, description_raw: "A" }),
        makeTransaction({ id: 12, description_raw: "B" }),
        makeTransaction({ id: 13, description_raw: "C" }),
      ]),
      "POST /api/transactions/bulk": { updated: 2 },
    })
    renderWithProviders(<Transactions />)

    await user.click(within(await findRow("A")).getByRole("checkbox"))
    await user.click(within(rowFor("C")).getByRole("checkbox"))
    expect(screen.getByText("2 selected")).toBeInTheDocument()

    const bar = screen.getByText("2 selected").parentElement as HTMLElement
    await user.click(within(bar).getByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "Dining Out" }))
    await user.click(within(bar).getByRole("button", { name: "Apply" }))

    await waitFor(() => expect(callsTo("POST /api/transactions/bulk")).toHaveLength(1))
    expect(callsTo("POST /api/transactions/bulk")[0].body).toEqual({
      ids: [11, 13],
      category_id: 2,
      reviewed: true,
    })
    await waitFor(() => expect(screen.queryByText("2 selected")).not.toBeInTheDocument())
  })

  it("selects every row on the page from the header checkbox", async () => {
    const user = userEvent.setup()
    mockApi({
      "GET /api/transactions": page([makeTransaction({ id: 1, description_raw: "A" }), makeTransaction({ id: 2, description_raw: "B" })]),
    })
    renderWithProviders(<Transactions />)
    await findRow("A")
    const [all] = screen.getAllByRole("checkbox", { name: "" }).filter((c) => c.closest("thead"))
    await user.click(all)
    expect(screen.getByText("2 selected")).toBeInTheDocument()
  })

  it("recategorizes one transaction and offers to move similar ones", async () => {
    const user = userEvent.setup()
    mockApi({
      "GET /api/categories": CATEGORIES,
      "GET /api/transactions": page([
        makeTransaction({ id: 1, description_raw: "POS ESSELUNGA 123", category_id: 3 }),
        makeTransaction({ id: 2, description_raw: "POS ESSELUNGA 456", category_id: 3 }),
        makeTransaction({ id: 3, description_raw: "POS ESSELUNGA 789", category_id: 2 }),
      ]),
      "PATCH /api/transactions/{id}": (call: { body: unknown }) => call.body,
    })
    renderWithProviders(<Transactions />)

    await user.click(within(await findRow("POS ESSELUNGA 123")).getByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "Groceries" }))

    await waitFor(() => expect(callsTo("PATCH /api/transactions/1")).toHaveLength(1))
    expect(callsTo("PATCH /api/transactions/1")[0].body).toEqual({ category_id: 1 })
    // Only the sibling still in the old category ("Other") is offered.
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("POS ESSELUNGA 456")
    expect(dialog).not.toHaveTextContent("POS ESSELUNGA 789")
  })

  it("pages through results", async () => {
    const user = userEvent.setup()
    mockApi({ "GET /api/transactions": page([makeTransaction({ description_raw: "A" })], 120) })
    renderWithProviders(<Transactions />, { route: "/transactions" })
    expect(await screen.findByText(/page 1 of 3/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(location()).toBe("/transactions?page=2")
  })

  it("deletes a transaction after confirming", async () => {
    const user = userEvent.setup()
    mockApi({
      "GET /api/transactions": page([makeTransaction({ id: 42, description_raw: "DOUBLE CHARGE" })]),
      "DELETE /api/transactions/{id}": { ok: true },
    })
    renderWithProviders(<Transactions />)
    const row = await findRow("DOUBLE CHARGE")
    const buttons = within(row).getAllByRole("button")
    await user.click(buttons[buttons.length - 1])
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("DOUBLE CHARGE")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(callsTo("DELETE /api/transactions/42")).toHaveLength(1))
  })

  it("shows an empty state when nothing matches", async () => {
    renderWithProviders(<Transactions />)
    expect(await screen.findByText(/No transactions match/i)).toBeInTheDocument()
  })
})
