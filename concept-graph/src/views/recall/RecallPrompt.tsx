import type { RecallPromptProps } from '../../record/view-props'
export default function RecallPrompt(props: RecallPromptProps) {return <aside aria-label="离星回忆"><p>{props.label} · 占位</p>{(["remembered","forgot","skipped"] as const).map((r,i)=><button key={r} onClick={()=>props.onResult(r)}>{["记得","忘了","跳过"][i]}</button>)}</aside>}
