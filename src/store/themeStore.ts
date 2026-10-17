import { create } from 'zustand'

type Theme = 'dark' | 'light'
type Preference = Theme | 'system'
const key = 'voltforge-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')
function readPreference(): Preference {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null')?.state
    const value = saved?.preference ?? saved?.theme
    return value === 'dark' || value === 'light' ? value : 'system'
  } catch { return 'system' }
}
function resolve(preference: Preference): Theme {
  return preference === 'system' ? (media.matches ? 'dark' : 'light') : preference
}
function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.classList.toggle('light', theme === 'light')
  document.documentElement.style.colorScheme = theme
  document.documentElement.style.backgroundColor = 'var(--vf-bg)'
}
interface ThemeState {
  theme: Theme
  preference: Preference
  setTheme: (preference: Preference) => void
  toggleTheme: () => void
}
export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: resolve(readPreference()),
  preference: readPreference(),
  setTheme: (preference) => {
    const theme = resolve(preference)
    apply(theme)
    set({ theme, preference })
    try { localStorage.setItem(key, JSON.stringify({ state: { theme, preference }, version: 0 })) } catch { /* Session theme still works without storage. */ }
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}))
apply(useThemeStore.getState().theme)
media.addEventListener('change', () => {
  if (useThemeStore.getState().preference === 'system') {
    const theme = resolve('system')
    apply(theme)
    useThemeStore.setState({ theme })
  }
})
window.addEventListener('storage', (event) => {
  if (event.key !== key && event.key !== null) return
  const preference = readPreference()
  const theme = resolve(preference)
  apply(theme)
  useThemeStore.setState({ preference, theme })
})
