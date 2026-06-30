import type { CSSProperties } from 'react'
import { ChevronRight, FileCode2, Folder, FolderOpen } from 'lucide-react'
import { cn } from '../../lib/cn'

export type ExplorerItem = {
  active?: boolean
  children?: ExplorerItem[]
  id: string
  label: string
  type: 'folder' | 'file'
}

export type ExplorerTreeProps = {
  items: ExplorerItem[]
}

function ExplorerRow({ item, level = 0 }: { item: ExplorerItem; level?: number }) {
  const isFolder = item.type === 'folder'
  const hasChildren = Boolean(item.children?.length)

  return (
    <>
      <div className={cn('vf-explorer__row', item.active && 'is-active')} style={{ '--level': level } as CSSProperties}>
        {hasChildren ? <ChevronRight className="vf-explorer__chevron" size={14} /> : <span className="vf-explorer__spacer" />}
        {isFolder ? (item.active ? <FolderOpen size={15} /> : <Folder size={15} />) : <FileCode2 size={15} />}
        <span>{item.label}</span>
      </div>
      {item.children?.map((child) => <ExplorerRow item={child} key={child.id} level={level + 1} />)}
    </>
  )
}

export function ExplorerTree({ items }: ExplorerTreeProps) {
  return (
    <nav className="vf-explorer" aria-label="Project explorer">
      {items.map((item) => (
        <ExplorerRow item={item} key={item.id} />
      ))}
    </nav>
  )
}
