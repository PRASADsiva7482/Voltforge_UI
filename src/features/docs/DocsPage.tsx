import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  CircuitBoard,
  Code2,
  Cpu,
  FileOutput,
  FlaskConical,
  Gauge,
  Play,
  Radio,
  Sparkles,
} from 'lucide-react'
import { Topbar } from '../../components/layout'
import { Badge, Button } from '../../components/ui'
import './DocsPage.css'

export function DocsPage() {
  const { t } = useTranslation()

  return (
    <>
      <Topbar eyebrow={t("Documentation")} title={t("Engineering & Platform Reference")} />

      <div className="vf-docs-page">
        {/* Hero Banner */}
        <section className="vf-docs-hero">
          <div className="vf-docs-hero__badge">
            <Sparkles size={13} />
            <span>{t("VoltForge Technical Manual")}</span>
          </div>
          <h1>{t("Architecture, Simulation, and Hardware Export Reference")}</h1>
          <p>
            {t(
              "Comprehensive engineering documentation for circuit design, AVR and multi-architecture firmware emulation, transient circuit analysis, bill of materials export, and IoT telemetry."
            )}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <Link to="/editor/share" style={{ textDecoration: 'none' }}>
              <Button icon={<Play size={15} />} variant="primary">
                {t("Launch Simulator Sandbox")}
              </Button>
            </Link>
            <Link to="/labs" style={{ textDecoration: 'none' }}>
              <Button icon={<FlaskConical size={15} />} variant="secondary">
                {t("Explore Challenge Labs")}
              </Button>
            </Link>
          </div>
        </section>

        <div className="vf-docs-layout">
          {/* Table of Contents Sticky Sidebar */}
          <nav className="vf-docs-toc" aria-label={t("Documentation Contents")}>
            <span className="vf-docs-toc__title">{t("Quick Navigation")}</span>
            <a href="#export">
              <FileOutput size={14} />
              <span>{t("BOM & Netlist Export")}</span>
            </a>
            <a href="#simulation">
              <Gauge size={14} />
              <span>{t("Simulation Engine")}</span>
            </a>
            <a href="#firmware">
              <Code2 size={14} />
              <span>{t("Firmware Studio")}</span>
            </a>
            <a href="#instrumentation">
              <Radio size={14} />
              <span>{t("Instruments & IoT")}</span>
            </a>
            <a href="#labs">
              <FlaskConical size={14} />
              <span>{t("Challenge Labs")}</span>
            </a>
          </nav>

          {/* Main Content Area */}
          <div className="vf-docs-content">
            {/* Section 1: BOM & Netlist Export */}
            <article className="vf-docs-section" id="export">
              <div className="vf-docs-section__header">
                <div className="vf-docs-section__icon">
                  <FileOutput size={20} />
                </div>
                <div>
                  <h2>{t("Bill of Materials (BOM) & Netlist Export")}</h2>
                  <Badge tone="info">{t("Production Ready")}</Badge>
                </div>
              </div>
              <p>
                {t(
                  "VoltForge automatically compiles your schematic design into standard production artifacts suitable for PCB fabrication, KiCad routing, and component procurement."
                )}
              </p>

              <div className="vf-docs-card-grid">
                <div className="vf-docs-card">
                  <h3>{t("Bill of Materials (BOM)")}</h3>
                  <p>
                    {t(
                      "Generates consolidated parts lists in CSV and JSON formats including component designators, package types, quantities, tolerances, and manufacturer part numbers."
                    )}
                  </p>
                </div>
                <div className="vf-docs-card">
                  <h3>{t("Netlist Generator")}</h3>
                  <p>
                    {t(
                      "Produces standardized SPICE and KiCad netlists representing point-to-point electrical nodes, pin matrices, and branch connections."
                    )}
                  </p>
                </div>
                <div className="vf-docs-card">
                  <h3>{t("PCB Fabrication Packages")}</h3>
                  <p>
                    {t(
                      "Integrated PCB quoting payload with layer stackup parameters, surface finish options (HASL/ENIG), and solder mask customization."
                    )}
                  </p>
                </div>
              </div>

              <div className="vf-docs-code">
                {`// Sample Exported SPICE Netlist
* VoltForge Generated Netlist
V1 N_VCC GND DC 5.0
R1 N_VCC N_LED1 220
D1 N_LED1 GND LED_RED
* Microcontroller GPIO Pin Connections
U1_D13 N_LED1
.END`}
              </div>
            </article>

            {/* Section 2: Circuit Simulation Engine */}
            <article className="vf-docs-section" id="simulation">
              <div className="vf-docs-section__header">
                <div className="vf-docs-section__icon">
                  <Gauge size={20} />
                </div>
                <div>
                  <h2>{t("Cycle-Accurate Simulation & MNA Solver")}</h2>
                  <Badge tone="success">{t("AVR8js + MNA")}</Badge>
                </div>
              </div>
              <p>
                {t(
                  "VoltForge pairs cycle-accurate AVR8js hardware emulation (16MHz instruction timing) with a Modified Nodal Analysis (MNA) electrical solver for analog and digital transient fidelity."
                )}
              </p>

              <div className="vf-docs-card-grid">
                <div className="vf-docs-card">
                  <h3>{t("AVR Hardware Emulation")}</h3>
                  <p>
                    {t(
                      "Full 8-bit ATmega328P and ATmega2560 cycle emulation including timers, PWM generation, interrupts, ADC converters, and hardware UART registers."
                    )}
                  </p>
                </div>
                <div className="vf-docs-card">
                  <h3>{t("Analog Transient Solver")}</h3>
                  <p>
                    {t(
                      "MNA solver computes node voltages and branch currents at microsecond timesteps with nonlinear diode models and capacitor/inductor energy storage."
                    )}
                  </p>
                </div>
                <div className="vf-docs-card">
                  <h3>{t("Source Compatibility Mode")}</h3>
                  <p>
                    {t(
                      "ARM, ESP32, and RP2040 microcontrollers execute in behavioral source compatibility mode with hardware pin mapping and simulated I/O states."
                    )}
                  </p>
                </div>
              </div>
            </article>

            {/* Section 3: In-Browser Firmware Studio */}
            <article className="vf-docs-section" id="firmware">
              <div className="vf-docs-section__header">
                <div className="vf-docs-section__icon">
                  <Code2 size={20} />
                </div>
                <div>
                  <h2>{t("In-Browser Firmware Studio & Toolchain")}</h2>
                  <Badge tone="info">{t("C++ & Arduino")}</Badge>
                </div>
              </div>
              <p>
                {t(
                  "Write Arduino and C++ sketch code with full language support powered by Monaco Editor, server-side compilation, and real-time serial debug diagnostics."
                )}
              </p>

              <div className="vf-docs-card-grid">
                <div className="vf-docs-card">
                  <h3>{t("Integrated Code Editor")}</h3>
                  <p>
                    {t(
                      "Monaco-backed code workspace with C++ syntax highlighting, auto-formatting, bracket matching, and error marker gutters."
                    )}
                  </p>
                </div>
                <div className="vf-docs-card">
                  <h3>{t("Serial Monitor & Plotter")}</h3>
                  <p>
                    {t(
                      "Bi-directional UART communication supporting 9600 to 115200 baud, ANSI color formatting, and multi-channel real-time waveform plotting."
                    )}
                  </p>
                </div>
                <div className="vf-docs-card">
                  <h3>{t("Multi-File Support")}</h3>
                  <p>
                    {t(
                      "Organize projects into multiple headers (.h) and implementation files (.cpp) with automated compile manifest resolution."
                    )}
                  </p>
                </div>
              </div>
            </article>

            {/* Section 4: Virtual Instrumentation & IoT */}
            <article className="vf-docs-section" id="instrumentation">
              <div className="vf-docs-section__header">
                <div className="vf-docs-section__icon">
                  <Radio size={20} />
                </div>
                <div>
                  <h2>{t("Virtual Instrumentation & IoT Telemetry")}</h2>
                  <Badge tone="warning">{t("Scope + DMM + MQTT")}</Badge>
                </div>
              </div>
              <p>
                {t(
                  "Measure voltages, currents, and signal frequencies with lab-grade virtual instruments, and stream telemetry over MQTT WebSocket connections."
                )}
              </p>

              <div className="vf-docs-card-grid">
                <div className="vf-docs-card">
                  <h3>{t("Dual-Channel Oscilloscope")}</h3>
                  <p>
                    {t(
                      "Timebase from 100μs to 1s/div, edge triggers (rising/falling), channel attenuation (1X/10X), and automated frequency/Vpp calculations."
                    )}
                  </p>
                </div>
                <div className="vf-docs-card">
                  <h3>{t("Digital Multimeter (DMM)")}</h3>
                  <p>
                    {t(
                      "True RMS DC/AC voltage, DC current, resistance, continuity beeper, and circuit power safety validation."
                    )}
                  </p>
                </div>
                <div className="vf-docs-card">
                  <h3>{t("MQTT Bridge")}</h3>
                  <p>
                    {t(
                      "In-browser virtual loopback broker and real WebSocket client supporting ws:// and wss:// brokers with automatic timeout fallback."
                    )}
                  </p>
                </div>
              </div>
            </article>

            {/* Section 5: Challenge Labs */}
            <article className="vf-docs-section" id="labs">
              <div className="vf-docs-section__header">
                <div className="vf-docs-section__icon">
                  <FlaskConical size={20} />
                </div>
                <div>
                  <h2>{t("Hardware Engineering Challenge Labs")}</h2>
                  <Badge tone="success">{t("Interactive Learning")}</Badge>
                </div>
              </div>
              <p>
                {t(
                  "Learn practical electronics through interactive problem-solving labs featuring automated criterion checkers and progressive hint revelations."
                )}
              </p>
              <div>
                <Link to="/labs" style={{ textDecoration: 'none' }}>
                  <Button icon={<ArrowRight size={15} />} variant="primary">
                    {t("Browse Available Lab Challenges")}
                  </Button>
                </Link>
              </div>
            </article>
          </div>
        </div>
      </div>
    </>
  )
}

export default DocsPage
