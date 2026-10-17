import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light"

/** Accent presets; the colors live in index.css under `[data-accent=…]`. */
export const ACCENTS = ["indigo", "blue", "purple", "pink", "teal", "graphite"] as const
export type Accent = (typeof ACCENTS)[number]

type ThemeProviderState = {
  theme: Theme
  toggleTheme: () => void
  accent: Accent
  setAccent: (accent: Accent) => void
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

const STORAGE_KEY = "expenses-tracker-theme"
const ACCENT_STORAGE_KEY = "expenses-tracker-accent"

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // ignore storage access errors
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore storage access errors
  }
}

function getInitialTheme(): Theme {
  const stored = readStorage(STORAGE_KEY)
  if (stored === "dark" || stored === "light") return stored
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function getInitialAccent(): Accent {
  const stored = readStorage(ACCENT_STORAGE_KEY)
  return ACCENTS.includes(stored as Accent) ? (stored as Accent) : "indigo"
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [accent, setAccent] = useState<Accent>(getInitialAccent)

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.toggle("dark", theme === "dark")
    writeStorage(STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    window.document.documentElement.dataset.accent = accent
    writeStorage(ACCENT_STORAGE_KEY, accent)
  }, [accent])

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"))

  return (
    <ThemeProviderContext.Provider value={{ theme, toggleTheme, accent, setAccent }}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeProviderContext)
  if (!context) throw new Error("useTheme must be used within a ThemeProvider")
  return context
}
