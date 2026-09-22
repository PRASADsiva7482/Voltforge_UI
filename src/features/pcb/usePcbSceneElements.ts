import { useRef, type ReactElement } from 'react';

// Memoizing a component still recreates its parent JSX. Keep the actual elements
// for unchanged visible objects too (particularly expensive with React's dev
// stack capture). Each snapshot retains only the currently mounted IDs.
export function usePcbSceneElements<T extends { id: string }, P extends object>(
  items: readonly T[], propsFor: (item: T) => P, render: (item: T, props: P) => ReactElement,
  equal: (a: P, b: P) => boolean = shallowPropsEqual,
): ReactElement[] {
  const previous = useRef(new Map<string, { props: P; element: ReactElement }>());
  const next = new Map<string, { props: P; element: ReactElement }>();
  const elements = items.map(item => {
    const props = propsFor(item), cached = previous.current.get(item.id);
    const entry = cached && equal(cached.props, props) ? cached : { props, element: render(item, props) };
    next.set(item.id, entry);
    return entry.element;
  });
  previous.current = next;
  return elements;
}

function shallowPropsEqual<P extends object>(a: P, b: P): boolean {
  const keys = Object.keys(a) as (keyof P)[];
  return keys.length === Object.keys(b).length && keys.every(key => Object.is(a[key], b[key]));
}
