import type { LearningContext } from '../assistant/contracts.ts'
import type { RecordClient } from './client.ts'
export type RecordRoute = {view: 'today'; layer?: 'stats'|null} | {view: 'panorama'; goalId?: string|null} | {view: 'library'; itemId?: string|null} | {view: 'star-dive'; topicId: string; conceptId?: string|null}
export type RecordScene = Pick<LearningContext,'record'|'layer'>
export interface AdjustOptions {changeLogId?: string; itemId?: string}
export interface ViewProps {client: RecordClient; route: RecordRoute; navigate(to: RecordRoute): void; openAdjust(opts?: AdjustOptions): void; reportScene(scene: RecordScene): void}
export interface AdjustLayerProps {client: RecordClient; changeLogId?: string; itemId?: string; onClose(): void; navigate(to: RecordRoute): void}
export interface RecallPromptProps {subject: string; label: string; onResult(result: 'remembered'|'forgot'|'skipped'): void}
export interface MasteryBarProps {level: 0|1|2|3; due: string|null}
