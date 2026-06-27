import { motion } from 'framer-motion';

/* ─────────────────────────────────────────────────────────────────────────────
   Hero Illustration — Animated circuit board with flowing electricity
   ───────────────────────────────────────────────────────────────────────────── */
export function HeroIllustration() {
  return (
    <div className="relative w-full aspect-square max-w-[540px]">
      {/* Ambient glow layers */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-500/20 via-transparent to-cyan-500/15 blur-[80px] animate-pulse" style={{ animationDuration: '4s' }} />
      <div className="absolute top-1/4 right-1/4 w-48 h-48 rounded-full bg-amber-400/10 blur-[60px] animate-pulse" style={{ animationDuration: '6s' }} />

      <svg viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full relative z-10">
        <defs>
          <radialGradient id="hero-core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="70%" stopColor="#10b981" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="trace-signal" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
            <stop offset="40%" stopColor="#10b981" stopOpacity="1" />
            <stop offset="60%" stopColor="#34d399" stopOpacity="1" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="trace-amber" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0" />
            <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </linearGradient>
          <filter id="glow-sm">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-lg">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background dot grid */}
        <pattern id="dot-grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="0.8" fill="#94a3b8" opacity="0.15" />
        </pattern>
        <rect width="500" height="500" fill="url(#dot-grid)" rx="24" />

        {/* Core glow */}
        <circle cx="250" cy="250" r="150" fill="url(#hero-core-glow)" />

        {/* ── Circuit Traces (static backbone) ─────────── */}
        <g stroke="#334155" strokeWidth="1.5" strokeLinecap="round" opacity="0.5">
          <path d="M 80 130 L 170 130 L 190 150 L 190 210" />
          <path d="M 310 210 L 310 150 L 330 130 L 420 130" />
          <path d="M 80 370 L 170 370 L 190 350 L 190 290" />
          <path d="M 310 290 L 310 350 L 330 370 L 420 370" />
          <path d="M 140 250 L 190 250" />
          <path d="M 310 250 L 360 250" />
          <path d="M 250 140 L 250 190" />
          <path d="M 250 310 L 250 360" />
        </g>

        {/* ── Animated signal flows ─────────── */}
        <g fill="none" strokeWidth="2.5" strokeLinecap="round">
          <motion.path d="M 80 130 L 170 130 L 190 150 L 190 210" stroke="url(#trace-signal)"
            initial={{ pathLength: 0, pathOffset: 0 }}
            animate={{ pathLength: [0, 0.35, 0.35, 0], pathOffset: [0, 0.1, 0.65, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
          <motion.path d="M 310 290 L 310 350 L 330 370 L 420 370" stroke="url(#trace-signal)"
            initial={{ pathLength: 0, pathOffset: 0 }}
            animate={{ pathLength: [0, 0.35, 0.35, 0], pathOffset: [0, 0.1, 0.65, 1] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 1 }} />
          <motion.path d="M 250 140 L 250 190" stroke="url(#trace-amber)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 1, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }} />
          <motion.path d="M 250 310 L 250 360" stroke="url(#trace-amber)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 1, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1.5 }} />
        </g>

        {/* ── Central MCU Chip ─────────── */}
        <g transform="translate(190, 210)">
          <rect width="120" height="80" rx="10" fill="#0c0c18" stroke="#1e293b" strokeWidth="2" />
          <rect x="8" y="8" width="104" height="64" rx="6" fill="#111827" stroke="#1e293b" strokeWidth="1" />
          {/* Chip pins left */}
          {[18, 32, 46, 60].map((y, i) => (
            <rect key={`lp-${i}`} x="-6" y={y} width="8" height="4" rx="1" fill="#475569" />
          ))}
          {/* Chip pins right */}
          {[18, 32, 46, 60].map((y, i) => (
            <rect key={`rp-${i}`} x="118" y={y} width="8" height="4" rx="1" fill="#475569" />
          ))}
          {/* Chip label */}
          <text x="60" y="38" fill="#e2e8f0" fontSize="11" fontWeight="700" fontFamily="'JetBrains Mono', monospace" textAnchor="middle" letterSpacing="2">
            VOLTFORGE
          </text>
          <text x="60" y="54" fill="#10b981" fontSize="7" fontWeight="600" fontFamily="'JetBrains Mono', monospace" textAnchor="middle" className="animate-pulse" style={{ animationDuration: '2s' }}>
            MCU ACTIVE
          </text>
          {/* Power indicator LED */}
          <circle cx="18" cy="18" r="3" fill="#10b981" filter="url(#glow-sm)" />
          <circle cx="18" cy="18" r="2" fill="#34d399" />
        </g>

        {/* ── Corner nodes ─────────── */}
        {/* LED (top-left) */}
        <g transform="translate(60, 110)">
          <circle cx="20" cy="20" r="16" fill="#111827" stroke="#1e293b" strokeWidth="1.5" />
          <motion.circle cx="20" cy="20" r="7" fill="#ef4444" filter="url(#glow-sm)"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }} />
          <circle cx="20" cy="20" r="4" fill="#ef4444" />
          <text x="20" y="48" fill="#64748b" fontSize="7" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">LED</text>
        </g>

        {/* Sensor (top-right) */}
        <g transform="translate(400, 110)">
          <rect x="4" y="4" width="32" height="32" rx="6" fill="#111827" stroke="#1e293b" strokeWidth="1.5" />
          <motion.path d="M 12 28 L 16 28 L 16 14 L 22 14 L 22 28 L 28 28 L 28 14"
            stroke="#06b6d4" strokeWidth="1.5" fill="none"
            strokeDasharray="50"
            animate={{ strokeDashoffset: [100, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }} />
          <text x="20" y="48" fill="#64748b" fontSize="7" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">SENSOR</text>
        </g>

        {/* Motor (bottom-left) */}
        <g transform="translate(60, 350)">
          <circle cx="20" cy="20" r="16" fill="#111827" stroke="#1e293b" strokeWidth="1.5" />
          <motion.g animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} style={{ transformOrigin: '20px 20px' }}>
            <line x1="20" y1="8" x2="20" y2="32" stroke="#a78bfa" strokeWidth="1.5" />
            <line x1="8" y1="20" x2="32" y2="20" stroke="#a78bfa" strokeWidth="1.5" />
          </motion.g>
          <circle cx="20" cy="20" r="4" fill="#1e293b" stroke="#a78bfa" strokeWidth="1" />
          <text x="20" y="48" fill="#64748b" fontSize="7" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">MOTOR</text>
        </g>

        {/* PWR node (bottom-right) */}
        <g transform="translate(400, 350)">
          <circle cx="20" cy="20" r="16" fill="#111827" stroke="#f59e0b" strokeWidth="1.5" opacity="0.8" />
          {/* Lightning bolt */}
          <path d="M 22 12 L 17 20 L 21 20 L 18 28" stroke="#f59e0b" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x="20" y="48" fill="#64748b" fontSize="7" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">PWR</text>
        </g>

        {/* Junction dots */}
        {[[190, 250], [310, 250], [250, 190], [250, 310]].map(([cx, cy], i) => (
          <circle key={`jn-${i}`} cx={cx} cy={cy} r="3" fill="#10b981" opacity="0.6" />
        ))}

        {/* Subtle outer ring */}
        <motion.circle cx="250" cy="250" r="210" stroke="#1e293b" strokeWidth="1" strokeDasharray="8 12" fill="none"
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: '250px 250px' }} />
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Feature Icons — Small, crisp, purpose-built for each feature card
   ───────────────────────────────────────────────────────────────────────────── */



export function IconSimulator({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className}>
      <rect x="3" y="5" width="22" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <motion.path d="M 6 18 L 10 18 L 10 10 L 14 10 L 14 18 L 18 18 L 18 10 L 22 10"
        stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"
        strokeDasharray="40"
        animate={{ strokeDashoffset: [80, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }} />
    </svg>
  );
}

export function IconCanvas({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className}>
      <rect x="3" y="3" width="22" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10" y1="3" x2="10" y2="25" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
      <line x1="18" y1="3" x2="18" y2="25" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
      <line x1="3" y1="10" x2="25" y2="10" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
      <line x1="3" y1="18" x2="25" y2="18" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
      <rect x="11" y="11" width="6" height="6" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1" />
      <circle cx="14" cy="14" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconCollab({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className}>
      <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18" cy="10" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M 4 22 C 4 17 8 15 10 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M 24 22 C 24 17 20 15 18 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14" cy="20" r="3" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function IconCommunity({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className}>
      <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="1.5" />
      <path d="M 6 10 Q 14 4 22 10" stroke="currentColor" strokeWidth="1" opacity="0.4" fill="none" />
      <path d="M 6 18 Q 14 24 22 18" stroke="currentColor" strokeWidth="1" opacity="0.4" fill="none" />
      <line x1="14" y1="3" x2="14" y2="25" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <circle cx="14" cy="14" r="2" fill="currentColor" />
    </svg>
  );
}

export function IconCode({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className}>
      <path d="M 10 8 L 4 14 L 10 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 18 8 L 24 14 L 18 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="16" y1="6" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}
