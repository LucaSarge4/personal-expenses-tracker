import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, unwrap } from "./client"
import type {
  AppSettings,
  ByCategoryRow,
  GridResponse,
  LlmTestResult,
  MonthlyRow,
  StatsSummary,
  TransactionListResponse,
} from "./types"
import type { components } from "./schema"

type CategoryRead = components["schemas"]["CategoryRead"]
type CategoryCreate = components["schemas"]["CategoryCreate"]
type CategoryUpdate = components["schemas"]["CategoryUpdate"]
type AccountRead = components["schemas"]["AccountRead"]
type AccountCreate = components["schemas"]["AccountCreate"]
type AccountUpdate = components["schemas"]["AccountUpdate"]
type RuleRead = components["schemas"]["RuleRead"]
type RuleCreate = components["schemas"]["RuleCreate"]
type ImportRead = components["schemas"]["ImportRead"]
type TransactionUpdate = components["schemas"]["TransactionUpdate"]
type TransactionBulkUpdate = components["schemas"]["TransactionBulkUpdate"]
type AdminResetRequest = components["schemas"]["AdminResetRequest"]
type AdminResetResult = components["schemas"]["AdminResetResult"]
type AdviceRequest = components["schemas"]["AdviceRequest"]

// ---- Categories ----------------------------------------------------------

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: ["categories", { includeArchived }],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/categories", {
          params: { query: { include_archived: includeArchived } },
        }),
      ),
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CategoryCreate) =>
      unwrap(await api.POST("/api/categories", { body: payload })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: CategoryUpdate }) =>
      unwrap(
        await api.PATCH("/api/categories/{category_id}", {
          params: { path: { category_id: id } },
          body: payload,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  })
}

export function useReorderCategories() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: number[]) =>
      unwrap(await api.PUT("/api/categories/order", { body: { ids } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  })
}

export function useArchiveCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(
        await api.POST("/api/categories/{category_id}/archive", {
          params: { path: { category_id: id } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  })
}

export function useMergeCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, targetId }: { id: number; targetId: number }) =>
      unwrap(
        await api.POST("/api/categories/{category_id}/merge", {
          params: { path: { category_id: id } },
          body: { target_id: targetId },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
      queryClient.invalidateQueries({ queryKey: ["rules"] })
    },
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(
        await api.DELETE("/api/categories/{category_id}", {
          params: { path: { category_id: id } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  })
}

// ---- Accounts --------------------------------------------------------------

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => unwrap(await api.GET("/api/accounts", {})),
  })
}

export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: AccountCreate) =>
      unwrap(await api.POST("/api/accounts", { body: payload })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  })
}

export function useUpdateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: AccountUpdate }) =>
      unwrap(
        await api.PATCH("/api/accounts/{account_id}", {
          params: { path: { account_id: id } },
          body: payload,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(
        await api.DELETE("/api/accounts/{account_id}", { params: { path: { account_id: id } } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  })
}

// ---- Rules -------------------------------------------------------------

export function useRules() {
  return useQuery({
    queryKey: ["rules"],
    queryFn: async () => unwrap(await api.GET("/api/rules", {})),
  })
}

export function useCreateRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: RuleCreate) =>
      unwrap(await api.POST("/api/rules", { body: payload })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules"] }),
  })
}

export function useDeleteRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(await api.DELETE("/api/rules/{rule_id}", { params: { path: { rule_id: id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules"] }),
  })
}

// ---- Settings & LLM -------------------------------------------------------

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => unwrap(await api.GET("/api/settings", {})) as unknown as AppSettings,
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Record<string, string>) =>
      unwrap(await api.PUT("/api/settings", { body: payload })) as unknown as AppSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  })
}

export function useLlmModels() {
  return useQuery({
    queryKey: ["llm-models"],
    queryFn: async () => unwrap(await api.GET("/api/llm/models", {})),
    retry: false,
  })
}

export function useTestLlmConnection() {
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/api/llm/test", {})) as unknown as LlmTestResult,
  })
}

export function useAdvice() {
  return useMutation({
    mutationFn: async (payload: AdviceRequest) =>
      unwrap(await api.POST("/api/llm/advice", { body: payload })),
  })
}

// ---- Imports -------------------------------------------------------------

export function useImports() {
  return useQuery({
    queryKey: ["imports"],
    queryFn: async () => unwrap(await api.GET("/api/imports", {})),
    refetchInterval: (query) => {
      const imports = query.state.data as ImportRead[] | undefined
      const active = imports?.some((i) =>
        ["queued", "extracting", "classifying"].includes(i.status),
      )
      return active ? 2000 : false
    },
  })
}

export function useImport(importId: number | null) {
  return useQuery({
    queryKey: ["imports", importId],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/imports/{import_id}", {
          params: { path: { import_id: importId as number } },
        }),
      ),
    enabled: importId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && ["queued", "extracting", "classifying"].includes(status) ? 2000 : false
    },
  })
}

export function useCreateImports() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ accountId, files }: { accountId: number; files: File[] }) => {
      const body = new FormData()
      for (const file of files) body.append("files", file)
      const response = await fetch(`/api/imports?account_id=${accountId}`, {
        method: "POST",
        body,
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(
          typeof detail.detail === "string" ? detail.detail : `Upload failed (${response.status})`,
        )
      }
      return (await response.json()) as ImportRead[]
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["imports"] }),
  })
}

export function useConfirmImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(
        await api.POST("/api/imports/{import_id}/confirm", {
          params: { path: { import_id: id } },
        }),
      ),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["imports"] })
      queryClient.invalidateQueries({ queryKey: ["imports", id] })
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
    },
  })
}

export function useReclassifyImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(
        await api.POST("/api/imports/{import_id}/reclassify", {
          params: { path: { import_id: id } },
        }),
      ),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["imports", id] })
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
    },
  })
}

export function useDeleteImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(
        await api.DELETE("/api/imports/{import_id}", { params: { path: { import_id: id } } }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imports"] })
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
    },
  })
}

// ---- Transactions ----------------------------------------------------------

export interface TransactionFilters {
  year?: number
  month?: number
  account_id?: number
  category_id?: number
  import_id?: number
  needs_review?: boolean
  q?: string
  page?: number
  page_size?: number
}

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: ["transactions", filters],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/transactions", { params: { query: filters } }),
      ) as unknown as TransactionListResponse,
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: TransactionUpdate }) =>
      unwrap(
        await api.PATCH("/api/transactions/{transaction_id}", {
          params: { path: { transaction_id: id } },
          body: payload,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  })
}

export function useBulkUpdateTransactions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: TransactionBulkUpdate) =>
      unwrap(await api.POST("/api/transactions/bulk", { body: payload })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(
        await api.DELETE("/api/transactions/{transaction_id}", {
          params: { path: { transaction_id: id } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  })
}

// ---- Stats -----------------------------------------------------------------

export function useStatsSummary(params: { year: number; month?: number; account_id?: number }) {
  return useQuery({
    queryKey: ["stats", "summary", params],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/stats/summary", { params: { query: params } }),
      ) as unknown as StatsSummary,
  })
}

export function useStatsMonthly(params: { year: number; account_id?: number }) {
  return useQuery({
    queryKey: ["stats", "monthly", params],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/stats/monthly", { params: { query: params } }),
      ) as unknown as MonthlyRow[],
  })
}

export function useStatsByCategory(params: {
  year: number
  month?: number
  account_id?: number
}) {
  return useQuery({
    queryKey: ["stats", "by-category", params],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/stats/by-category", { params: { query: params } }),
      ) as unknown as ByCategoryRow[],
  })
}

export function useStatsGrid(params: { year: number; account_id?: number }) {
  return useQuery({
    queryKey: ["stats", "grid", params],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/stats/grid", { params: { query: params } }),
      ) as unknown as GridResponse,
  })
}

// ---- Admin -----------------------------------------------------------------

export function useAdminReset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: AdminResetRequest) =>
      unwrap(await api.POST("/api/admin/reset", { body: payload })) as unknown as AdminResetResult,
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

export type { CategoryRead, AccountRead, RuleRead, ImportRead }
