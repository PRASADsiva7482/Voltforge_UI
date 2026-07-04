export interface SuggestionsListProps {
  className?: string
  onSelect: (value: string) => void
  suggestions: string[]
}

export function SuggestionsList({ className = '', onSelect, suggestions }: SuggestionsListProps) {
  return (
    <div className={`vf-suggestions ${className}`}>
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          className="vf-suggestions__chip"
          onClick={() => onSelect(s)}
        >
          <svg className="vf-suggestions__sparkle" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" /></svg>
          <span className="vf-suggestions__text">{s}</span>
        </button>
      ))}
    </div>
  )
}
