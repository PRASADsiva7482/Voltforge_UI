import { useState, useRef, useEffect } from 'react'
import { Bot, Code2, Send, Sparkles, User } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { aiApi } from '../../api/services'
import { Textarea } from '../../components/ui/Field'
import { SuggestionsList } from '../../components/ui/SuggestionsList'
import { CodeBlock } from '../../components/ui/CodeBlock'

interface Props {
  isOpen: boolean
  onApplyCode?: (code: string) => void
  onClose: () => void
  projectContext?: string
}

interface Message {
  content: string
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

  const chatMutation = useMutation({
    mutationFn: (message: string) =>
      aiApi.chat({
        message,
        context: projectContext,
        history: messages.slice(-10),
      }),
    onSuccess: (res) => {
      const data = res.data.data
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
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
            <span className="vf-ai-chat__brand-sub">Powered by Gemma</span>
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
