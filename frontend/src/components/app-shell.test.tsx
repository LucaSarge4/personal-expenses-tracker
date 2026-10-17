import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { AppShell } from "@/components/app-shell"
import { renderWithProviders } from "@/test/render"

describe("AppShell", () => {
  it("renders every section in both the sidebar and the mobile tab bar", () => {
    renderWithProviders(<AppShell />, { route: "/import" })
    const navs = screen.getAllByRole("navigation")
    expect(navs).toHaveLength(2)
    for (const nav of navs) {
      const links = within(nav).getAllByRole("link")
      expect(links.map((l) => l.getAttribute("href"))).toEqual([
        "/",
        "/import",
        "/transactions",
        "/advice",
        "/settings",
      ])
      expect(within(nav).getByRole("link", { name: "Import" })).toHaveAttribute("aria-current", "page")
    }
  })

  it("toggles the theme and remembers it", async () => {
    const user = userEvent.setup()
    renderWithProviders(<AppShell />)
    expect(document.documentElement).not.toHaveClass("dark")
    const [toggle] = screen.getAllByRole("button", { name: "Toggle theme" })
    await user.click(toggle)
    expect(document.documentElement).toHaveClass("dark")
    expect(localStorage.getItem("expenses-tracker-theme")).toBe("dark")
  })
})
