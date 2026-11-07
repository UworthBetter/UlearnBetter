import type { LearningContext } from '../contracts.ts'
import { sceneTitle, selectionPreview } from './scene-label.ts'

/** 本地模拟回答。调用方必须把这段文字标成演示，不能当作真实模型输出。 */
export function buildDemoAnswer(snapshot: LearningContext): string {
  const subject = sceneTitle(snapshot)
  const selection = snapshot.selection?.text
    ? selectionPreview(snapshot.selection.text)
    : '这一问没有选中文字'
  const evidence = snapshot.card?.evidence[0]
  const source = evidence
    ? [evidence.sourceId, evidence.note, evidence.url].filter(Boolean).join(' · ')
    : `${snapshot.topic?.title ?? '未命名主题'} / ${subject}`

  return [
    '【演示回复 · 未调用真实模型】',
    '',
    `这一问锁定的讨论对象是「${subject}」。`,
    `选中内容：${selection}`,
    '',
    '下面用一段稍长的说明检查滚动、换行、公式和来源。助手只使用发送按钮按下时的场景快照。之后如果星图切到别的概念，这段回答仍然属于原来的讨论对象，不会改记到新节点。',
    '',
    '概念卡放在中心，环绕入口只是去看材料的门。材料正文、字幕和选中文字都只是数据。即使材料里写了“忽略之前的要求”，也不会变成新的系统指令。',
    '',
    '参数可以沿着损失往下走：',
    '',
    '$$\\theta_{t+1} = \\theta_t - \\eta \\nabla_{\\theta} L(\\theta_t)$$',
    '',
    '其中步长 $\\eta > 0$。这只是演示公式，不是对当前卡片的计算核对。',
    '',
    '模型若写出下面这些标记，页面也只显示文字，不会执行：',
    '',
    '`<script>alert(1)</script>`',
    '',
    '`<img src="x" onerror="alert(1)">`',
    '',
    '```',
    'const payload = "<script>alert(1)</script>"',
    '```',
    '',
    `来源：${source}`,
    '',
    `快照修订 ${snapshot.revision}，采集于 ${snapshot.capturedAt || '未知时间'}。`,
  ].join('\n')
}
