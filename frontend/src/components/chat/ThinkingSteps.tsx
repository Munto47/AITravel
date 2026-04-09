'use client'

import { useState } from 'react'

import type { ThinkingStep } from '@/types/chat'

const NODE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  router:       { label: '意图分析', icon: '🔀', color: 'text-purple-600' },
  rag_retrieval: { label: '游记检索', icon: '📚', color: 'text-green-600' },
  amap_search:  { label: '高德搜索', icon: '📍', color: 'text-blue-600' },
  synthesizer:  { label: '数据合并', icon: '⚡', color: 'text-orange-600' },
  optimizer:    { label: '路线优化', icon: '🗺️', color: 'text-red-600' },
}

interface ThinkingStepsProps {
  steps: ThinkingStep[]
  isStreaming: boolean
}

/**
 * ThinkingSteps 组件 - 面试核心亮点
 * 展示 LangGraph 各节点执行状态的可视化时间轴
 */
export default function ThinkingSteps({ steps, isStreaming }: ThinkingStepsProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  if (steps.length === 0 && !isStreaming) return null

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <span>{isExpanded ? '▾' : '▸'}</span>
        <span>Agent 思考链 ({steps.length} 步)</span>
        {isStreaming && <span className="ml-1 text-blue-500 animate-pulse">•</span>}
      </button>

      {isExpanded && (
        <div className="mt-1.5 ml-2 border-l-2 border-gray-200 pl-3 space-y-1.5">
          {steps.map((step, i) => {
            const config = NODE_CONFIG[step.node] || { label: step.node, icon: '•', color: 'text-gray-600' }
            const isLast = i === steps.length - 1

            return (
              <div key={i} className="flex items-start gap-2">
                {/* 状态指示 */}
                <div className={`flex-shrink-0 mt-0.5 ${config.color}`}>
                  {isLast && isStreaming ? (
                    <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="text-sm">{config.icon}</span>
                  )}
                </div>

                {/* 节点信息 */}
                <div>
                  <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                  <span className="text-xs text-gray-500 ml-1">— {step.summary}</span>
                  {step.durationMs > 0 && !isStreaming && (
                    <span className="text-xs text-gray-300 ml-1">{step.durationMs}ms</span>
                  )}
                </div>
              </div>
            )
          })}

          {/* 正在执行中的占位 */}
          {isStreaming && (
            <div className="flex items-center gap-2 opacity-50">
              <span className="text-gray-400 text-xs">•••</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
