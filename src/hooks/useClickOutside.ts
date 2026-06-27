import { useEffect, RefObject } from 'react';

/**
 * Hook that alerts clicks outside of the passed refs
 */
export function useClickOutside<T extends HTMLElement>(
  refs: RefObject<T | null>[],
  handler: (event: MouseEvent | TouchEvent) => void
) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      // Check if clicked node is inside any of the tracked refs
      const isInside = refs.some((ref) => {
        return !ref.current || ref.current.contains(event.target as Node);
      });

      if (isInside) return;
      handler(event);
    };

    document.addEventListener('mousedown', listener, { passive: true });
    document.addEventListener('touchstart', listener, { passive: true });

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [refs, handler]);
}
