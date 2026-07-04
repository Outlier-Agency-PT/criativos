"use client";


import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getThemeById, getThemeCSSVars, type ThemeId, type ThemeDefinition } from "@/lib/themes";

interface ThemeContextValue {
  theme: ThemeDefinition;
  themeId: ThemeId;
  setTheme: (id: ThemeId) => Promise<void>;
  loading: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: getThemeById("cyan"),
  themeId: "cyan",
  setTheme: async () => {},
  loading: true,
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyThemeVars(theme: ThemeDefinition) {
  const vars = getThemeCSSVars(theme);
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

interface ThemeProviderProps {
  children: React.ReactNode;
  orgId: string;
}

export function ThemeProvider({ children, orgId }: ThemeProviderProps) {
  const [themeId, setThemeId] = useState<ThemeId>("cyan");
  const [loading, setLoading] = useState(true);

  // Load theme from API on mount
  useEffect(() => {
    async function loadTheme() {
      try {
        const res = await fetch(`/api/theme?orgId=${orgId}`);
        if (res.ok) {
          const data = await res.json();
          const id = (data.theme_id || "cyan") as ThemeId;
          setThemeId(id);
          applyThemeVars(getThemeById(id));
        }
      } catch {
        // fallback to cyan
        applyThemeVars(getThemeById("cyan"));
      } finally {
        setLoading(false);
      }
    }
    loadTheme();
  }, [orgId]);

  const setTheme = useCallback(async (id: ThemeId) => {
    setThemeId(id);
    applyThemeVars(getThemeById(id));

    // Persist to API
    try {
      await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, themeId: id }),
      });
    } catch {
      // silent — theme already applied visually
    }
  }, [orgId]);

  const theme = getThemeById(themeId);

  return (
    <ThemeContext.Provider value={{ theme, themeId, setTheme, loading }}>
      {children}
    </ThemeContext.Provider>
  );
}

