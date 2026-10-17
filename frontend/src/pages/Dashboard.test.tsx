import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { Dashboard } from "@/pages/Dashboard"
import { callsTo, mockApi } from "@/test/fake-api"
import { makeAccount, makeTransaction } from "@/test/factories"
import { renderWithProviders } from "@/test/render"

const HAS_DATA = { "GET /api/transactions": { items: [makeTransaction()], total: 1, page: 1, page_size: 1 } }

function location() {
  return screen.getByTestId("location").textContent ?? ""
}

describe("Dashboard", () => {
  it("points new users to Import when there is no data", async () => {
    renderWithProviders(<Dashboard />)
    expect(await screen.findByText("No data yet")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Go to Import" })).toHaveAttribute("href", "/import")
  })

  it("shows KPIs for the selected year", async () => {
    mockApi({
      ...HAS_DATA,
      "GET /api/stats/summary": {
        income: 500000,
        expenses: 300000, // a positive magnitude, as the API returns it
        net: 200000,
        savings_rate: 0.4,
        prev: { income: 400000, expenses: 300000, net: 100000, savings_rate: 0.25 },
      },
    })
    renderWithProviders(<Dashboard />, { route: "/?year=2025" })
    expect(await screen.findByText("€5,000.00")).toBeInTheDocument()
    expect(screen.getByText("€3,000.00")).toBeInTheDocument()
    expect(screen.getByText("40.0%")).toBeInTheDocument()
    expect(screen.getByText("+15.0pp")).toBeInTheDocument()
    expect(callsTo("GET /api/stats/summary").at(-1)?.query).toEqual({ year: "2025" })
  })

  it("switches to month view and wraps the year when stepping back from January", async () => {
    const user = userEvent.setup()
    mockApi(HAS_DATA)
    renderWithProviders(<Dashboard />, { route: "/?year=2025" })
    await user.click(await screen.findByRole("tab", { name: "Month" }))
    expect(location()).toContain("period=month")

    await user.click(screen.getByRole("button", { name: "Previous" }))
    await user.click(screen.getByRole("button", { name: "Next" }))
    // Whatever month we're on, prev+next must land back on it.
    const params = new URLSearchParams(location().split("?")[1])
    expect(params.get("year")).toBe("2025")
  })

  it("rolls January back to December of the previous year", async () => {
    const user = userEvent.setup()
    mockApi(HAS_DATA)
    renderWithProviders(<Dashboard />, { route: "/?period=month&year=2025&month=1" })
    expect(await screen.findByText("January 2025")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Previous" }))
    expect(await screen.findByText("December 2024")).toBeInTheDocument()
    await waitFor(() =>
      expect(callsTo("GET /api/stats/summary").at(-1)?.query).toEqual({ year: "2024", month: "12" }),
    )
  })

  it("rolls December forward to January of the next year", async () => {
    const user = userEvent.setup()
    mockApi(HAS_DATA)
    renderWithProviders(<Dashboard />, { route: "/?period=month&year=2025&month=12" })
    await user.click(await screen.findByRole("button", { name: "Next" }))
    expect(await screen.findByText("January 2026")).toBeInTheDocument()
  })

  it("filters every stat by the chosen account", async () => {
    const user = userEvent.setup()
    mockApi({ ...HAS_DATA, "GET /api/accounts": [makeAccount({ id: 4, name: "Revolut" })] })
    renderWithProviders(<Dashboard />, { route: "/?year=2025" })
    await user.click(await screen.findByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "Revolut" }))
    await waitFor(() => {
      for (const endpoint of ["summary", "monthly", "by-category", "grid"]) {
        expect(callsTo(`GET /api/stats/${endpoint}`).at(-1)?.query).toMatchObject({ account_id: "4" })
      }
    })
  })
})
