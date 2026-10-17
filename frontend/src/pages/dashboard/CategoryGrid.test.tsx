import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { GridResponse } from "@/api/types"
import { CategoryGrid } from "@/pages/dashboard/CategoryGrid"
import { makeGridRow, months } from "@/test/factories"
import { renderWithProviders } from "@/test/render"

function grid(overrides: Partial<GridResponse> = {}): GridResponse {
  return {
    income_rows: [
      makeGridRow({ category_id: 10, name: "Salary", months: months({ 1: 300000 }), total: 300000 }),
    ],
    expense_rows: [
      makeGridRow({ category_id: 20, name: "Rent", group: "Housing", months: months({ 1: -95000, 2: -95000 }), total: -190000 }),
      makeGridRow({ category_id: 21, name: "Groceries", months: months({ 1: -3306, 2: 1200 }), total: -2106 }),
    ],
    group_subtotals: [{ group: "Housing", months: months({ 1: -95000, 2: -95000 }), total: -190000 }],
    month_totals: months({ 1: 201694, 2: -93800 }),
    year_total: 107894,
    ...overrides,
  }
}

function row(name: string) {
  return screen.getByText(name).closest("tr") as HTMLElement
}

describe("CategoryGrid", () => {
  it("shows expenses without a minus sign and without currency or cents", async () => {
    renderWithProviders(<CategoryGrid grid={grid()} year={2026} />)
    const rent = row("Rent")
    expect(within(rent).getAllByText("950")).toHaveLength(2)
    expect(within(rent).getByText("1,900")).toBeInTheDocument()
    expect(rent.textContent).not.toMatch(/€|-|\.00/)
  })

  it("flags a refund inside expenses as negative", () => {
    renderWithProviders(<CategoryGrid grid={grid()} year={2026} />)
    const refund = within(row("Groceries")).getByText("-12")
    expect(refund.closest("td")).toHaveClass("text-destructive")
  })

  it("keeps income positive and colors the net row by sign", () => {
    renderWithProviders(<CategoryGrid grid={grid()} year={2026} />)
    expect(within(row("Salary")).getAllByText("3,000")).toHaveLength(2)
    const net = row("Net")
    expect(within(net).getByText("+2,017")).toHaveClass("text-income")
    expect(within(net).getByText("-938")).toHaveClass("text-destructive")
    expect(within(net).getByText("+1,079")).toHaveClass("text-income")
  })

  it("renders group subtotals after the last row of the group", () => {
    renderWithProviders(<CategoryGrid grid={grid()} year={2026} />)
    const rows = screen.getAllByRole("row").map((r) => r.textContent ?? "")
    const rentIdx = rows.findIndex((t) => t.startsWith("Rent"))
    expect(rows[rentIdx + 1]).toMatch(/^Total Housing/)
  })

  it("links non-zero cells to the matching transactions", () => {
    renderWithProviders(<CategoryGrid grid={grid()} year={2026} />)
    const [jan] = within(row("Rent")).getAllByRole("link")
    expect(jan).toHaveAttribute("href", "/transactions?year=2026&month=1&category_id=20")
  })

  it("dims months with no data at all", () => {
    renderWithProviders(<CategoryGrid grid={grid()} year={2026} />)
    expect(screen.getByRole("columnheader", { name: "Dec" })).toHaveClass("text-muted-foreground/50")
    expect(screen.getByRole("columnheader", { name: "Jan" })).not.toHaveClass("text-muted-foreground/50")
  })

  it("formats with the Italian locale when configured", async () => {
    const { mockApi, DEFAULT_SETTINGS } = await import("@/test/fake-api")
    mockApi({ "GET /api/settings": { ...DEFAULT_SETTINGS, locale: "it" } })
    renderWithProviders(<CategoryGrid grid={grid()} year={2026} />)
    expect(await screen.findByText("Netto")).toBeInTheDocument()
    // it-IT only groups numbers of 5+ digits: 1900, but 12.346.
    expect(within(row("Rent")).getByText("1900")).toBeInTheDocument()
  })
})
