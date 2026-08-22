import { useState, useRef, useEffect, useCallback } from 'react'
import { Bot, Brain, Code2, Plus, Send, Sparkles, Trash2, User, Wrench, Zap } from 'lucide-react'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import { useSimulationStore } from '../../store/simulationStore'
import { useToastStore } from '../../store/useToastStore'
import { aiApi } from '../../api/services'
import { buildCircuitNetlist } from '../canvas/netlist'
import { getPinsForComponent } from '../canvas/pinRegistry'
import { Textarea } from '../../components/ui/Field'
import { SuggestionsList } from '../../components/ui/SuggestionsList'
import { CodeBlock } from '../../components/ui/CodeBlock'
import type { AiAction, AiCitation, AiCodeFix, AiWireSuggestion, CanvasNode, Wire } from '../../types/domain'

interface Props {
  isOpen: boolean
  onApplyCode?: (code: string) => void
  onClose: () => void
  projectContext?: string
}

interface Message {
  additions?: AiAction[]
  citations?: AiCitation[]
  codeFixes?: AiCodeFix[]
  content: string
  confidence?: number
  isStreaming?: boolean
  removals?: AiAction[]
  role: 'user' | 'assistant'
  thought?: string
  valueChanges?: AiAction[]
  wireSuggestions?: AiWireSuggestion[]
}

function pinRef(ref?: string) {
  const [nodeId, pinId] = String(ref || '').split('/')
  return nodeId && pinId ? { nodeId, pinId } : null
}

function resistanceValue(value?: string) {
  const numeric = Number(String(value || '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 220
}

function parseActionValue(value: unknown) {
  if (typeof value === 'number' || typeof value === 'boolean') return value
  const text = String(value ?? '').trim()
  const numeric = Number(text.replace(/[^0-9.+-]/g, ''))
  return Number.isFinite(numeric) && /[0-9]/.test(text) ? numeric : text
}

function hasWire(wires: Wire[], fromNodeId: string, fromPinId: string, toNodeId: string, toPinId: string) {
  return wires.some((wire) =>
    (wire.fromNodeId === fromNodeId && wire.fromPinId === fromPinId && wire.toNodeId === toNodeId && wire.toPinId === toPinId) ||
    (wire.fromNodeId === toNodeId && wire.fromPinId === toPinId && wire.toNodeId === fromNodeId && wire.toPinId === fromPinId)
  )
}

function makeWire(suggestion: AiWireSuggestion): Wire {
  return {
    bendPoints: [],
    color: suggestion.color || '#3b82f6',
    fromNodeId: suggestion.fromComponentId,
    fromPinId: suggestion.fromPin,
    id: `ai_wire_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    routingMode: 'auto',
    toNodeId: suggestion.toComponentId,
    toPinId: suggestion.toPin,
  }
}

export default function AiChatPanel({
  isOpen,
  onApplyCode,
  onClose,
  projectContext,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  
  const { addNode, addWire, nodes, removeWire, selectedNodeId, selectedWireId, updateNode, viewport, wires } = useCanvasStore()
  const { currentProject, activeCodeFile, updateCodeFileContent } = useProjectStore()
  const addToast = useToastStore((s) => s.addToast)

  const buildPayload = useCallback(() => {
    const simState = useSimulationStore.getState()
    const netlist = buildCircuitNetlist(nodes, wires)
    const components = nodes.map((n) => ({
      height: n.height,
      id: n.id,
      name: n.name,
      pins: n.pins,
      properties: n.properties,
      rotation: n.rotation,
      type: n.type,
      width: n.width,
      x: n.x,
      y: n.y,
    }))
    const serializedWires = wires.map((w) => ({
      color: w.color,
      id: w.id,
      fromComponent: w.fromNodeId,
      fromPin: w.fromPinId,
      toComponent: w.toNodeId,
      toPin: w.toPinId,
    }))
    const netlistPayload = {
      components: netlist.components,
      nets: netlist.nodes.map((net) => ({
        id: net.id,
        pins: net.pins.map((pin) => `${pin.nodeId}/${pin.pinId}`),
      })),
      pinToNet: netlist.pinToNet,
    }
    const code = activeCodeFile?.content || currentProject?.codeFiles?.[0]?.content || ''
    const simulationState = {
      isSimulating: simState.isSimulating,
      solverConverged: simState.solverConverged,
      pinStates: simState.debugSnapshot.pins,
      debugSnapshot: simState.debugSnapshot,
      nodeVoltages: simState.nodeVoltages,
      branchCurrents: simState.branchCurrents,
      componentPower: simState.componentPower,
      oscilloscope: Object.fromEntries(
        Object.entries(simState.oscilloscopeData).map(([nodeId, samples]) => [
          nodeId,
          { latest: samples[samples.length - 1] ?? null, samples: samples.slice(-32) },
        ])
      ),
      serialBuffer: simState.serialLogs.slice(-10),
    }
    const richContext = JSON.stringify({
      projectName: currentProject?.name || projectContext,
      boardType: currentProject?.boardType || 'ARDUINO_UNO',
      selectedNodeId,
      selectedWireId,
      viewport,
      activeFile: activeCodeFile
        ? { filename: activeCodeFile.filename, language: activeCodeFile.language }
        : null,
      components,
      wires: serializedWires,
      netlist: netlistPayload,
      code,
      simulationState,
    })
    return {
      boardType: currentProject?.boardType || 'ARDUINO_UNO',
      components,
      wires: serializedWires,
      netlist: netlistPayload,
      code,
      canvasData: { components, wires: serializedWires, netlist: netlistPayload },
      simulationState,
      context: richContext,
      history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    }
  }, [nodes, wires, activeCodeFile, currentProject, projectContext, selectedNodeId, selectedWireId, viewport, messages])

  const handleSendStream = useCallback(async (userMessage: string) => {
    const payload = buildPayload()

    // Add user message and empty assistant placeholder
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: '', thought: '', isStreaming: true },
    ])
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await aiApi.chatStream({
        message: userMessage,
        ...payload,
      })

      if (!response.body) {
        throw new Error('No response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEventType = ''

      while (true) {

        const { done, value } = await reader.read()
        if (done) break
        if (controller.signal.aborted) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Retain only incomplete trailing chunk

        for (const line of lines) {
          let trimmed = line.trim()
          if (!trimmed) continue

          if (trimmed.startsWith('event:')) {
            currentEventType = trimmed.replace(/^event:\s*/, '').trim()
            continue
          }

          if (trimmed.startsWith('data:')) {
            trimmed = trimmed.replace(/^data:\s*/, '').trim()
          }

          if (trimmed === '[DONE]') {
            setIsStreaming(false)
            continue
          }

          try {
            const event = JSON.parse(trimmed)
            const eventType = currentEventType || event.type || ''

            if (eventType === 'thought') {
              const thoughtText = event.step || event.content || ''
              if (thoughtText) {
                setMessages((prev) => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last?.role === 'assistant') {
                    const existingThought = last.thought || ''
                    if (!existingThought.includes(thoughtText)) {
                      updated[updated.length - 1] = {
                        ...last,
                        thought: existingThought + thoughtText + '\n',
                      }
                    }
                  }
                  return updated
                })
              }
            } else if (eventType === 'token') {
              const tokenText = event.token || event.content || ''
              if (tokenText) {
                setMessages((prev) => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last?.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...last,
                      content: (last.content || '') + tokenText,
                    }
                  }
                  return updated
                })
              }
            } else if (eventType === 'metadata' || eventType === 'done' || event.reply) {
              setIsStreaming(false)
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    isStreaming: false,
                    content: event.reply || last.content || (event.error ? `Error: ${event.error}` : last.content),
                    confidence: typeof event.confidence === 'number' ? event.confidence : last.confidence,
                    citations: event.citations || last.citations,
                    wireSuggestions: event.wireSuggestions || last.wireSuggestions,
                    additions: event.additions || last.additions,
                    removals: event.removals || last.removals,
                    valueChanges: event.valueChanges || last.valueChanges,
                    codeFixes: event.codeFixes || last.codeFixes,
                  }
                }
                return updated
              })
            }
          } catch {
            // Non-JSON line or partial chunk — ignore
          }
        }
      }


    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('Stream error:', err)
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.role === 'assistant' && last.isStreaming) {
            updated[updated.length - 1] = {
              ...last,
              content: last.content || 'Sorry, I encountered an error. Please try again.',
              isStreaming: false,
            }
          }
          return updated
        })
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
      // Mark streaming as complete for any remaining messages
      setMessages((prev) =>
        prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
      )
    }
  }, [buildPayload])

  const handleSend = () => {
    const msg = input.trim()
    if (!msg || isStreaming) return
    setInput('')
    handleSendStream(msg)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isStreaming])

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const applyWireSuggestion = (suggestion: AiWireSuggestion) => {
    if (hasWire(wires, suggestion.fromComponentId, suggestion.fromPin, suggestion.toComponentId, suggestion.toPin)) {
      addToast('Wire already exists.', 'info')
      return
    }
    addWire(makeWire(suggestion))
    addToast('AI wire suggestion applied.', 'success')
  }

  const applyRemoval = (action: AiAction) => {
    if (!action.wireId) {
      addToast('This removal does not reference a specific wire.', 'error')
      return
    }
    removeWire(action.wireId)
    addToast('AI removal applied.', 'success')
  }

  const applyAddition = (action: AiAction) => {
    const componentType = String(action.componentType || '').toUpperCase()
    if (!['RESISTOR', 'DIODE'].includes(componentType) || !action.between || action.between.length < 2) {
      addToast('This addition can be reviewed manually.', 'info')
      return
    }
    const first = pinRef(action.between[0])
    const second = pinRef(action.between[1])
    if (!first || !second) {
      addToast('AI addition has incomplete pin references.', 'error')
      return
    }

    const firstNode = nodes.find((node) => node.id === first.nodeId)
    const secondNode = nodes.find((node) => node.id === second.nodeId)
    const x = firstNode && secondNode ? (firstNode.x + secondNode.x) / 2 : 220
    const y = firstNode && secondNode ? (firstNode.y + secondNode.y) / 2 : 220
    const componentId = `ai_${componentType.toLowerCase()}_${Date.now()}`
    const isResistor = componentType === 'RESISTOR'
    const component: CanvasNode = {
      componentId,
      height: isResistor ? 24 : 28,
      id: componentId,
      name: isResistor ? `${resistanceValue(action.value)} Ohm Resistor` : 'Flyback Diode',
      pins: getPinsForComponent(componentType, undefined, isResistor ? 90 : 72, isResistor ? 24 : 28),
      properties: isResistor
        ? { resistance: resistanceValue(action.value), power: '0.25W' }
        : { partNumber: action.value || '1N4007' },
      rotation: 0,
      type: componentType,
      width: isResistor ? 90 : 72,
      x,
      y,
    }
    addNode(component)
    addWire({
      bendPoints: [],
      color: isResistor ? '#f59e0b' : '#6366f1',
      fromNodeId: first.nodeId,
      fromPinId: first.pinId,
      id: `ai_wire_${Date.now()}_a`,
      routingMode: 'auto',
      toNodeId: componentId,
      toPinId: isResistor ? 'p1' : 'anode',
    })
    addWire({
      bendPoints: [],
      color: isResistor ? '#f59e0b' : '#6366f1',
      fromNodeId: componentId,
      fromPinId: isResistor ? 'p2' : 'cathode',
      id: `ai_wire_${Date.now()}_b`,
      routingMode: 'auto',
      toNodeId: second.nodeId,
      toPinId: second.pinId,
    })
    addToast(`AI ${isResistor ? 'resistor' : 'diode'} addition applied.`, 'success')
  }

  const applyValueChange = (action: AiAction) => {
    if (!action.componentId || !action.property) {
      addToast('This value change is missing a target property.', 'error')
      return
    }
    const node = nodes.find((item) => item.id === action.componentId)
    if (!node) {
      addToast('Could not find the target component.', 'error')
      return
    }
    const nextValue = parseActionValue(action.newValue ?? action.value)
    updateNode(action.componentId, {
      properties: {
        ...node.properties,
        [action.property]: nextValue,
      },
    })
    addToast('AI value change applied.', 'success')
  }

  const applyCodeFix = (fix: AiCodeFix) => {
    if (!activeCodeFile) {
      addToast('No active code file selected.', 'error')
      return
    }
    if (fix.type !== 'replace' || !fix.from || !fix.to) {
      addToast('This code fix can be reviewed manually.', 'info')
      return
    }
    const next = activeCodeFile.content.replace(fix.from, fix.to)
    if (next === activeCodeFile.content) {
      addToast('Could not find the target code text.', 'error')
      return
    }
    updateCodeFileContent(activeCodeFile.id, next)
    addToast('AI code fix applied.', 'success')
  }

  // Inline Markdown parser (bold, italic, code, links)
  const renderInline = (text: string): React.ReactNode[] => {
    if (!text) return []
    const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g)
    return tokens.map((token, idx) => {
      if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
        return <code key={idx} className="vf-ai-inline-code">{token.slice(1, -1)}</code>
      }
      if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
        return <strong key={idx} className="vf-ai-bold">{token.slice(2, -2)}</strong>
      }
      if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
        return <em key={idx} className="vf-ai-italic">{token.slice(1, -1)}</em>
      }
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (linkMatch) {
        return (
          <a key={idx} href={linkMatch[2]} target="_blank" rel="noreferrer" className="vf-ai-link">
            {linkMatch[1]}
          </a>
        )
      }
      return token
    })
  }

  // Block-level Markdown parser (headers, bullet lists, numbered lists, tables, paragraphs)
  const renderMarkdownBlock = (blockText: string, blockKey: string | number) => {
    const lines = blockText.split('\n')
    const elements: React.ReactNode[] = []
    let i = 0

    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      if (!trimmed) {
        i++
        continue
      }

      // 1. Table Detection
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && lines[i + 1]?.trim().startsWith('|')) {
        const tableLines: string[] = []
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          tableLines.push(lines[i].trim())
          i++
        }
        if (tableLines.length >= 2) {
          const headerCells = tableLines[0].split('|').slice(1, -1).map(c => c.trim())
          const rowLines = tableLines.slice(tableLines[1]?.includes('---') ? 2 : 1)
          elements.push(
            <div key={`tbl-${blockKey}-${i}`} className="vf-ai-table-wrap">
              <table className="vf-ai-table">
                <thead>
                  <tr>
                    {headerCells.map((h, hi) => (
                      <th key={hi}>{renderInline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowLines.map((row, ri) => {
                    const cells = row.split('|').slice(1, -1).map(c => c.trim())
                    return (
                      <tr key={ri}>
                        {cells.map((cell, ci) => (
                          <td key={ci}>{renderInline(cell)}</td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
          continue
        }
      }

      // 2. Headers
      const headerMatch = trimmed.match(/^(#{1,4})\s+(.*)$/)
      if (headerMatch) {
        const level = headerMatch[1].length
        const text = headerMatch[2]
        elements.push(
          <div key={`h-${blockKey}-${i}`} className={`vf-ai-h vf-ai-h${level}`}>
            {renderInline(text)}
          </div>
        )
        i++
        continue
      }

      // 3. Unordered Lists (- or * or •)
      if (/^[-*•]\s+/.test(trimmed)) {
        const listItems: string[] = []
        while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
          listItems.push(lines[i].trim().replace(/^[-*•]\s+/, ''))
          i++
        }
        elements.push(
          <ul key={`ul-${blockKey}-${i}`} className="vf-ai-ul">
            {listItems.map((item, liIdx) => (
              <li key={liIdx} className="vf-ai-li">
                {renderInline(item)}
              </li>
            ))}
          </ul>
        )
        continue
      }

      // 4. Ordered Lists (1. 2. etc)
      if (/^\d+\.\s+/.test(trimmed)) {
        const listItems: string[] = []
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          listItems.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
          i++
        }
        elements.push(
          <ol key={`ol-${blockKey}-${i}`} className="vf-ai-ol">
            {listItems.map((item, liIdx) => (
              <li key={liIdx} className="vf-ai-li">
                {renderInline(item)}
              </li>
            ))}
          </ol>
        )
        continue
      }

      // 5. Standard Paragraph
      elements.push(
        <p key={`p-${blockKey}-${i}`} className="vf-ai-p">
          {renderInline(trimmed)}
        </p>
      )
      i++
    }

    return elements
  }

  // Extract code blocks from message and render
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g)
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const codeMatch = part.match(/```(?:\w+)?\s*\n?([\s\S]*?)```/)
        const code = codeMatch ? codeMatch[1].trim() : part.replace(/```/g, '').trim()
        return (
          <div key={i} className="vf-ai-chat__code-wrap">
            <CodeBlock code={code} language="cpp" />
            {onApplyCode && (
              <button
                onClick={() => onApplyCode(code)}
                className="vf-ai-chat__apply-btn"
                type="button"
              >
                <Code2 size={12} />
                <span>Apply to Editor</span>
              </button>
            )}
          </div>
        )
      }
      return (
        <div key={i} className="vf-ai-chat__markdown-block">
          {renderMarkdownBlock(part, i)}
        </div>
      )
    })
  }


  const renderMessageActions = (msg: Message) => {
    if (msg.role !== 'assistant' || msg.isStreaming) return null
    const hasActions = Boolean(
      msg.wireSuggestions?.length ||
      msg.additions?.length ||
      msg.valueChanges?.length ||
      msg.removals?.length ||
      msg.codeFixes?.length
    )
    if (!hasActions) return null

    return (
      <div className="vf-ai-chat__actions">
        {msg.wireSuggestions?.slice(0, 6).map((suggestion, i) => (
          <div key={`wire-${i}`} className="vf-ai-action">
            <span>{suggestion.description || `${suggestion.fromComponentId}/${suggestion.fromPin} -> ${suggestion.toComponentId}/${suggestion.toPin}`}</span>
            <button className="vf-ai-chat__apply-btn" type="button" onClick={() => applyWireSuggestion(suggestion)}>
              <Zap size={12} />
              <span>Apply Wire</span>
            </button>
          </div>
        ))}

        {msg.additions?.slice(0, 4).map((action, i) => (
          <div key={`add-${i}`} className="vf-ai-action">
            <span>{action.reason || `${action.componentType || action.type} ${action.value ? `(${action.value})` : ''}`}</span>
            <button className="vf-ai-chat__apply-btn" type="button" onClick={() => applyAddition(action)}>
              <Plus size={12} />
              <span>Add</span>
            </button>
          </div>
        ))}

        {msg.valueChanges?.slice(0, 4).map((action, i) => (
          <div key={`value-${i}`} className="vf-ai-action">
            <span>{action.reason || `${action.componentId}.${action.property} -> ${String(action.newValue ?? action.value ?? '')}`}</span>
            <button className="vf-ai-chat__apply-btn" type="button" onClick={() => applyValueChange(action)}>
              <Wrench size={12} />
              <span>Change</span>
            </button>
          </div>
        ))}

        {msg.removals?.slice(0, 4).map((action, i) => (
          <div key={`remove-${i}`} className="vf-ai-action">
            <span>{action.reason || action.between?.join(' -> ') || 'Remove unsafe item'}</span>
            <button className="vf-ai-chat__apply-btn" type="button" onClick={() => applyRemoval(action)}>
              <Trash2 size={12} />
              <span>Remove</span>
            </button>
          </div>
        ))}

        {msg.codeFixes?.slice(0, 4).map((fix, i) => (
          <div key={`code-${i}`} className="vf-ai-action">
            <span>{fix.description || `${fix.from} -> ${fix.to}`}</span>
            <button className="vf-ai-chat__apply-btn" type="button" onClick={() => applyCodeFix(fix)}>
              <Code2 size={12} />
              <span>Apply Code</span>
            </button>
          </div>
        ))}
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <div className="vf-ai-chat">
      {/* Header */}
      <header className="vf-ai-chat__header">
        <div className="vf-ai-chat__brand">
          <div className="vf-ai-chat__brand-icon">
            <Sparkles size={14} />
          </div>
          <div>
            <h3 className="vf-ai-chat__brand-name">VoltForge AI</h3>
            <span className="vf-ai-chat__brand-sub">Project-aware local AI</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="vf-ai-chat__close"
          type="button"
          aria-label="Close assistant"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="vf-ai-chat__messages">
        {messages.length === 0 && (
          <div className="vf-ai-chat__welcome">
            <div className="vf-ai-chat__welcome-icon">
              <Bot size={28} />
            </div>
            <h3>VoltForge AI Assistant</h3>
            <p>Ask me about circuits, components, Arduino code, or debugging</p>
            <SuggestionsList
              suggestions={[
                'How do I connect an LED to Arduino?',
                'Generate code for a temperature sensor',
                'What resistor do I need for a 5V LED?',
              ]}
              onSelect={(suggestion) => setInput(suggestion)}
            />
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`vf-ai-chat__msg ${
              msg.role === 'user' ? 'vf-ai-chat__msg--user' : 'vf-ai-chat__msg--assistant'
            }`}
          >
            <div className="vf-ai-chat__msg-avatar">
              {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
            </div>
            <div className="vf-ai-chat__msg-body">
              {/* Thinking box */}
              {msg.role === 'assistant' && msg.thought && (
                <details className="vf-ai-chat__thinking" open={msg.isStreaming && !msg.content}>
                  <summary className="vf-ai-chat__thinking-summary">
                    <Brain size={12} />
                    <span>{msg.isStreaming && !msg.content ? 'Thinking...' : 'Thought process'}</span>
                  </summary>
                  <div className="vf-ai-chat__thinking-content">
                    {msg.thought.split('\n').filter(Boolean).map((step, si) => (
                      <div key={si} className="vf-ai-chat__thinking-step">{step}</div>
                    ))}
                  </div>
                </details>
              )}

              {/* Main response content */}
              {msg.content && renderMessageContent(msg.content)}
              {msg.isStreaming && <span className="vf-ai-chat__cursor">|</span>}

              {/* Action buttons */}
              {renderMessageActions(msg)}

              {/* Confidence badge */}
              {msg.role === 'assistant' && !msg.isStreaming && typeof msg.confidence === 'number' && (
                <div className="vf-ai-chat__meta">
                  Confidence {Math.round(msg.confidence * 100)}%
                </div>
              )}

              {/* Citation links */}
              {msg.role === 'assistant' && !msg.isStreaming && msg.citations && msg.citations.length > 0 && (
                <div className="vf-ai-chat__citations">
                  {msg.citations.slice(0, 2).map((citation, citationIndex) => (
                    <a
                      key={`${citation.url || citation.title}-${citationIndex}`}
                      href={citation.url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="vf-ai-chat__citation"
                    >
                      {citation.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isStreaming && messages.length > 0 && !messages[messages.length - 1]?.thought && !messages[messages.length - 1]?.content && (
          <div className="vf-ai-chat__msg vf-ai-chat__msg--assistant">
            <div className="vf-ai-chat__msg-avatar">
              <Bot size={12} />
            </div>
            <div className="vf-ai-chat__msg-body">
              <div className="vf-ai-chat__typing">
                <span className="vf-ai-chat__typing-dot" />
                <span className="vf-ai-chat__typing-dot" />
                <span className="vf-ai-chat__typing-dot" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="vf-ai-chat__input-area">
        <div className="vf-ai-chat__input-row">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask VoltForge AI..."
            rows={1}
            className="vf-ai-chat__textarea"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="vf-ai-chat__send"
            type="button"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
export { AiChatPanel }
