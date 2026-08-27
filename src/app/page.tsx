import Link from 'next/link';
import { ArrowRight, MessagesSquare, Sparkles, Target } from 'lucide-react';

const FEATURES = [
  { icon: MessagesSquare, title: '自然讨论', desc: '串行发言、自由回应和 @ 提问，让群组讨论保持真实节奏。' },
  { icon: Target, title: '随时介入', desc: 'AI 主持自动推进，研究员也能在任何时刻追加问题。' },
  { icon: Sparkles, title: '即时洞察', desc: '从完整原声中提炼共识、争议、痛点与行动建议。' },
];

export default function HomePage() {
  return <main className="min-h-screen px-5 py-6"><nav className="mx-auto flex max-w-6xl items-center justify-between"><div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#172033] font-bold text-white">P</span><span className="font-semibold">PersonaLab</span></div><Link href="/lab" className="button-secondary">进入工作台</Link></nav><section className="mx-auto flex min-h-[78vh] max-w-5xl flex-col items-center justify-center py-20 text-center"><span className="eyebrow">AI-powered qualitative research</span><h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[1.05] tracking-[-0.045em] text-[#111827] md:text-7xl">把目标用户请进一场<br/>真实而高效的讨论</h1><p className="mt-7 max-w-2xl text-lg leading-8 text-[#687386]">通过多个人格 Agent 进行深度访谈、焦点小组、概念测试和 A/B 对比。实时追问，完整记录，自动生成可执行洞察。</p><Link href="/lab" className="button-primary mt-9 px-6 py-3">创建一场研究 <ArrowRight className="h-4 w-4"/></Link><div className="mt-20 grid w-full grid-cols-1 gap-4 text-left md:grid-cols-3">{FEATURES.map((feature) => { const Icon = feature.icon; return <div key={feature.title} className="surface p-6"><Icon className="h-5 w-5 text-[#2563eb]"/><h2 className="mt-5 font-semibold">{feature.title}</h2><p className="mt-2 text-sm leading-6 text-[#6b7587]">{feature.desc}</p></div>; })}</div></section></main>;
}
