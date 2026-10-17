import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Kpi } from "@/pages/dashboard/Kpi"
import { renderWithProviders } from "@/test/render"

function delta() {
  return screen.getByText(/%|pp/, { selector: "span.rounded-full" })
}

describe("Kpi", () => {
  it("marks a rise as good when up is good", async () => {
    renderWithProviders(<Kpi label="Income" cents={12000} prevCents={10000} />)
    expect(await screen.findByText("€120.00")).toBeInTheDocument()
    expect(delta()).toHaveTextContent("20.0%")
    expect(delta()).toHaveClass("text-income")
  })

  it("marks rising expenses as bad", () => {
    // The summary endpoint reports expenses as a positive magnitude (abs()).
    renderWithProviders(<Kpi label="Expenses" cents={15000} prevCents={10000} goodDirection="down" />)
    expect(delta()).toHaveTextContent("50.0%")
    expect(delta()).toHaveClass("text-destructive")
  })

  it("marks falling expenses as good", () => {
    renderWithProviders(<Kpi label="Expenses" cents={8000} prevCents={10000} goodDirection="down" />)
    expect(delta()).toHaveClass("text-income")
  })

  it("marks a fall as bad when up is good", () => {
    renderWithProviders(<Kpi label="Net" cents={5000} prevCents={10000} />)
    expect(delta()).toHaveClass("text-destructive")
  })

  it("shows no delta when there is no previous value", () => {
    renderWithProviders(<Kpi label="Net" cents={5000} prevCents={0} />)
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it("shows percentage-point deltas for rates", () => {
    renderWithProviders(<Kpi label="Savings" cents={0.3} prevCents={0.35} isPercent />)
    expect(screen.getByText("30.0%")).toBeInTheDocument()
    expect(delta()).toHaveTextContent("-5.0pp")
    expect(delta()).toHaveClass("text-destructive")
  })
})
