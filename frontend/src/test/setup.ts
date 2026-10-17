// Global test setup: DOM matchers, the browser APIs jsdom lacks (Radix and
// Recharts need them), and an API client wired to the in-memory fake server.
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach, vi } from "vitest"

import { resetFakeApi } from "@/test/fake-api"

vi.mock("@/api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/client")>()
  const { default: createClient } = await import("openapi-fetch")
  return {
    ...original,
    // jsdom has no origin for relative URLs, and the fetch must be resolved
    // per call so each test's stub is used.
    api: createClient({ baseUrl: "http://localhost", fetch: (req: Request) => globalThis.fetch(req) }),
  }
})

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

Element.prototype.scrollIntoView ??= function () {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}

beforeEach(() => {
  resetFakeApi()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.className = ""
})
