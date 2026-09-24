import { describe, expect, it } from "vitest"

import { en } from "./en"
import { it as itDict } from "./it"

describe("i18n dictionaries", () => {
  it("it.ts only ever adds keys that also exist in en.ts (the fallback)", () => {
    const missingFromEn = Object.keys(itDict).filter((key) => !(key in en))
    expect(missingFromEn).toEqual([])
  })

  it("every key in both dictionaries has a non-empty value", () => {
    for (const [key, value] of [...Object.entries(en), ...Object.entries(itDict)]) {
      expect(value.length, `key "${key}" has an empty value`).toBeGreaterThan(0)
    }
  })
})
