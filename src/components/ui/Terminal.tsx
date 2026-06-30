export type TerminalLine = {
  tone?: 'muted' | 'success' | 'warning' | 'danger'
  value: string
}

export type TerminalProps = {
  lines: TerminalLine[]
  title?: string
}

export function Terminal({ lines, title = 'Serial monitor' }: TerminalProps) {
  return (
    <section className="vf-terminal">
      <header>
        <span>{title}</span>
        <span className="vf-terminal__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </header>
      <div>
        {lines.map((line) => (
          <p className={line.tone ? `vf-terminal__line--${line.tone}` : undefined} key={line.value}>
            {line.value}
          </p>
        ))}
      </div>
    </section>
  )
}
