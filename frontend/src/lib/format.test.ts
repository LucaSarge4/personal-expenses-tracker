import { describe, expect, it } from "vitest"

import { deltaPercent, formatDate, formatMoney, formatPercent, monthName } from "./format"

describe("formatMoney", () => {
  it("formats positive cents in Italian style", () => {
    expect(formatMoney(2550, "it")).toBe("25,50 €")
  })

  it("formats negative cents with a minus sign", () => {
    expect(formatMoney(-2550, "it")).toBe("-25,50 €")
  })

  it("formats zero", () => {
    expect(formatMoney(0, "it")).toBe("0,00 €")
  })

  it("formats in English style", () => {
    expect(formatMoney(2550, "en")).toBe("€25.50")
  })

  it("formats in the requested currency", () => {
    expect(formatMoney(2550, "en", "USD")).toBe("$25.50")
    expect(formatMoney(-2550, "it", "GBP")).toBe("-25,50\u00a0£")
    expect(formatMoney(2550, "it", "CHF")).toBe("25,50\u00a0CHF")
  })
})

describe("formatDate", () => {
  it("formats an ISO date in it-IT order (dd/mm/yyyy)", () => {
    expect(formatDate("2026-01-05", "it")).toBe("05/01/2026")
  })

  it("formats an ISO date in en-US order (mm/dd/yyyy)", () => {
    expect(formatDate("2026-01-05", "en")).toBe("01/05/2026")
  })
})

describe("formatPercent", () => {
  it("formats a ratio as a percentage with one decimal", () => {
    expect(formatPercent(0.9016)).toBe("90.2%")
  })
})

describe("monthName", () => {
  it("returns the full month name per locale", () => {
    expect(monthName(1, "it")).toBe("Gennaio")
    expect(monthName(12, "it")).toBe("Dicembre")
    expect(monthName(1, "en")).toBe("January")
    expect(monthName(12, "en")).toBe("December")
  })

  it("returns the short form when requested", () => {
    expect(monthName(1, "it", true)).toBe("Gen")
    expect(monthName(1, "en", true)).toBe("Jan")
  })

  it("defaults to English when no locale is given", () => {
    expect(monthName(1)).toBe("January")
  })
})

describe("deltaPercent", () => {
  it("computes percent change between two values", () => {
    expect(deltaPercent(150, 100)).toBeCloseTo(0.5)
    expect(deltaPercent(50, 100)).toBeCloseTo(-0.5)
  })

  it("returns null when the previous value is zero", () => {
    expect(deltaPercent(100, 0)).toBeNull()
  })
})
