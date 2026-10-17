import createClient from "openapi-fetch"

import type { paths } from "./schema"

export const api = createClient<paths>({ baseUrl: "" })

export class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/** Unwraps an openapi-fetch result, throwing an ApiError on failure. */
export function unwrap<T>({
  data,
  error,
  response,
}: {
  data?: T
  error?: unknown
  response: Response
}): T {
  if (error !== undefined) {
    const detail =
      typeof error === "object" && error !== null && "detail" in error
        ? (error as { detail: unknown }).detail
        : error
    // FastAPI's own messages are plain strings; validation errors are lists.
    const message = typeof detail === "string" ? detail : JSON.stringify(detail)
    throw new ApiError(message, response.status)
  }
  if (data === undefined) {
    throw new ApiError("Empty response", response.status)
  }
  return data
}
