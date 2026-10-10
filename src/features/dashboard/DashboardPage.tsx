import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Compass,
  Loader2,
  CircuitBoard,
  Cpu,
  Zap,
  FlaskConical,
  Search,
  Sparkles,
  ArrowRight,
  Clock,
  Layers,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import { projectApi } from '../../api/services'
import { Topbar } from '../../components/layout'
import { ActionCard } from '../../components/dashboard'
import { ProjectSummaryCard } from '../../components/product'
import { Button, MetricCard, TextInput, Badge } from '../../components/ui'
import labCatalog from '../labs/labCatalog.json'
import type { LabChallenge } from '../labs/labCriteriaEvaluator'

export function DashboardPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [projectSearch, setProjectSearch] = useState('')

  // Fetch real projects from the backend API
  const projectsQuery = useQuery({
    queryFn: () => projectApi.getUserProjects(0, 12).then((res) => res.data.data),
    queryKey: ['projects', 'mine', 'recent'],
  })

  const projects = projectsQuery.data?.content ?? []
  const totalCount = projectsQuery.data?.totalElements ?? projects.length

  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  // Calculate real engineering stats from user projects
  const publicCount = useMemo(() => projects.filter((p) => p.isPublic).length, [projects])
  const privateCount = Math.max(0, totalCount - publicCount)
  const uniqueBoards = useMemo(
    () => Array.from(new Set(projects.map((p) => p.boardType).filter(Boolean))),
    [projects]
  )

  const filteredProjects = useMemo(() => {
    const term = projectSearch.trim().toLowerCase()
    if (!term) return projects
    return projects.filter((p) =>
      [p.name, p.description, p.boardType, p.tags].filter(Boolean).join(' ').toLowerCase().includes(term)
    )
  }, [projects, projectSearch])

  const labs = labCatalog as unknown as LabChallenge[]
  const featuredLabs = useMemo(() => labs.slice(0, 3), [labs])

  return (
    <>
      <Topbar
        eyebrow={t("Workspace")}
        title={`${t("Welcome back")}, ${auth.user?.displayName ?? t("Engineer")}`}
      />

      {/* Hardware & Engineering Domain Metrics */}
      <section className="metrics-grid" id="overview">
        <MetricCard
          icon={<CircuitBoard size={14} />}
          label={t("Circuit Designs")}
          trendTone={totalCount > 0 ? 'success' : 'neutral'}
          trendLabel={totalCount > 0 ? `${privateCount} ${t("Private")} · ${publicCount} ${t("Public")}` : t("Cloud Synced")}
          value={String(totalCount)}
        />
        <MetricCard
          icon={<Cpu size={14} />}
          label={t("Target Microcontrollers")}
          trendTone="info"
          trendLabel={
            uniqueBoards.length > 0
              ? `${uniqueBoards.length} ${t("active architectures")}`
              : 'AVR · ESP32 · RP2040 · ARM'
          }
          value={uniqueBoards.length > 0 ? String(uniqueBoards.length) : '16+'}
        />
        <MetricCard
          icon={<Zap size={14} />}
          label={t("Component Inventory")}
          trendTone="success"
          trendLabel={t("Passives · ICs · Displays")}
          value="50+"
        />
        <MetricCard
          icon={<FlaskConical size={14} />}
          label={t("Engineering Labs")}
          trendTone="warning"
          trendLabel={t("Automated grading")}
          value={String(labs.length)}
        />
      </section>

      {/* Quick Action Launchpad */}
      <section className="quick-actions" style={{ marginTop: '1.25rem' }}>
        <ActionCard
          icon={Plus}
          label={t("New project")}
          onClick={() => navigate('/projects/new')}
          text={t("Design a custom schematic and microcontroller firmware project.")}
        />
        <ActionCard
          icon={Zap}
          label={t("Live Sandbox Simulator")}
          onClick={() => navigate('/editor/sandbox?preset=led-blink')}
          text={t("Instant ephemeral breadboard simulation without saving.")}
        />
        <ActionCard
          icon={FlaskConical}
          label={t("Engineering Labs")}
          onClick={() => navigate('/labs')}
          text={t("Practice circuit challenges with live criteria evaluation.")}
        />
      </section>

      {/* Hardware Quick-Start Templates */}
      <section className="content-band" style={{ marginTop: '2.5rem' }}>
        <div className="section-heading" style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="vf-eyebrow">{t("Start Building")}</p>
            <h2>{t("Quick-start templates")}</h2>
          </div>
          <Button onClick={() => navigate('/explore')} variant="ghost">
            <Compass size={15} style={{ marginRight: '6px' }} />
            {t("Explore all templates")}
          </Button>
        </div>

        <div className="dashboard-templates-grid">
          <div className="starter-card">
            <div>
              <div className="starter-card__header">
                <span className="starter-card__icon"><Zap size={20} /></span>
                <Badge tone="success"><Sparkles size={11} style={{ marginRight: '4px' }} />{t("Interactive")}</Badge>
              </div>
              <h3>{t("Arduino Blink & Switch")}</h3>
              <p>{t("Interactive Pin 13 LED, 220Ω current-limiting resistor, and latching switch controller.")}</p>
            </div>
            <div className="starter-card__footer">
              <span className="starter-card__board"><Cpu size={14} /> Arduino Uno R3</span>
              <Button size="sm" variant="primary" onClick={() => navigate('/editor/sandbox?preset=led-blink')}>
                {t("Launch")}
              </Button>
            </div>
          </div>

          <div className="starter-card">
            <div>
              <div className="starter-card__header">
                <span className="starter-card__icon"><Cpu size={20} /></span>
                <Badge tone="info">{t("Wireless & IoT")}</Badge>
              </div>
              <h3>{t("ESP32 IoT Sensor Node")}</h3>
              <p>{t("Dual-core 3.3V Wi-Fi microcontroller setup configured with ADC analog sensor sampling.")}</p>
            </div>
            <div className="starter-card__footer">
              <span className="starter-card__board"><Cpu size={14} /> ESP32-WROOM</span>
              <Button size="sm" variant="ghost" onClick={() => navigate('/projects/new?board=ESP32&name=ESP32%20IoT%20Sensor%20Node')}>
                {t("Create")}
              </Button>
            </div>
          </div>

          <div className="starter-card">
            <div>
              <div className="starter-card__header">
                <span className="starter-card__icon"><Layers size={20} /></span>
                <Badge tone="warning">{t("Analog Lab")}</Badge>
              </div>
              <h3>{t("3.3V Precision Voltage Divider")}</h3>
              <p>{t("Two-resistor divider safely scaling 5.0V source down to 3.3V logic with live multimeter validation.")}</p>
            </div>
            <div className="starter-card__footer">
              <span className="starter-card__board"><FlaskConical size={14} /> {t("Analog Lab")}</span>
              <Button size="sm" variant="ghost" onClick={() => navigate('/labs/lab-voltage-divider')}>
                {t("Practice")}
              </Button>
            </div>
          </div>

          <div className="starter-card">
            <div>
              <div className="starter-card__header">
                <span className="starter-card__icon"><Sparkles size={20} /></span>
                <Badge tone="neutral">{t("PWM Logic")}</Badge>
              </div>
              <h3>{t("RGB LED PWM Controller")}</h3>
              <p>{t("3-channel pulse-width modulation circuit driving vibrant multi-color LED illumination.")}</p>
            </div>
            <div className="starter-card__footer">
              <span className="starter-card__board"><Cpu size={14} /> Arduino Nano</span>
              <Button size="sm" variant="ghost" onClick={() => navigate('/projects/new?board=ARDUINO_NANO&name=RGB%20LED%20PWM%20Controller')}>
                {t("Create")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Real Projects Workspace */}
      <section className="content-band" style={{ marginTop: '2.5rem' }}>
        <div className="section-heading" style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="vf-eyebrow">{t("Workspace")}</p>
            <h2>{t("Recent projects")}</h2>
          </div>
          {projects.length > 0 && (
            <Button onClick={() => navigate('/projects')} variant="ghost">
              {t("View all")} ({totalCount})
            </Button>
          )}
        </div>

        {projects.length > 0 && (
          <div className="dashboard-filter-bar">
            <TextInput
              leftSlot={<Search size={16} />}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder={t("Filter your projects by name, MCU board, or tags...")}
              value={projectSearch}
            />
          </div>
        )}

        {projectsQuery.isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '2.5rem 0', color: 'var(--vf-text-muted)' }}>
            <Loader2 size={20} className="vf-spin" />
            <span>{t("Loading projects...")}</span>
          </div>
        ) : projectsQuery.isError ? (
          <div style={{ padding: '2rem', background: 'var(--vf-surface-raised)', borderRadius: '12px', border: '1px solid var(--vf-border)' }}>
            <p style={{ color: 'var(--vf-red)', fontWeight: 500, margin: 0 }}>{t("Projects API is offline")}</p>
            <p style={{ color: 'var(--vf-text-muted)', fontSize: '13px', marginTop: '6px', marginBottom: '12px' }}>
              {t("Check your backend Voltforge services and try again.")}
            </p>
            <Button size="sm" onClick={() => void projectsQuery.refetch()}>{t("Retry")}</Button>
          </div>
        ) : projects.length === 0 ? (
          <div style={{ padding: '3.5rem 2rem', textAlign: 'center', background: 'var(--vf-surface)', borderRadius: '12px', border: '1px dashed var(--vf-border)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--vf-teal-soft)', color: 'var(--vf-teal-dark)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
              <CircuitBoard size={24} />
            </div>
            <p style={{ fontWeight: 600, fontSize: '16px', margin: 0 }}>{t("No circuit designs yet")}</p>
            <p style={{ color: 'var(--vf-text-muted)', fontSize: '13px', marginTop: '6px', marginBottom: '1.5rem', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
              {t("Create a custom hardware schematic and firmware sketch, or launch our live sandbox to start experimenting immediately.")}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <Button icon={<Plus size={16} />} onClick={() => navigate('/projects/new')} variant="primary">
                {t("Create your first project")}
              </Button>
              <Button icon={<Zap size={16} />} onClick={() => navigate('/editor/sandbox?preset=led-blink')} variant="ghost">
                {t("Open Sandbox")}
              </Button>
            </div>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', background: 'var(--vf-surface)', borderRadius: '12px', border: '1px dashed var(--vf-border)' }}>
            <p style={{ fontWeight: 500, margin: 0 }}>{t("No projects match your filter")}</p>
            <p style={{ color: 'var(--vf-text-muted)', fontSize: '13px', marginTop: '6px', marginBottom: '12px' }}>
              {t("Try clearing your search query to see all your designs.")}
            </p>
            <Button size="sm" onClick={() => setProjectSearch('')} variant="ghost">
              {t("Clear filter")}
            </Button>
          </div>
        ) : (
          <div className="project-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {filteredProjects.map((project) => (
              <ProjectSummaryCard
                key={project.id}
                onOpen={() => navigate(`/editor/${project.id}`)}
                onDelete={(id) => deleteMutation.mutate(id)}
                project={project}
              />
            ))}
          </div>
        )}
      </section>

      {/* Featured Circuit Engineering Challenges */}
      <section className="content-band" style={{ marginTop: '2.5rem', marginBottom: '3rem' }}>
        <div className="section-heading" style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="vf-eyebrow">{t("Skill Building")}</p>
            <h2>{t("Engineering challenges")}</h2>
          </div>
          <Button onClick={() => navigate('/labs')} variant="ghost">
            <FlaskConical size={15} style={{ marginRight: '6px' }} />
            {t("View all labs")} ({labs.length})
          </Button>
        </div>

        <div className="dashboard-labs-grid">
          {featuredLabs.map((lab) => (
            <div key={lab.id} className="lab-preview-card">
              <div>
                <div className="lab-preview-card__meta">
                  <Badge tone={lab.difficulty === 'Beginner' ? 'success' : lab.difficulty === 'Intermediate' ? 'warning' : 'danger'}>
                    {lab.difficulty}
                  </Badge>
                  <span style={{ fontSize: '12px', color: 'var(--vf-text-soft)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> {lab.estimatedMinutes}m
                  </span>
                </div>
                <h3>{lab.title}</h3>
                <p>{lab.description}</p>
              </div>
              <div className="lab-preview-card__footer">
                <span style={{ fontSize: '12px', color: 'var(--vf-text-soft)' }}>
                  {lab.objectives.length} {t("criteria checks")}
                </span>
                <Button size="sm" variant="ghost" onClick={() => navigate(`/labs/${lab.id}`)}>
                  {t("Start Challenge")} <ArrowRight size={13} style={{ marginLeft: '4px' }} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
