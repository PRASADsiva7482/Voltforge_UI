export type PropertyGridItem = {
  label: string
  value: string
}

export type PropertyGridProps = {
  items: PropertyGridItem[]
}

export function PropertyGrid({ items }: PropertyGridProps) {
  return (
    <dl className="vf-property-grid">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
