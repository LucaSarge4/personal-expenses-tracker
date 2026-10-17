import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { Settings } from "@/pages/Settings"
import { DEFAULT_SETTINGS, callsTo, mockApi } from "@/test/fake-api"
import { renderWithProviders } from "@/test/render"

describe("Settings page", () => {
  it("opens on General and switches sections from the sidebar", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />)
    expect(await screen.findByText("App-wide preferences.")).toBeInTheDocument()

    const sidebar = screen.getByRole("navigation")
    await user.click(within(sidebar).getByRole("button", { name: "Accounts" }))
    expect(within(sidebar).getByRole("button", { name: "Accounts" })).toHaveAttribute("aria-current", "page")
    expect(await screen.findByPlaceholderText("Account name (e.g. Main checking)")).toBeInTheDocument()
  })

  it("keeps the mobile tabs and sidebar in sync", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />)
    await user.click(await screen.findByRole("tab", { name: "Rules" }))
    expect(within(screen.getByRole("navigation")).getByRole("button", { name: "Rules" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })

  it("saves the language and re-renders in Italian", async () => {
    const user = userEvent.setup()
    let settings = { ...DEFAULT_SETTINGS }
    mockApi({
      "GET /api/settings": () => settings,
      "PUT /api/settings": (call: { body: unknown }) => {
        settings = { ...settings, ...(call.body as object) }
        return settings
      },
    })
    renderWithProviders(<Settings />)
    await user.click(await screen.findByRole("combobox", { name: "Language" }))
    await user.click(await screen.findByRole("option", { name: "Italiano" }))

    await waitFor(() => expect(callsTo("PUT /api/settings")[0]?.body).toEqual({ locale: "it" }))
    expect(await screen.findByRole("heading", { name: "Impostazioni" })).toBeInTheDocument()
  })

  it("saves the display currency", async () => {
    const user = userEvent.setup()
    mockApi({ "PUT /api/settings": DEFAULT_SETTINGS })
    renderWithProviders(<Settings />)
    await user.click(await screen.findByRole("combobox", { name: "Currency" }))
    await user.click(await screen.findByRole("option", { name: "USD" }))
    await waitFor(() => expect(callsTo("PUT /api/settings")[0]?.body).toEqual({ currency: "USD" }))
  })

  it("creates an account with the display currency", async () => {
    const user = userEvent.setup()
    mockApi({
      "GET /api/settings": { ...DEFAULT_SETTINGS, currency: "CHF" },
      "POST /api/accounts": (call: { body: unknown }) => ({ id: 1, ...(call.body as object) }),
    })
    renderWithProviders(<Settings />)
    await user.click(within(await screen.findByRole("navigation")).getByRole("button", { name: "Accounts" }))

    const add = await screen.findByRole("button", { name: "Add" })
    expect(add).toBeDisabled()
    await user.type(screen.getByPlaceholderText("Account name (e.g. Main checking)"), "  Main  ")
    await user.type(screen.getByPlaceholderText("Bank"), "Fineco")
    await user.click(add)

    await waitFor(() =>
      expect(callsTo("POST /api/accounts")[0]?.body).toEqual({
        name: "Main",
        bank: "Fineco",
        currency: "CHF",
        notes: "",
      }),
    )
  })

  it("applies an accent color right away and remembers it", async () => {
    const user = userEvent.setup()
    const { unmount } = renderWithProviders(<Settings />)
    const accents = await screen.findByRole("radiogroup", { name: "Accent color" })
    expect(within(accents).getByRole("radio", { name: "Indigo" })).toHaveAttribute("aria-checked", "true")

    await user.click(within(accents).getByRole("radio", { name: "Teal" }))
    expect(document.documentElement.dataset.accent).toBe("teal")
    expect(within(accents).getByRole("radio", { name: "Teal" })).toHaveAttribute("aria-checked", "true")

    unmount()
    renderWithProviders(<Settings />)
    const again = await screen.findByRole("radiogroup", { name: "Accent color" })
    expect(within(again).getByRole("radio", { name: "Teal" })).toHaveAttribute("aria-checked", "true")
  })

  it("switches between light and dark", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />)
    const theme = await screen.findByRole("radiogroup", { name: "Theme" })
    await user.click(within(theme).getByRole("radio", { name: "Dark" }))
    expect(document.documentElement).toHaveClass("dark")
    await user.click(within(theme).getByRole("radio", { name: "Light" }))
    expect(document.documentElement).not.toHaveClass("dark")
  })
})
