import { useEffect, type RefObject } from 'react'

/**
 * Hook that fires a handler when the user clicks outside any of the given refs.
 * Used for dismissing popups, context menus, tooltips, and modal overlays.
 */
export function useClickOutside<T extends HTMLElement>(
  refs: RefObject<T | null>[],
  handler: (event: MouseEvent | TouchEvent) => void,
) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const isInside = refs.some(
        (ref) => !ref.current || ref.current.contains(event.target as Node),
      )
      if (isInside) return
      handler(event)
    }

    document.addEventListener('mousedown', listener, { passive: true })
    document.addEventListener('touchstart', listener, { passive: true })

    return () => {
      document.removeEventListener('mousedown', listener)
      document.removeEventListener('touchstart', listener)
    }
  }, [refs, handler])
}
