import { describe, expect, it } from "vitest"

import { ApiError, unwrap } from "@/api/client"

const response = (status: number) => new Response(null, { status })

describe("unwrap", () => {
  it("returns the data of a successful response", () => {
    expect(unwrap({ data: { id: 1 }, response: response(200) })).toEqual({ id: 1 })
  })

  it("throws an ApiError carrying FastAPI's detail and the status", () => {
    const run = () => unwrap({ error: { detail: "Account not found" }, response: response(404) })
    expect(run).toThrow(ApiError)
    try {
      run()
    } catch (e) {
      expect((e as ApiError).message).toBe('"Account not found"')
      expect((e as ApiError).status).toBe(404)
    }
  })

  it("serializes validation error lists", () => {
    const detail = [{ loc: ["body", "name"], msg: "Field required" }]
    expect(() => unwrap({ error: { detail }, response: response(422) })).toThrow(JSON.stringify(detail))
  })

  it("treats a missing body as an error", () => {
    expect(() => unwrap({ response: response(204) })).toThrow("Empty response")
  })
})
