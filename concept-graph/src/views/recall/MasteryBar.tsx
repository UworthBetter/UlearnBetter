import type { MasteryBarProps } from '../../record/view-props'
export default function MasteryBar(props: MasteryBarProps) {return <div aria-label="掌握度">掌握 {props.level}/3 · 占位 {props.due}</div>}
