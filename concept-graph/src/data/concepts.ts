/** 来自 Grokbot策略笔记：8 张概念卡 + 主页那句结论。状态由界面写入，不改笔记库。 */
export type Status = 'unlearned' | 'learning' | 'mastered'

export interface Concept {
  id: string
  name: string
  /** 图谱上的短标签，避免中文长名叠在一起 */
  short: string
  importance: 1 | 2 | 3
  status: Status
  /** 概念卡「一句话定义」 */
  summary: string
  question: string
  task: string
  neighbors: string[]
}

export const concepts: Concept[] = [
  {
    id: 'core',
    name: '交易全亏却整体盈利',
    short: '全亏仍盈利',
    importance: 3,
    status: 'unlearned',
    summary: '交易侧费后约亏 1.7 万美元，返佣侧约赚 10.4 万美元，整体才是赚的。',
    question: '为什么交易全亏，整体还能盈利？',
    task: '用不超过 40 字解释利润到底来自哪一侧。',
    neighbors: ['rebate', 'both', 'forensics', 'backtest'],
  },
  {
    id: 'rebate',
    name: '做市返佣',
    short: '做市返佣',
    importance: 3,
    status: 'unlearned',
    summary: '限价单挂在盘口等别人来成交，平台为这份流动性付一笔小钱，方向对不对不重要。',
    question: '返佣怎样变成整体利润？',
    task: '说明返佣和交易盈亏为什么可以一正一负。',
    neighbors: ['core', 'both', 'crowding', 'market'],
  },
  {
    id: 'both',
    name: '双边套利',
    short: '双边套利',
    importance: 3,
    status: 'unlearned',
    summary: 'Up 与 Down 合计低于 1 美元时两边一起买，结算必拿回 1 美元，方向无关。',
    question: '为什么两边合计低于 1 美元就锁定了利润？',
    task: '用 10 月 14 日那笔 33 美分说明双边如何锁定。',
    neighbors: ['core', 'rebate', 'latency', 'market'],
  },
  {
    id: 'forensics',
    name: '钱包取证与逆向工程',
    short: '钱包取证',
    importance: 3,
    status: 'unlearned',
    summary: '用 Bot X-Ray 把公开钱包逐笔拉开，再把利润拆成交易侧和返佣侧。',
    question: '怎样从公开钱包反推出真正的赚钱来源？',
    task: '列出盈亏分解必须拆开的两侧。',
    neighbors: ['core', 'skill', 'backtest', 'latency'],
  },
  {
    id: 'backtest',
    name: '样本外回测',
    short: '样本外',
    importance: 3,
    status: 'unlearned',
    summary: '8–9 月用来调参，10 月这截从没见过的数据才用来打分，避免同一份数据又出主意又评分。',
    question: '怎么说明改进不是对着 8–9 月过拟合？',
    task: '说清训练窗、验证窗，以及每 100 美元从 42 美分到 77 美分。',
    neighbors: ['core', 'forensics', 'skill', 'crowding'],
  },
  {
    id: 'latency',
    name: '延迟套利',
    short: '延迟套利',
    importance: 2,
    status: 'unlearned',
    summary: 'Binance 价格跳动后，Polymarket 要几秒才跟上。这是 26.3 万美元钱包的表层机制，不是 Surfer 的主利润。',
    question: '延迟套利为什么不是这笔利润的来源？',
    task: '用一句话把延迟套利和做市返佣分开。',
    neighbors: ['both', 'forensics', 'market'],
  },
  {
    id: 'skill',
    name: '技能与运气检验',
    short: '运气检验',
    importance: 2,
    status: 'unlearned',
    summary: '181 天里 129 天盈利。若只是抛硬币，这种成绩大约每 2 亿次才出现 1 次。',
    question: '连胜纪录怎样才算不像纯运气？',
    task: '说出零假设，以及那个概率的量级。',
    neighbors: ['forensics', 'backtest'],
  },
  {
    id: 'market',
    name: 'Polymarket 预测市场',
    short: '预测市场',
    importance: 1,
    status: 'unlearned',
    summary: '链上预测市场，赢的一边每份兑付 1 美元，每笔成交公开，所以钱包能被逐笔审计。',
    question: '这套打法为什么依赖预测市场，而不是普通交易所？',
    task: '指出公开成交和 Up/Down 兑付规则各自派上了什么用场。',
    neighbors: ['rebate', 'both', 'latency', 'crowding'],
  },
  {
    id: 'crowding',
    name: '返佣池拥挤',
    short: '返佣拥挤',
    importance: 2,
    status: 'unlearned',
    summary: '返佣来自一块有限的奖池。复制的人越多，每人分到的越少，公开本身就会吃掉优势。',
    question: '策略一旦公开，优势为什么会消失？',
    task: '用有限奖池说明人均变薄，而不是「别人也会交易」。',
    neighbors: ['rebate', 'backtest', 'market'],
  },
]

export function conceptById(list: Concept[], id: string): Concept {
  const found = list.find((item) => item.id === id)
  if (!found) throw new Error(`未知概念 ${id}`)
  return found
}
