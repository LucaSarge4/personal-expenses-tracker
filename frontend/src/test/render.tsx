import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import type { ReactElement } from "react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"

import { ThemeProvider } from "@/components/theme-provider"
import { I18nProvider } from "@/lib/i18n"

/** Exposes the current URL so tests can assert on navigation/search params. */
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

/** Renders `ui` with the same providers as main.tsx, against the fake API. */
export function renderWithProviders(
  ui: ReactElement,
  { route = "/", path = "*" }: { route?: string; path?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
  return {
    queryClient,
    ...render(
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <MemoryRouter initialEntries={[route]}>
              <Routes>
                <Route path={path} element={ui} />
              </Routes>
              <LocationProbe />
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    ),
  }
}
