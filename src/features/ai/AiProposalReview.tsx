import { CheckSquare, RotateCcw, Square } from 'lucide-react'
import type { AiProposal } from './aiProposal'

interface Props {
  isStale: boolean
  isWorking?: boolean
  onApply: () => void
  onToggle: (itemId: string) => void
  onUndo?: () => void
  proposal: AiProposal
  selectedIds: string[]
  undoAvailable?: boolean
}

export function AiProposalReview({
  isStale,
  isWorking = false,
  onApply,
  onToggle,
  onUndo,
  proposal,
  selectedIds,
  undoAvailable = false,
}: Props) {
  const selectedCount = selectedIds.length
  return (
    <section className="vf-ai-proposal" aria-labelledby={`vf-ai-proposal-${proposal.id}`}>
      <div className="vf-ai-proposal__heading">
        <div>
          <strong id={`vf-ai-proposal-${proposal.id}`}>Review proposed changes</strong>
          <span>{proposal.items.length} typed change(s) bound to the source project revision.</span>
        </div>
        {isStale && <span className="vf-ai-proposal__stale" role="status">Stale — regenerate</span>}
      </div>
      <div className="vf-ai-proposal__list">
        {proposal.items.map((item) => {
          const selected = selectedIds.includes(item.id)
          return (
            <label key={item.id} className={`vf-ai-proposal__item${selected ? ' is-selected' : ''}`}>
              <input
                type="checkbox"
                checked={selected}
                disabled={isStale || isWorking}
                onChange={() => onToggle(item.id)}
                aria-label={`${selected ? 'Exclude' : 'Include'} ${item.summary}`}
              />
              {selected ? <CheckSquare size={13} aria-hidden="true" /> : <Square size={13} aria-hidden="true" />}
              <span className="vf-ai-proposal__item-copy">
                <strong>{item.summary}</strong>
                <span>{item.kind.replaceAll('-', ' ')} · {item.detail}</span>
              </span>
            </label>
          )
        })}
      </div>
      <div className="vf-ai-proposal__footer">
        <span>{selectedCount} of {proposal.items.length} selected</span>
        <div>
          {undoAvailable && onUndo && (
            <button type="button" disabled={isWorking} onClick={onUndo}>
              <RotateCcw size={12} aria-hidden="true" /> Undo AI changes
            </button>
          )}
          <button type="button" disabled={isStale || isWorking || selectedCount === 0} onClick={onApply}>
            {isWorking ? 'Applying…' : 'Apply selected'}
          </button>
        </div>
      </div>
    </section>
  )
}
