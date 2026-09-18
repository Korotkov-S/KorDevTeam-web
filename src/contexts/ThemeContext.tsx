import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

export const DEFAULT_THEME: Theme = "light";

type ThemeStorage = Pick<Storage, "getItem">;

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: DEFAULT_THEME,
  toggleTheme: () => undefined,
  setTheme: () => undefined,
});

export function getInitialTheme(): Theme {
  return DEFAULT_THEME;
}

export function getStoredTheme(storage: ThemeStorage | null | undefined): Theme {
  const savedTheme = storage?.getItem("theme");
  return savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("theme", newTheme);

    // Применяем тему к документу
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  useEffect(() => {
    // The server and first browser render use the same snapshot. Restore a
    // persisted preference only after hydration has completed.
    setTheme(getStoredTheme(window.localStorage));

    // Слушаем изменения системной темы
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      // Обновляем тему только если пользователь не выбрал тему вручную
      if (!localStorage.getItem("theme")) {
        setTheme(e.matches ? "dark" : "light");
      }
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
