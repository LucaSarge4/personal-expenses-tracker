import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { Import } from "@/pages/Import"
import { FakeResponse, callsTo, mockApi } from "@/test/fake-api"
import { makeAccount, makeImport, makeTransaction } from "@/test/factories"
import { renderWithProviders } from "@/test/render"

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

async function chooseAccount(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("combobox"))
  await user.click(await screen.findByRole("option", { name }))
}

describe("Import page", () => {
  it("asks for an account before allowing uploads", async () => {
    renderWithProviders(<Import />)
    expect(await screen.findByText("Create an account in Settings first.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Choose files" })).toBeDisabled()
    expect(screen.getByText("Choose an account above to start.")).toBeInTheDocument()
  })

  it("uploads files to the chosen account and opens the new import for review", async () => {
    const user = userEvent.setup()
    const created = makeImport({ id: 7, filename: "jan.csv", account_id: 2 })
    let imports: unknown[] = []
    mockApi({
      "GET /api/accounts": [makeAccount({ id: 1, name: "Checking" }), makeAccount({ id: 2, name: "Savings" })],
      "GET /api/imports": () => imports,
      "POST /api/imports": () => {
        imports = [created]
        return [created]
      },
      "GET /api/transactions": { items: [makeTransaction({ import_id: 7 })], total: 1, page: 1, page_size: 500 },
    })
    renderWithProviders(<Import />)

    await chooseAccount(user, "Savings")
    expect(screen.getByRole("button", { name: "Choose files" })).toBeEnabled()
    expect(screen.getByText("Add statements")).toHaveAttribute("aria-current", "step")

    await user.upload(fileInput(), new File(["date,amount"], "jan.csv", { type: "text/csv" }))

    await waitFor(() => expect(callsTo("POST /api/imports")).toHaveLength(1))
    const [upload] = callsTo("POST /api/imports")
    expect(upload.query).toEqual({ account_id: "2" })
    expect((upload.body as FormData).getAll("files")).toHaveLength(1)

    // Once in the imports list, once as the review panel's title.
    await waitFor(() => expect(screen.getAllByText("jan.csv")).toHaveLength(2))
    expect(await screen.findByText("ESSELUNGA MILANO")).toBeInTheDocument()
    expect(callsTo("GET /api/transactions").at(-1)?.query).toMatchObject({ import_id: "7" })
    expect(screen.getByText("Review", { selector: "[aria-current]" })).toBeInTheDocument()
  })

  it("does not upload when the account is missing, even on drop", async () => {
    renderWithProviders(<Import />)
    await screen.findByText("Create an account in Settings first.")
    const { fireEvent } = await import("@testing-library/react")
    const dropzone = screen.getByText("Drop statements here").closest("div[class*='border-dashed']") as HTMLElement
    fireEvent.drop(dropzone, { dataTransfer: { files: [new File(["x"], "a.csv")] } })
    expect(callsTo("POST /api/imports")).toHaveLength(0)
  })

  it("lists imports with their status and counts", async () => {
    mockApi({
      "GET /api/imports": [
        makeImport({ id: 1, filename: "ok.pdf", status: "done", low_confidence_count: 0 }),
        makeImport({ id: 2, filename: "warn.csv", status: "review", low_confidence_count: 4, duplicate_count: 2 }),
        makeImport({ id: 3, filename: "bad.xlsx", status: "error", error: "Could not parse file" }),
      ],
    })
    renderWithProviders(<Import />)
    const warn = (await screen.findByText("warn.csv")).closest("[role=button]") as HTMLElement
    expect(within(warn).getByText("4 low confidence")).toBeInTheDocument()
    expect(within(warn).getByText("2 duplicates")).toBeInTheDocument()
    expect(within(warn).getByText("Review")).toBeInTheDocument()
    const bad = screen.getByText("bad.xlsx").closest("[role=button]") as HTMLElement
    expect(within(bad).getByText("Could not parse file")).toBeInTheDocument()
    expect(within(bad).getByText("Error")).toBeInTheDocument()
  })

  it("selects an import with the keyboard", async () => {
    const user = userEvent.setup()
    mockApi({ "GET /api/imports": [makeImport({ id: 3, filename: "march.csv" })] })
    renderWithProviders(<Import />)
    const row = (await screen.findByText("march.csv")).closest("[role=button]") as HTMLElement
    row.focus()
    await user.keyboard("{Enter}")
    expect(row).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => expect(callsTo("GET /api/transactions").at(-1)?.query).toMatchObject({ import_id: "3" }))
  })

  it("deletes an import only after confirming", async () => {
    const user = userEvent.setup()
    mockApi({
      "GET /api/imports": [makeImport({ id: 5, filename: "old.csv", inserted_count: 12 })],
      "DELETE /api/imports/{id}": { ok: true },
    })
    renderWithProviders(<Import />)
    const row = (await screen.findByText("old.csv")).closest("[role=button]") as HTMLElement

    await user.click(within(row).getByRole("button", { name: "Delete" }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("old.csv")
    expect(dialog).toHaveTextContent("12 transactions")
    // Opening the dialog must not also select the row behind it.
    expect(row).toHaveAttribute("aria-pressed", "false")

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(callsTo("DELETE /api/imports/{id}")).toHaveLength(0)

    await user.click(within(row).getByRole("button", { name: "Delete" }))
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(callsTo("DELETE /api/imports/5")).toHaveLength(1))
  })

  it("confirms an import under review", async () => {
    const user = userEvent.setup()
    mockApi({
      "GET /api/imports": [makeImport({ id: 9, filename: "feb.csv", status: "review" })],
      "POST /api/imports/{id}/confirm": { ok: true },
      "POST /api/imports/{id}/reclassify": { ok: true },
    })
    renderWithProviders(<Import />)
    await user.click(await screen.findByText("feb.csv"))

    await user.click(await screen.findByRole("button", { name: "Reclassify" }))
    await waitFor(() => expect(callsTo("POST /api/imports/9/reclassify")).toHaveLength(1))

    await user.click(screen.getByRole("button", { name: "Confirm all" }))
    await waitFor(() => expect(callsTo("POST /api/imports/9/confirm")).toHaveLength(1))
  })

  it("shows an already confirmed import as confirmed", async () => {
    const user = userEvent.setup()
    mockApi({ "GET /api/imports": [makeImport({ id: 4, filename: "done.csv", status: "done" })] })
    renderWithProviders(<Import />)
    await user.click(await screen.findByText("done.csv"))
    expect(await screen.findByRole("button", { name: "Confirmed" })).toBeDisabled()
  })

  it("hides review actions while an import is still processing", async () => {
    const user = userEvent.setup()
    mockApi({ "GET /api/imports": [makeImport({ id: 6, filename: "busy.pdf", status: "extracting", progress: 40 })] })
    renderWithProviders(<Import />)
    await user.click(await screen.findByText("busy.pdf"))
    expect(await screen.findByText("Still processing (Extracting)…")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Confirm all" })).not.toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("surfaces upload errors from the server", async () => {
    const user = userEvent.setup()
    mockApi({
      "GET /api/accounts": [makeAccount({ id: 1, name: "Checking" })],
      "POST /api/imports": new FakeResponse(400, { detail: "Unsupported file type" }),
    })
    const { Toaster } = await import("@/components/ui/sonner")
    renderWithProviders(
      <>
        <Import />
        <Toaster />
      </>,
    )
    await chooseAccount(user, "Checking")
    await user.upload(fileInput(), new File(["x"], "a.csv", { type: "text/csv" }))
    expect(await screen.findByText("Unsupported file type")).toBeInTheDocument()
  })
})
