import type { LearningContext } from '../../assistant/contracts.ts'

export type InteractionState = NonNullable<LearningContext['interaction']>

/** Keep module output serializable; never publish late callbacks from a closed panel. */
export function createInteractionReporter(signal: AbortSignal, onReport?: (state: InteractionState) => void) {
  let previous = ''
  const primitives = (values: Record<string, unknown>) => Object.fromEntries(
    Object.entries(values).filter(([, value]) =>
      typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))),
  ) as InteractionState['parameters']
  return (state: InteractionState) => {
    if (signal.aborted || !onReport) return
    const clean = { parameters: primitives(state.parameters), readouts: primitives(state.readouts) }
    const key = JSON.stringify(clean)
    if (key === previous) return
    previous = key
    onReport(clean)
  }
}
