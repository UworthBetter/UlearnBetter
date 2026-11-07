import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CopilotKitAgentIdContext, CopilotKitContext, CopilotKitCoreReact } from '@copilotkit/react-core/v2/context'

/**
 * 官方 `<CopilotKitProvider>` 来自 `@copilotkit/react-core/v2`，该入口会引入
 * Tailwind preflight，重置星图已有样式。这里直接使用 provider 内部的
 * `CopilotKitCoreReact`，运行时、工具和 `runAgent` 仍走 CopilotKit v2。
 */
export function AssistantRuntime({
  runtimeUrl,
  agentId,
  children,
}: {
  runtimeUrl: string
  agentId: string
  children: ReactNode
}) {
  const [core] = useState(() => new CopilotKitCoreReact({
    runtimeUrl,
    deferInitialConnection: true,
    tools: [],
  }))
  const [executingToolCallIds, setExecutingToolCallIds] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    core.setRuntimeUrl(runtimeUrl)
    core.connect()
  }, [core, runtimeUrl])

  useEffect(() => {
    const subscription = core.subscribe({
      onToolExecutionStart: ({ toolCallId }) => {
        setExecutingToolCallIds((current) => {
          if (current.has(toolCallId)) return current
          const next = new Set(current)
          next.add(toolCallId)
          return next
        })
      },
      onToolExecutionEnd: ({ toolCallId }) => {
        setExecutingToolCallIds((current) => {
          if (!current.has(toolCallId)) return current
          const next = new Set(current)
          next.delete(toolCallId)
          return next
        })
      },
    })
    return () => subscription.unsubscribe()
  }, [core])

  const value = useMemo(() => ({
    copilotkit: core,
    executingToolCallIds,
    showIntelligenceIndicator: false,
  }), [core, executingToolCallIds])

  return (
    <CopilotKitContext.Provider value={value}>
      <CopilotKitAgentIdContext.Provider value={agentId}>
        {children}
      </CopilotKitAgentIdContext.Provider>
    </CopilotKitContext.Provider>
  )
}
