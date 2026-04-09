'use client'

import { useState, useRef, useEffect } from 'react'

import type { ChatMessage } from '@/types/chat'
import MessageItem from './MessageItem'
import ThinkingSteps from './ThinkingSteps'

interface ChatPanelProps {
  messages: ChatMessage[]
  isStreaming: boolean
  onSend: (text: string) => void
}

export default function ChatPanel({ messages, isStreaming, onSend }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    onSend(text)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">AI 旅行顾问</h2>
        <p className="text-xs text-gray-400 mt-0.5">描述您的需求，AI 将为您推荐合适的地点</p>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-xs mt-8">
            <p className="text-2xl mb-2">💬</p>
            <p>试试问：</p>
            <div className="mt-2 space-y-1">
              {['成都有哪些适合带老人的景点？', '推荐几家特色火锅', '三天行程怎么安排？'].map((q) => (
                <button
                  key={q}
                  onClick={() => onSend(q)}
                  className="block w-full text-left text-blue-600 text-xs hover:underline px-2 py-1 rounded hover:bg-blue-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.messageId}>
            {/* ThinkingSteps 只在 AI 消息前显示 */}
            {msg.role === 'assistant' && msg.thinkingSteps && msg.thinkingSteps.length > 0 && (
              <ThinkingSteps steps={msg.thinkingSteps} isStreaming={msg.status === 'streaming'} />
            )}
            <MessageItem message={msg} />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 输入框 */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入您的需求..."
            rows={2}
            className="flex-1 resize-none border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="self-end bg-blue-600 text-white rounded-lg px-3 py-2 text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}
