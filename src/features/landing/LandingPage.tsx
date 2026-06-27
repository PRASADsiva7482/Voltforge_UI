import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import keycloak from '../../utils/keycloak';
import VfButton from '../../components/ui/VfButton';
import VfAlertCard from '../../components/ui/VfAlertCard';
import {
  Zap, ArrowRight, Sun, Moon, Play, Square, ChevronRight,
  Cpu, Users, Layers, Terminal, Sparkles,
  MonitorSmartphone,
} from 'lucide-react';
import {
  HeroIllustration,
  IconSimulator, IconCanvas, IconCollab, IconCommunity, IconCode,
} from './components/LandingSvgs';

/* ─── Animation helpers ──────────────────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.section
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={stagger}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/* ─── Feature data (AI removed — not integrated yet) ─────────────────────── */
interface Feature {
  id: string;
  icon: any;
  color: string;
  title: string;
  tagline: string;
  details: string[];
}

const features: Feature[] = [
  {
    id: 'sim',
    icon: IconSimulator,
    color: 'amber',
    title: 'Live Simulator',
    tagline: 'Run firmware on virtual hardware. See results instantly.',
    details: [
      'Execute C++ code line-by-line with a built-in AVR interpreter',
      'LEDs glow, motors spin, buzzers sound — all rendered in real-time',
      'Debug with a live Serial Monitor that captures virtual UART output',
    ],
  },
  {
    id: 'canvas',
    icon: IconCanvas,
    color: 'blue',
    title: 'Schematic Canvas',
    tagline: 'Drag, connect, and configure — like a real workbench.',
    details: [
      'Place 50+ electronic components from resistors to microcontrollers',
      'Tune values live — resistance, capacitance, LED color, pin modes',
      'Unlimited undo/redo with full operation history tracking',
    ],
  },
  {
    id: 'code',
    icon: IconCode,
    color: 'violet',
    title: 'Firmware Editor',
    tagline: 'Write and test embedded code inside the browser.',
    details: [
      'Monaco Editor — the same engine powering VS Code',
      'Syntax highlighting for Arduino, ESP32, and STM32 firmware',
      'One-click compile with instant error feedback and line markers',
    ],
  },
  {
    id: 'collab',
    icon: IconCollab,
    color: 'rose',
    title: 'Live Collaboration',
    tagline: 'Build together. Cursors, edits, and chat — all synced.',
    details: [
      'See collaborator cursors moving in real-time on your canvas',
      'WebSocket-powered state sync for components, wires, and code',
      'Share workspace links with granular permission controls',
    ],
  },
  {
    id: 'community',
    icon: IconCommunity,
    color: 'cyan',
    title: 'Community Hub',
    tagline: 'Explore, fork, and remix projects from engineers worldwide.',
    details: [
      'Browse public projects with search, tags, and category filters',
      'One-click fork to clone any project into your workspace',
      'Publish your designs and build your engineering portfolio',
    ],
  },
];

const colorMap: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', glow: 'shadow-amber-500/10' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', glow: 'shadow-blue-500/10' },
  violet: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20', glow: 'shadow-violet-500/10' },
  rose: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', glow: 'shadow-rose-500/10' },
  cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20', glow: 'shadow-cyan-500/10' },
};

/* ─── Stats bar data (AI removed) ────────────────────────────────────────── */
const stats = [
  { icon: Cpu, value: '50+', label: 'Components' },
  { icon: Layers, value: '6', label: 'Board Types' },
  { icon: MonitorSmartphone, value: 'Real-Time', label: 'Simulation' },
  { icon: Users, value: 'Multi-User', label: 'Collaboration' },
];

/* ═════════════════════════════════════════════════════════════════════════════
   Landing Page Component
   ═════════════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();

  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);

  // ── Simulator demo ──
  const [simRunning, setSimRunning] = useState(false);
  const [simStep, setSimStep] = useState(-1);
  const [serialLogs, setSerialLogs] = useState<string[]>([]);
  const [ledOn, setLedOn] = useState(false);

  const simSteps = [
    { line: 5, log: 'pinMode(LED_PIN, OUTPUT)', led: false },
    { line: 6, log: 'Serial.begin(115200)', led: false },
    { line: 9, log: 'digitalWrite(13, HIGH)  →  LED ON', led: true },
    { line: 10, log: 'Serial: "LED ON"', led: true },
    { line: 11, log: 'delay(1000)', led: true },
    { line: 13, log: 'digitalWrite(13, LOW)  →  LED OFF', led: false },
    { line: 14, log: 'Serial: "LED OFF"', led: false },
    { line: 15, log: 'delay(1000)', led: false },
  ];

  useEffect(() => {
    if (!simRunning) { setSimStep(-1); setSerialLogs([]); setLedOn(false); return; }
    let idx = 0;
    setSerialLogs([t('[BOOT] Virtual ATmega328P ready')]);
    const timer = setInterval(() => {
      const s = simSteps[idx];
      setSimStep(s.line);
      setLedOn(s.led);
      setSerialLogs(prev => [...prev.slice(-6), `[${String(idx * 500 + 500).padStart(4, '0')}ms] ${s.log}`]);
      idx = (idx + 1) % simSteps.length;
    }, 900);
    return () => clearInterval(timer);
  }, [simRunning]);

  const displayName = user?.displayName || user?.username || keycloak.tokenParsed?.name || keycloak.tokenParsed?.preferred_username || '';

  const handleLaunch = () => {
    if (isAuthenticated) navigate('/dashboard');
    else keycloak.login({ redirectUri: window.location.origin + '/dashboard' });
  };

  const handleSignUp = () => {
    try { keycloak.register({ redirectUri: window.location.origin + '/dashboard' }); }
    catch { keycloak.login({ action: 'register', redirectUri: window.location.origin + '/dashboard' }); }
  };

  /* ─── Render ───────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#fafbfc] text-slate-900 dark:bg-[#08090d] dark:text-slate-100 transition-colors duration-500 overflow-x-hidden">

      {/* ══════════════════════ NAVBAR ══════════════════════ */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 dark:bg-[#08090d]/80 border-b border-slate-200/60 dark:border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5 cursor-pointer select-none" onClick={() => navigate('/')}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[17px] font-extrabold tracking-tight">
              Volt<span className="text-emerald-500">Forge</span>
            </span>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            <VfButton variant="ghost" size="sm" icon={theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
              onClick={toggleTheme} title={t("Toggle theme")} />

            <div className="w-px h-5 bg-slate-200 dark:bg-white/10 mx-1" />

            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-xs font-semibold text-slate-500 dark:text-slate-400">{displayName}</span>
                <VfButton variant="primary" size="sm" onClick={() => navigate('/dashboard')}
                  icon={<ArrowRight className="w-3.5 h-3.5" />} iconPosition="right">
                  {t('Dashboard')}
                </VfButton>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <VfButton variant="ghost" size="sm"
                  onClick={() => keycloak.login({ redirectUri: window.location.origin + '/dashboard' })}>
                  {t('Log in')}
                </VfButton>
                <VfButton variant="primary" size="sm" onClick={handleSignUp}>
                  {t('Get Started')}
                </VfButton>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ══════════════════════ HERO ══════════════════════ */}
      <section className="relative max-w-7xl mx-auto px-6 lg:px-10 pt-20 md:pt-28 pb-28">
        {/* Ambient blurs */}
        <div className="absolute -top-20 left-1/3 w-[500px] h-[500px] bg-emerald-500/[0.07] rounded-full blur-[120px] pointer-events-none dark:bg-emerald-500/[0.04]" />
        <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-cyan-500/[0.05] rounded-full blur-[100px] pointer-events-none dark:bg-cyan-500/[0.03]" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
          {/* Text side */}
          <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8 text-center lg:text-left">

            <motion.div variants={fadeUp} custom={0}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" /> {t('Virtual Electronics Workspace')}
            </motion.div>

            <motion.h1 variants={fadeUp} custom={1}
              className="text-[clamp(2.2rem,5.5vw,4rem)] font-extrabold leading-[1.08] tracking-tight text-slate-950 dark:text-white">
              {t('Design circuits.')}{' '}
              <br className="hidden md:block" />
              <span className="bg-gradient-to-r from-emerald-500 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                {t('Simulate instantly.')}
              </span>
            </motion.h1>

            <motion.p variants={fadeUp} custom={2}
              className="text-[clamp(0.95rem,1.8vw,1.15rem)] text-slate-600 dark:text-slate-400 max-w-lg mx-auto lg:mx-0 leading-relaxed font-medium">
              {t('A virtual electronics lab where you drag components onto a canvas, write firmware in the browser, and watch your circuit come alive — all inside your browser.')}
            </motion.p>

            <motion.div variants={fadeUp} custom={3} className="flex flex-wrap items-center justify-center lg:justify-start gap-4">
              <VfButton variant="primary" size="xl" onClick={handleLaunch}
                icon={<ArrowRight className="w-4.5 h-4.5" />} iconPosition="right">
                {isAuthenticated ? t('Open Workspace') : t('Start Building — Free')}
              </VfButton>
              <VfButton variant="secondary" size="xl" onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
                icon={<Play className="w-4 h-4" />}>
                {t('Watch Demo')}
              </VfButton>
            </motion.div>
          </motion.div>

          {/* Illustration side */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            className="flex justify-center lg:justify-end">
            <HeroIllustration />
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════ STATS BAR ══════════════════════ */}
      <Section className="max-w-5xl mx-auto px-6 lg:px-10 pb-20">
        <motion.div variants={fadeUp}
          className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {stats.map((s, i) => (
            <motion.div key={i} variants={fadeUp} custom={i}
              className="flex items-center gap-3.5 p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm dark:bg-slate-800/60 dark:border-slate-700/60 dark:shadow-[0_2px_16px_rgba(0,0,0,0.3)]">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 flex-shrink-0">
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-base font-extrabold text-slate-900 dark:text-white leading-tight">{t(s.value)}</p>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t(s.label)}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* ══════════════════════ FEATURES ══════════════════════ */}
      <Section className="max-w-7xl mx-auto px-6 lg:px-10 pt-8 pb-28">
        <motion.div variants={fadeUp} className="text-center mb-16 space-y-4">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
            {t('Everything you need to build electronics')}
          </h2>
          <p className="text-base text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
            {t('From schematic design to firmware testing — one integrated platform.')}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => {
            const c = colorMap[f.color];
            const Icon = f.icon;
            const isOpen = expandedFeature === f.id;
            return (
              <motion.div key={f.id} variants={fadeUp} custom={i}
                className={`group relative rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden
                  ${isOpen
                    ? `${c.border} bg-white dark:bg-slate-800/80 shadow-lg ${c.glow} dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)]`
                    : 'border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-lg dark:hover:shadow-[0_4px_20px_rgba(0,0,0,0.35)] shadow-sm dark:shadow-[0_2px_12px_rgba(0,0,0,0.25)]'
                  }`}
                onClick={() => setExpandedFeature(isOpen ? null : f.id)}>
                <div className="p-7">
                  <div className="flex items-start justify-between mb-5">
                    <div className={`w-12 h-12 rounded-xl ${c.bg} ${c.text} flex items-center justify-center`}>
                      <Icon />
                    </div>
                    <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-300 mt-1 ${isOpen ? 'rotate-90' : 'group-hover:translate-x-0.5'}`} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t(f.title)}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{t(f.tagline)}</p>
                </div>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                      className="overflow-hidden">
                      <div className="px-6 pb-6 space-y-2.5 border-t border-slate-100 dark:border-white/[0.06] pt-4">
                        {f.details.map((d, j) => (
                          <div key={j} className="flex items-start gap-2.5">
                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${c.text}`}
                              style={{ backgroundColor: 'currentColor', opacity: 0.6 }} />
                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{t(d)}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </Section>
     
      {/* ══════════════════════ LIVE DEMO ══════════════════════ */}
      <section id="demo" className="border-y border-slate-200/60 dark:border-white/[0.04] bg-slate-50/50 dark:bg-[#0a0b10]">
        <Section className="max-w-7xl mx-auto px-6 lg:px-10 py-28">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">

            {/* Info */}
            <motion.div variants={fadeUp} className="lg:col-span-4 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                <Terminal className="w-3.5 h-3.5" /> {t('Interactive Preview')}
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white leading-tight">
                {t('Try the simulator.')}
                <br />
                <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">{t('No account needed.')}</span>
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('Press play to compile firmware and watch the virtual MCU execute code line-by-line. The LED responds, the serial monitor updates — just like real hardware.')}
              </p>

              <VfButton
                variant={simRunning ? 'danger' : 'primary'}
                size="md"
                icon={simRunning ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                onClick={() => setSimRunning(!simRunning)}>
                {simRunning ? t('Stop') : t('Run Simulator')}
              </VfButton>
            </motion.div>

            {/* IDE Mockup */}
            <motion.div variants={fadeUp} custom={2} className="lg:col-span-8">
              <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c0d14] shadow-2xl shadow-black/5 dark:shadow-black/40 overflow-hidden">

                {/* Title bar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#0e0f16]">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                      <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                      <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-600 ml-3 font-mono">blink.ino</span>
                  </div>
                  <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded transition-colors ${simRunning ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-100 dark:bg-white/[0.04] text-slate-400'
                    }`}>
                    {simRunning ? t('● RUNNING') : t('○ IDLE')}
                  </span>
                </div>

                {/* Split editor */}
                <div className="grid grid-cols-1 md:grid-cols-12 min-h-[380px]">
                  {/* Code panel */}
                  <div className="md:col-span-6 border-r border-slate-200 dark:border-white/[0.06] bg-[#0d1117] p-0 overflow-hidden font-mono text-[11px] leading-[1.7]">
                    {[
                      { n: 1, code: <span className="text-slate-500">{'// VoltForge Blink Demo'}</span> },
                      { n: 2, code: <><span className="text-violet-400">#define</span> <span className="text-slate-200">LED_PIN</span> <span className="text-amber-300">13</span></> },
                      { n: 3, code: '' },
                      { n: 4, code: <><span className="text-violet-400">void</span> <span className="text-blue-400">setup</span><span className="text-slate-400">()</span> <span className="text-slate-400">{'{'}</span></> },
                      { n: 5, code: <>&nbsp;&nbsp;<span className="text-blue-400">pinMode</span><span className="text-slate-400">(</span><span className="text-slate-200">LED_PIN</span><span className="text-slate-400">,</span> <span className="text-amber-300">OUTPUT</span><span className="text-slate-400">);</span></> },
                      { n: 6, code: <>&nbsp;&nbsp;<span className="text-blue-400">Serial</span><span className="text-slate-400">.</span><span className="text-blue-400">begin</span><span className="text-slate-400">(</span><span className="text-amber-300">115200</span><span className="text-slate-400">);</span></> },
                      { n: 7, code: <span className="text-slate-400">{'}'}</span> },
                      { n: 8, code: '' },
                      { n: 9, code: <><span className="text-violet-400">void</span> <span className="text-blue-400">loop</span><span className="text-slate-400">()</span> <span className="text-slate-400">{'{'}</span></> },
                      { n: 10, code: <>&nbsp;&nbsp;<span className="text-blue-400">digitalWrite</span><span className="text-slate-400">(</span><span className="text-slate-200">LED_PIN</span><span className="text-slate-400">,</span> <span className="text-amber-300">HIGH</span><span className="text-slate-400">);</span></> },
                      { n: 11, code: <>&nbsp;&nbsp;<span className="text-blue-400">Serial</span><span className="text-slate-400">.</span><span className="text-blue-400">println</span><span className="text-slate-400">(</span><span className="text-emerald-400">"LED ON"</span><span className="text-slate-400">);</span></> },
                      { n: 12, code: <>&nbsp;&nbsp;<span className="text-blue-400">delay</span><span className="text-slate-400">(</span><span className="text-amber-300">1000</span><span className="text-slate-400">);</span></> },
                      { n: 13, code: <>&nbsp;&nbsp;<span className="text-blue-400">digitalWrite</span><span className="text-slate-400">(</span><span className="text-slate-200">LED_PIN</span><span className="text-slate-400">,</span> <span className="text-amber-300">LOW</span><span className="text-slate-400">);</span></> },
                      { n: 14, code: <>&nbsp;&nbsp;<span className="text-blue-400">Serial</span><span className="text-slate-400">.</span><span className="text-blue-400">println</span><span className="text-slate-400">(</span><span className="text-emerald-400">"LED OFF"</span><span className="text-slate-400">);</span></> },
                      { n: 15, code: <>&nbsp;&nbsp;<span className="text-blue-400">delay</span><span className="text-slate-400">(</span><span className="text-amber-300">1000</span><span className="text-slate-400">);</span></> },
                      { n: 16, code: <span className="text-slate-400">{'}'}</span> },
                    ].map(({ n, code }) => (
                      <div key={n} className={`flex items-center px-4 transition-colors duration-200 ${simStep === n
                        ? 'bg-emerald-500/[0.08] border-l-2 border-emerald-400'
                        : 'border-l-2 border-transparent'
                        }`}>
                        <span className="w-6 text-right text-slate-600 select-none text-[10px] mr-3 flex-shrink-0">{n}</span>
                        <span className="text-slate-300">{code}</span>
                      </div>
                    ))}
                  </div>

                  {/* Board + Serial panel */}
                  <div className="md:col-span-6 flex flex-col bg-slate-50 dark:bg-[#0a0b10]">
                    {/* Board visualization */}
                    <div className="flex-1 flex items-center justify-center p-6 relative">
                      <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_0.8px,transparent_0.8px)] dark:bg-[radial-gradient(#1e293b_0.8px,transparent_0.8px)] [background-size:14px_14px] opacity-40" />

                      <div className="relative z-10 flex flex-col items-center gap-4">
                        {/* MCU chip */}
                        <div className="w-40 h-20 bg-slate-800 dark:bg-[#111827] rounded-lg border border-slate-700 flex flex-col items-center justify-center shadow-lg relative">
                          <span className="text-[9px] font-bold text-slate-300 tracking-[0.2em] font-mono">ATmega328P</span>
                          <span className={`text-[8px] font-bold font-mono mt-0.5 transition-colors ${simRunning ? 'text-emerald-400' : 'text-slate-600'}`}>
                            {simRunning ? t('5V — ACTIVE') : t('STANDBY')}
                          </span>
                          <div className={`absolute top-2 right-2 w-2 h-2 rounded-full transition-all duration-300 ${simRunning ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]' : 'bg-slate-700'}`} />
                          <div className="absolute -left-1.5 top-3 space-y-1.5">
                            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-1.5 h-1 bg-slate-600 rounded-sm" />)}
                          </div>
                          <div className="absolute -right-1.5 top-3 space-y-1.5">
                            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-1.5 h-1 bg-slate-600 rounded-sm" />)}
                          </div>
                        </div>

                        <div className="w-px h-6 bg-slate-400 dark:bg-slate-700" />

                        {/* LED */}
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${ledOn
                            ? 'bg-amber-400/60 border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.5),0_0_40px_rgba(251,191,36,0.2)]'
                            : 'bg-slate-200/30 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700'
                            }`}>
                            <div className={`w-3 h-3 rounded-full transition-all ${ledOn ? 'bg-amber-300' : 'bg-slate-400 dark:bg-slate-600'}`} />
                          </div>
                          <span className="text-[8px] font-bold font-mono text-slate-500 dark:text-slate-600">PIN 13</span>
                        </div>
                      </div>
                    </div>

                    {/* Serial Monitor */}
                    <div className="h-28 border-t border-slate-200 dark:border-white/[0.06] bg-[#0d1117] p-3 font-mono text-[10px] overflow-y-auto flex flex-col justify-end">
                      <div className="text-[9px] font-bold text-slate-600 mb-1.5 uppercase tracking-wider">{t('Serial Monitor')}</div>
                      {serialLogs.length === 0 ? (
                        <span className="text-slate-600 italic text-[10px]">{t('Press "Run Simulator" to begin...')}</span>
                      ) : (
                        serialLogs.map((log, i) => (
                          <div key={i} className="text-emerald-400/80 leading-relaxed truncate">{log}</div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </Section>
      </section>
      <br />
      {/* ══════════════════════ CTA ══════════════════════ */}
      <Section className="max-w-3xl mx-auto px-6 lg:px-10 py-28">
        <motion.div variants={fadeUp}
          className="relative p-12 md:p-16 rounded-3xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 shadow-xl dark:shadow-[0_4px_30px_rgba(0,0,0,0.4)] text-center overflow-hidden">
          {/* Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-40 bg-emerald-500/[0.08] rounded-full blur-[80px] pointer-events-none" />

          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white relative z-10 mb-5">
            {t('Ready to build?')}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-10 relative z-10 leading-relaxed">
            {t('Jump into VoltForge and start designing circuits with simulation and real-time collaboration.')}
          </p>
          <div className="flex flex-wrap justify-center gap-4 relative z-10">
            {isAuthenticated ? (
              <VfButton variant="primary" size="lg" onClick={() => navigate('/dashboard')}>
                {t('Go to Workspace')}
              </VfButton>
            ) : (
              <>
                <VfButton variant="primary" size="lg" onClick={handleSignUp}>
                  {t('Create Free Account')}
                </VfButton>
                <VfButton variant="secondary" size="lg"
                  onClick={() => keycloak.login({ redirectUri: window.location.origin + '/dashboard' })}>
                  {t('Sign In')}
                </VfButton>
              </>
            )}
          </div>
        </motion.div>
      </Section>
      <br />
      {/* ══════════════════════ FOOTER ══════════════════════ */}
      <footer className="border-t border-slate-200/60 dark:border-white/[0.04] py-10 px-6 lg:px-10 bg-white/40 dark:bg-[#08090d]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="font-bold text-slate-700 dark:text-slate-300">VoltForge</span>
          </div>
          <p>© {new Date().getFullYear()} {t('VoltForge — Forge Your Ideas into Reality.')}</p>
          <div className="flex gap-5">
            <a href="#" className="hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors hover:underline">{t('Privacy')}</a>
            <a href="#" className="hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors hover:underline">{t('Terms')}</a>
            <a href="#" className="hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors hover:underline">{t('Docs')}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
