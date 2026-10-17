import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CircuitBoard, Cpu, FlaskConical, Search, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import { projectApi } from '../../api/services'
import { Topbar } from '../../components/layout'
import { Button, Badge, TextInput } from '../../components/ui'
import { EmptyState, ErrorState, LoadingState } from '../../components/data'
import { BOARD_CATALOG } from '../canvas/boardCatalog'
import labCatalog from '../labs/labCatalog.json'

export function DashboardPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const query = useQuery({
    queryKey: ['projects', 'mine', 'recent'],
    queryFn: () => projectApi.getUserProjects(0, 6).then(res => res.data.data),
  })
  const projects = query.data?.content ?? []
  const filtered = projects.filter(p => [p.name, p.boardType, p.tags].join(' ').toLowerCase().includes(search.trim().toLowerCase()))
  return <>
    <Topbar eyebrow={t('Engineering workspace')} title={`${t('Welcome back')}, ${auth.user?.displayName ?? t('Engineer')}`} />
    <section className="workspace-overview" aria-label={t('Workspace overview')}>
      <div className="workspace-overview__intro">
        <span className="vf-eyebrow">{t('Design. Test. Understand.')}</span>
        <h2>{t('Your next idea starts here.')}</h2>
        <p>{t('Build a circuit, inspect a signal, and turn a working idea into a saved design.')}</p>
        <div className="component-row">
          <Button variant="primary" icon={<Zap size={16} />} onClick={() => navigate('/editor/sandbox?preset=led-blink')}>{t('Open simulator')}</Button>
          <Button variant="secondary" icon={<FlaskConical size={16} />} onClick={() => navigate('/labs')}>{t('Engineering Labs')}</Button>
        </div>
      </div>
      <dl className="workspace-overview__metrics">
        <div><dt>{t('Saved projects')}</dt><dd>{query.isSuccess ? query.data.totalElements : '—'}</dd><small>{query.isError ? t('Unavailable') : query.isPending ? t('Loading') : t('In your workspace')}</small></div>
        <div><dt>{t('Board catalog')}</dt><dd>{BOARD_CATALOG.length}</dd><small>{t('Simulation support varies by board')}</small></div>
        <div><dt>{t('Guided labs')}</dt><dd>{labCatalog.length}</dd><small>{t('Hands-on circuit challenges')}</small></div>
      </dl>
    </section>
    <div className="dashboard-workspace">
      <section className="dashboard-projects">
        <div className="section-heading"><div><p className="vf-eyebrow">{t('Continue building')}</p><h2>{t('Recent projects')}</h2></div><Button variant="ghost" onClick={() => navigate('/projects')} trailingIcon={<ArrowRight size={15} />}>{t('View all')}</Button></div>
        {projects.length > 0 && <TextInput aria-label={t('Filter recent projects')} leftSlot={<Search size={16} />} placeholder={t('Filter recent projects by name or board')} value={search} onChange={e => setSearch(e.target.value)} />}
        {query.isPending ? <LoadingState label={t('Loading recent projects')} /> : query.isError ? <ErrorState label={t('Could not load projects')} onRetry={() => void query.refetch()} /> : !projects.length ?
          <EmptyState label={t('Make your first connection')} text={t('Create a project to save your schematic and firmware, or experiment in the sandbox.')} action={<Button variant="primary" onClick={() => navigate('/projects/new')}>{t('Create your first project')}</Button>} /> : !filtered.length ?
          <EmptyState label={t('No matching projects')} text={t('Search applies to your six most recently edited projects.')} action={<Button onClick={() => setSearch('')}>{t('Clear filter')}</Button>} /> :
          <div className="project-ledger">{filtered.map(project => <button className="project-ledger__row" key={project.id} onClick={() => navigate(`/editor/${project.id}`)}>
            <span className="project-ledger__icon"><CircuitBoard size={22} /></span>
            <span className="project-ledger__name"><strong>{project.name}</strong><small>{project.boardType.replaceAll('_', ' ')}</small></span>
            <Badge tone="neutral">{project.isPublic ? t('Public') : t('Private')}</Badge>
            <time dateTime={project.updatedAt}>{new Date(project.updatedAt).toLocaleDateString()}</time><ArrowRight size={16} />
          </button>)}</div>}
      </section>
      <aside className="dashboard-lab-spotlight">
        <FlaskConical size={28} strokeWidth={1.4} />
        <p className="vf-eyebrow">{t('At the workbench')}</p>
        <h2>{t('Build your intuition.')}</h2>
        <p>{t('Focused experiments with live criteria, progressive hints, and circuits you can inspect.')}</p>
        {labCatalog.slice(0, 2).map(lab => <button className="lab-link" key={lab.id} onClick={() => navigate(`/labs/${lab.id}`)}><span><small>{lab.difficulty} · {lab.estimatedMinutes} {t('min')}</small><strong>{lab.title}</strong></span><ArrowRight size={16} /></button>)}
        <Button variant="secondary" onClick={() => navigate('/labs')}>{t('Browse all challenges')}</Button>
      </aside>
    </div>
    <section className="dashboard-starters">
      <div className="section-heading"><div><p className="vf-eyebrow">{t('A starting point')}</p><h2>{t('Quick starts')}</h2></div><Button variant="ghost" onClick={() => navigate('/explore')}>{t('Explore community templates')}</Button></div>
      <div className="starter-list">
        <button onClick={() => navigate('/editor/sandbox?preset=led-blink')}><span className="starter-number">01</span><Zap size={20} /><span><strong>{t('Blink & switch')}</strong><small>{t('Ready-to-run Arduino sandbox')}</small></span><ArrowRight size={16} /></button>
        <button onClick={() => navigate('/projects/new?board=ESP32&name=ESP32%20Workspace')}><span className="starter-number">02</span><Cpu size={20} /><span><strong>{t('ESP32 workspace')}</strong><small>{t('New project with starter firmware')}</small></span><ArrowRight size={16} /></button>
        <button onClick={() => navigate('/labs/lab-voltage-divider')}><span className="starter-number">03</span><FlaskConical size={20} /><span><strong>{t('Voltage divider')}</strong><small>{t('Guided analog circuit lab')}</small></span><ArrowRight size={16} /></button>
      </div>
    </section>
  </>
}
