/* Registers the first-party modules in the prototype's order (param_demo first, then the rest). */
import './paramDemo'
import './builtins'
import './learningBlocks'

export { MODULES, cardTs, moduleUi, mountModule, registerModule, resolveCard, runSchema } from './registry'
export type { MountedModule } from './registry'
