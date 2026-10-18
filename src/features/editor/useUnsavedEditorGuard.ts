import { useEffect } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { registerNavigationGuard } from '../../components/routing/navigationGuardRegistry'

export function confirmLeaveEditor() {
  const state = useProjectStore.getState()
  return !(state.isDirty || state.isSaving) || window.confirm('This project has unsaved changes. Leave this editor and discard them?')
}

export function useUnsavedEditorGuard(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const state = useProjectStore.getState()
      if (state.isDirty || state.isSaving) { event.preventDefault(); event.returnValue = '' }
    }
    const click = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || link.download || event.ctrlKey || event.metaKey || event.shiftKey) return
      const url = new URL(link.href)
      if (url.pathname === location.pathname && url.search === location.search) return
      if (!confirmLeaveEditor()) { event.preventDefault(); event.stopPropagation() }
    }
    // BrowserRouter records a history index. Intercept Back/Forward before its
    // popstate listener so a rejected navigation cannot unmount the dirty editor.
    let currentIndex = window.history.state?.idx
    let restoring = false
    const pop = (event: PopStateEvent) => {
      const nextIndex = event.state?.idx
      if (restoring) { restoring = false; event.stopImmediatePropagation(); return }
      if (typeof currentIndex === 'number' && typeof nextIndex === 'number' && nextIndex !== currentIndex && !confirmLeaveEditor()) {
        event.stopImmediatePropagation()
        restoring = true
        window.history.go(currentIndex - nextIndex)
      } else currentIndex = nextIndex
    }
    window.addEventListener('beforeunload', beforeUnload)
    const unregister = registerNavigationGuard(pop)
    document.addEventListener('click', click, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); unregister(); document.removeEventListener('click', click, true) }
  }, [enabled])
}
