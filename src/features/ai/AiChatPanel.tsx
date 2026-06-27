import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, User, Sparkles, Copy, Check, Code2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { aiApi } from '../../api/services';
import type { AiChatMessage } from '../../types';
import VfTextarea from '../../components/ui/VfTextarea';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApplyCode?: (code: string) => void;
  projectContext?: string;
}

export default function AiChatPanel({ isOpen, onClose, onApplyCode, projectContext }: Props) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatMutation = useMutation({
    mutationFn: (message: string) => aiApi.chat({
      message,
      context: projectContext,
      history: messages.slice(-10),
    }),
    onSuccess: (res) => {
      const data = res.data.data;
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    },
    onError: () => {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    },
  });

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || chatMutation.isPending) return;
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setInput('');
    chatMutation.mutate(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatMutation.isPending]);

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  // Extract code blocks from message
  const renderMessage = (content: string, msgIdx: number) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const codeMatch = part.match(/```(?:\w+)?\s*\n?([\s\S]*?)```/);
        const code = codeMatch ? codeMatch[1].trim() : part.replace(/```/g, '').trim();
        return (
          <div key={i} className="my-2 rounded-lg bg-surface-50 border border-surface-200 overflow-hidden dark:bg-surface-900 dark:border-white/5">
            <div className="flex items-center justify-between px-3 py-1.5 bg-white border-b border-surface-200 dark:bg-surface-800/80 dark:border-white/5">
              <span className="text-[10px] text-surface-500 uppercase font-mono dark:text-surface-400">Code</span>
              <div className="flex items-center gap-1">
                {onApplyCode && (
                  <button
                    onClick={() => onApplyCode(code)}
                    className="flex items-center gap-1 text-[10px] text-volt-600 hover:text-volt-500 px-2 py-0.5 rounded dark:text-volt-400 dark:hover:text-volt-300"
                  >
                    <Code2 className="w-3 h-3" /> Apply
                  </button>
                )}
                <button
                  onClick={() => copyToClipboard(code, msgIdx * 100 + i)}
                  className="flex items-center gap-1 text-[10px] text-surface-500 hover:text-surface-950 px-2 py-0.5 rounded dark:text-surface-400 dark:hover:text-white"
                >
                  {copiedIdx === msgIdx * 100 + i ? <Check className="w-3 h-3 text-volt-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
            <pre className="p-3 text-xs text-emerald-700 font-mono overflow-x-auto whitespace-pre-wrap dark:text-green-400">{code}</pre>
          </div>
        );
      }
      return <span key={i} className="whitespace-pre-wrap">{part}</span>;
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="absolute top-0 right-0 bottom-0 w-[380px] glass border-l border-surface-200 z-30 flex flex-col dark:border-white/10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200/70 bg-surface-50/70 dark:border-white/5 dark:bg-surface-900/50">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-950 dark:text-white">VoltForge AI</h3>
                <p className="text-[10px] text-surface-500 dark:text-surface-400">Powered by Gemma</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-950 transition-colors dark:text-surface-400 dark:hover:bg-white/5 dark:hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-4">
                  <Bot className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-sm font-semibold text-surface-950 mb-2 dark:text-white">VoltForge AI Assistant</h3>
                <p className="text-xs text-surface-600 mb-6 dark:text-surface-400">Ask me about circuits, components, Arduino code, or debugging</p>
                <div className="space-y-2 w-full">
                  {[
                    'How do I connect an LED to Arduino?',
                    'Generate code for a temperature sensor',
                    'What resistor do I need for a 5V LED?',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => { setInput(suggestion); }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-white border border-surface-200 text-xs text-surface-700 hover:bg-surface-50 hover:text-surface-950 transition-colors dark:bg-white/[0.03] dark:border-white/5 dark:text-surface-300 dark:hover:bg-white/5 dark:hover:text-white"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user' ? 'bg-volt-500/20' : 'bg-purple-500/20'
                }`}>
                  {msg.role === 'user' ? <User className="w-3 h-3 text-volt-400" /> : <Bot className="w-3 h-3 text-purple-400" />}
                </div>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-volt-500/10 text-surface-800 border border-volt-500/20 dark:text-surface-200'
                    : 'bg-white text-surface-700 border border-surface-200 dark:bg-white/[0.03] dark:text-surface-300 dark:border-white/5'
                }`}>
                  {renderMessage(msg.content, idx)}
                </div>
              </motion.div>
            ))}

            {chatMutation.isPending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
                <div className="w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3 h-3 text-purple-400" />
                </div>
                <div className="bg-white border border-surface-200 rounded-xl px-3 py-2 dark:bg-white/[0.03] dark:border-white/5">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-surface-200/70 bg-surface-50/70 dark:border-white/5 dark:bg-surface-900/50">
            <div className="flex items-end gap-2">
              <VfTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask VoltForge AI..."
                rows={1}
                className="flex-1 px-3 py-2 bg-white border border-surface-200 rounded-xl text-xs text-surface-950 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none max-h-24 dark:bg-white/5 dark:border-white/10 dark:text-white"
                style={{ minHeight: '36px' }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending}
                className="p-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white disabled:opacity-30 hover:from-purple-400 hover:to-pink-400 transition-all flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
