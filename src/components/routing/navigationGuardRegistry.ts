// Install before BrowserRouter, without importing editor stores into the app's
// initial bundle. The active editor registers its guard for its mounted lifetime.
let active: ((event: PopStateEvent) => void) | undefined
const dispatch = (event: PopStateEvent) => active?.(event)
if (typeof window !== 'undefined') window.addEventListener('popstate', dispatch, true)
if (import.meta.hot) import.meta.hot.dispose(() => window.removeEventListener('popstate', dispatch, true))

export function registerNavigationGuard(guard: (event: PopStateEvent) => void) {
  active = guard
  return () => { if (active === guard) active = undefined }
}
