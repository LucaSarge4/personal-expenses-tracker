import { describe, expect, it } from "vitest"

import { guessMerchantSnippet } from "./merchant"

describe("guessMerchantSnippet", () => {
  it("picks the merchant name over boilerplate and reference numbers", () => {
    const description =
      "Pagamento tramite POS 4 1619 PAGAMENTO POS 50,50 EUR DEL 10.01.2026 A(ITA) " +
      "ARCAPLANET CARTA 62361063 CAU 98105 NDS 015018923"
    expect(guessMerchantSnippet(description)).toBe("ARCAPLANET")
  })

  it("picks the merchant name over the SDD boilerplate prefix", () => {
    const description = "Addebito SDD 10 1610 OCTOPUS ENERGY ITALI-OCTOPUS ENERGY- A-"
    expect(guessMerchantSnippet(description)).toBe("OCTOPUS")
  })

  it("falls back to the full description when nothing survives filtering", () => {
    expect(guessMerchantSnippet("Pagamento tramite POS")).toBe("Pagamento tramite POS")
  })
})
