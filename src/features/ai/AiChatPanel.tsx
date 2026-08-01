import { useState, useRef, useEffect } from 'react'
import { Bot, Code2, Send, Sparkles, User } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import { aiApi } from '../../api/services'
import { buildCircuitNetlist } from '../canvas/netlist'
import { Textarea } from '../../components/ui/Field'
import { SuggestionsList } from '../../components/ui/SuggestionsList'
import { CodeBlock } from '../../components/ui/CodeBlock'
import type { AiCitation } from '../../types/domain'

interface Props {
  isOpen: boolean
  onApplyCode?: (code: string) => void
  onClose: () => void
  projectContext?: string
}

interface Message {
  citations?: AiCitation[]
  content: string
  confidence?: number
  role: 'user' | 'assistant'
}

export default function AiChatPanel({
  isOpen,
  onApplyCode,
  onClose,
  projectContext,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  
  const { nodes, wires, selectedNodeId, selectedWireId, viewport } = useCanvasStore()
  const { currentProject, activeCodeFile } = useProjectStore()

  const chatMutation = useMutation({
    mutationFn: (message: string) => {
      const netlist = buildCircuitNetlist(nodes, wires)
      const richContext = JSON.stringify({
        projectName: currentProject?.name || projectContext,
        boardType: currentProject?.boardType || 'ARDUINO_UNO',
        selectedNodeId,
        selectedWireId,
        viewport,
        activeFile: activeCodeFile
          ? {
              filename: activeCodeFile.filename,
              language: activeCodeFile.language,
            }
          : null,
        components: nodes.map((n) => ({
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
        })),
        wires: wires.map((w) => ({
          color: w.color,
          id: w.id,
          fromComponent: w.fromNodeId,
          fromPin: w.fromPinId,
          toComponent: w.toNodeId,
          toPin: w.toPinId,
        })),
        netlist: {
          nets: netlist.nodes.map((net) => ({
            id: net.id,
            pins: net.pins.map((pin) => `${pin.nodeId}/${pin.pinId}`),
          })),
        },
        code: activeCodeFile?.content || currentProject?.codeFiles?.[0]?.content || ""
      })
      
      return aiApi.chat({
        message,
        context: richContext,
        history: messages.slice(-10),
      })
    },
    onSuccess: (res) => {
      const data = res.data.data
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          confidence: data.confidence,
          citations: data.citations,
        },
      ])
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ])
    },
  })

  const handleSend = () => {
    const msg = input.trim()
    if (!msg || chatMutation.isPending) return
    setMessages((prev) => [...prev, { role: 'user', content: msg }])
    setInput('')
    chatMutation.mutate(msg)
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
  }, [messages, chatMutation.isPending])

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
      return <span key={i} className="vf-ai-chat__text-segment">{part}</span>
    })
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
              {renderMessageContent(msg.content)}
              {msg.role === 'assistant' && typeof msg.confidence === 'number' && (
                <div className="vf-ai-chat__meta">
                  Confidence {Math.round(msg.confidence * 100)}%
                </div>
              )}
              {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
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

        {chatMutation.isPending && (
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
            disabled={!input.trim() || chatMutation.isPending}
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
