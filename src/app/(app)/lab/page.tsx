'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, GitCompareArrows, MessageCircle, MessagesSquare, Plus, Sparkles, TestTube2 } from 'lucide-react';
import { Avatar } from '@/components/avatar';
import { useStore, uid } from '@/lib/store';
import { formatForMode, MODE_DEFAULT_TURNS, type ResearchMode, type ResearchProject } from '@/lib/types';

const MODES = [
  { id: 'interview' as const, title: '深度访谈', desc: '与一位用户连续追问，理解行为背后的动机。', icon: MessageCircle },
  { id: 'focus_group' as const, title: '焦点小组', desc: '让多位用户围绕主题自由交流和回应。', icon: MessagesSquare },
  { id: 'concept_test' as const, title: '概念测试', desc: '展示一份概念材料，收集理解与接受度。', icon: TestTube2 },
  { id: 'ab_compare' as const, title: 'A/B 对比', desc: '并列比较两个方案，识别偏好与原因。', icon: GitCompareArrows },
];

const DEFAULT_OUTLINE: Record<ResearchMode, string[]> = {
  interview: ['日常使用习惯与真实场景', '最近一次相关经历', '现有解决方式与痛点', '理想体验和优先级', '付费与推荐意愿'],
  focus_group: ['第一印象与使用场景', '最有价值的功能', '使用顾虑与阻碍', '价格接受度', '购买与推荐意愿'],
  concept_test: ['概念理解与第一反应', '最有吸引力的价值点', '不清楚或不可信的部分', '适用场景', '尝试与付费意愿'],
  ab_compare: ['对 A 与 B 的第一印象', '核心差异感知', '易用性与价值比较', '不同场景下的选择', '最终偏好与原因'],
};

export default function LabPage() {
  const router = useRouter();
  const { projects, activeProjectId, setActiveProject, addProject, updateProject, personas, addResearch, upsertRecord, llm } = useStore();
  const active = useMemo(() => projects.find((project) => project.id === activeProjectId) ?? projects[0], [projects, activeProjectId]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [selected, setSelected] = useState<string[]>(active?.personaIds ?? []);
  const [newQuestion, setNewQuestion] = useState('');
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [message, setMessage] = useState('');

  if (!active) return null;
  const mode = active.researchMode;
  const format = formatForMode(mode);
  const minPeople = mode === 'interview' ? 1 : 3;
  const maxPeople = mode === 'interview' ? 1 : 6;
  const pool = personas.filter((persona) => persona.projectId === active.id);

  const patch = (value: Partial<ResearchProject>) => updateProject(active.id, value);
  const chooseMode = (next: ResearchMode) => {
    patch({ researchMode: next, maxTurns: MODE_DEFAULT_TURNS[next], outline: DEFAULT_OUTLINE[next] });
    setSelected((current) => next === 'interview' ? current.slice(0, 1) : current.slice(0, 6));
  };
  const togglePersona = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < maxPeople ? [...current, id] : current);
  const createProject = () => {
    if (!newName.trim()) return;
    const now = Date.now();
    const project: ResearchProject = { id: uid('proj'), productName: newName.trim(), productDescription: '', researchGoal: '', researchMode: 'focus_group', personaIds: [], outline: DEFAULT_OUTLINE.focus_group, stimulusA: '', stimulusB: '', maxTurns: 20, createdAt: now, updatedAt: now };
    addProject(project); setSelected([]); setNewName(''); setCreating(false);
  };
  const generateOutline = async () => {
    if (!active.researchGoal.trim()) { setMessage('请先填写研究目标'); return; }
    setOutlineLoading(true); setMessage('');
    try {
      const response = await fetch('/api/outline/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: active.researchGoal, product: active.productName, mode, stimulus: active.stimulusA || active.stimulusB, llm }) });
      const data = await response.json() as { outline?: string[]; error?: string };
      if (!response.ok || !data.outline) throw new Error(data.error ?? '生成失败');
      patch({ outline: data.outline }); setMessage('讨论提纲已更新');
    } catch (error) { setMessage(error instanceof Error ? error.message : '生成失败'); } finally { setOutlineLoading(false); }
  };
  const validate = () => {
    if (!active.productName.trim()) return '请填写产品或概念名称';
    if (!active.researchGoal.trim()) return '请填写研究目标';
    if (selected.length < minPeople || selected.length > maxPeople) return `请选择 ${minPeople === maxPeople ? minPeople : `${minPeople}-${maxPeople}`} 位参与者`;
    if (mode === 'concept_test' && !active.stimulusA.trim()) return '概念测试需要填写研究材料';
    if (mode === 'ab_compare' && (!active.stimulusA.trim() || !active.stimulusB.trim())) return 'A/B 对比需要填写两份方案';
    return '';
  };
  const start = () => {
    const issue = validate(); if (issue) { setMessage(issue); return; }
    const id = uid('research');
    const config = { id, mode, format, goal: active.researchGoal.trim(), product: active.productName.trim(), productDescription: active.productDescription.trim(), stimulusA: active.stimulusA.trim() || undefined, stimulusB: active.stimulusB.trim() || undefined, personaIds: selected, outline: active.outline.filter(Boolean), maxTurns: Math.max(5, Math.min(50, active.maxTurns)), createdAt: Date.now() };
    patch({ personaIds: selected }); addResearch(config);
    upsertRecord({ id, config, messages: [], status: 'ready', participantTurns: 0, currentTopic: config.outline[0] ?? '开始讨论', mentionChain: 0, startedAt: Date.now() });
    router.push(`/session?r=${id}`);
  };

  return <div className="mx-auto max-w-6xl space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><span className="eyebrow">Research workspace</span><h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">创建一场用户研究</h1><p className="mt-2 text-sm text-[#6c7688]">配置目标、参与者与讨论材料，AI 主持人会自动推进会话。</p></div><div className="flex w-full gap-2 sm:w-auto"><select value={active.id} onChange={(event) => { setActiveProject(event.target.value); const next = projects.find((project) => project.id === event.target.value); setSelected(next?.personaIds ?? []); }} className="field min-w-0 flex-1 px-3 py-2 text-sm sm:min-w-48">{projects.map((project) => <option key={project.id} value={project.id}>{project.productName}</option>)}</select><button onClick={() => setCreating((value) => !value)} className="button-secondary shrink-0 whitespace-nowrap"><Plus className="h-4 w-4"/> 新项目</button></div></header>
    {creating && <div className="surface flex gap-3 p-4"><input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && createProject()} placeholder="产品或研究项目名称" className="field px-3 py-2"/><button onClick={createProject} className="button-primary shrink-0">创建项目</button></div>}
    <section className="surface p-5 md:p-7"><div className="mb-5 flex items-center gap-3"><Step n="1"/><div><h2 className="font-semibold">选择研究类型</h2><p className="text-xs text-[#778195]">四种研究类型，两种会话形态</p></div></div><div className="grid gap-3 md:grid-cols-4">{MODES.map((item) => { const Icon = item.icon; const activeMode = mode === item.id; return <button key={item.id} onClick={() => chooseMode(item.id)} className={`relative rounded-2xl border p-4 text-left transition ${activeMode ? 'border-[#8cb1ff] bg-[#edf3ff] shadow-sm' : 'border-[#e2e6ed] bg-white hover:border-[#c7ced9]'}`}><Icon className={`h-5 w-5 ${activeMode ? 'text-[#2563eb]' : 'text-[#788397]'}`}/><h3 className="mt-4 text-sm font-semibold">{item.title}</h3><p className="mt-1 text-xs leading-5 text-[#707a8c]">{item.desc}</p>{activeMode && <Check className="absolute right-3 top-3 h-4 w-4 text-[#2563eb]"/>}</button>; })}</div></section>
    <section className="surface p-5 md:p-7"><div className="mb-5 flex items-center gap-3"><Step n="2"/><div><h2 className="font-semibold">定义产品与目标</h2><p className="text-xs text-[#778195]">这些信息会成为所有 Agent 的共同背景</p></div></div><div className="grid gap-4 md:grid-cols-2"><Field label="产品 / 概念名称"><input value={active.productName} onChange={(event) => patch({ productName: event.target.value })} className="field px-3 py-2.5"/></Field><Field label="研究目标"><input value={active.researchGoal} onChange={(event) => patch({ researchGoal: event.target.value })} className="field px-3 py-2.5"/></Field><div className="md:col-span-2"><Field label="产品描述"><textarea rows={3} value={active.productDescription} onChange={(event) => patch({ productDescription: event.target.value })} className="field resize-none px-3 py-2.5"/></Field></div></div></section>
    <section className="surface p-5 md:p-7"><div className="mb-5 flex items-center gap-3"><Step n="3"/><div><h2 className="font-semibold">准备研究材料与提纲</h2><p className="text-xs text-[#778195]">AI 主持人会结合提纲自然推进，而不是机械逐题询问</p></div></div>{mode === 'concept_test' && <Field label="概念材料 *"><textarea rows={4} value={active.stimulusA} onChange={(event) => patch({ stimulusA: event.target.value })} className="field resize-none px-3 py-2.5" placeholder="粘贴概念说明、卖点或设计描述"/></Field>}{mode === 'ab_compare' && <div className="grid gap-4 md:grid-cols-2"><Field label="方案 A *"><textarea rows={4} value={active.stimulusA} onChange={(event) => patch({ stimulusA: event.target.value })} className="field resize-none px-3 py-2.5"/></Field><Field label="方案 B *"><textarea rows={4} value={active.stimulusB} onChange={(event) => patch({ stimulusB: event.target.value })} className="field resize-none px-3 py-2.5"/></Field></div>}{mode === 'focus_group' && <Field label="补充材料（可选）"><textarea rows={3} value={active.stimulusA} onChange={(event) => patch({ stimulusA: event.target.value })} className="field resize-none px-3 py-2.5"/></Field>}<div className="mt-5 flex items-center justify-between"><span className="label mb-0">讨论提纲</span><button onClick={generateOutline} disabled={outlineLoading} className="button-secondary !px-3 !py-1.5 text-xs"><Sparkles className="h-3.5 w-3.5"/>{outlineLoading ? '生成中' : 'AI 生成提纲'}</button></div><div className="mt-2 space-y-2">{active.outline.map((question, index) => <div key={`${index}-${question}`} className="flex items-center gap-3"><span className="w-5 text-center text-xs text-[#9aa3b1]">{index + 1}</span><input value={question} onChange={(event) => patch({ outline: active.outline.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} className="field px-3 py-2 text-sm"/><button onClick={() => patch({ outline: active.outline.filter((_, itemIndex) => itemIndex !== index) })} className="px-2 text-[#9aa3b1] hover:text-[#c93b4a]" aria-label="删除问题">×</button></div>)}</div><div className="mt-2 flex gap-2 pl-8"><input value={newQuestion} onChange={(event) => setNewQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && newQuestion.trim()) { patch({ outline: [...active.outline, newQuestion.trim()] }); setNewQuestion(''); } }} placeholder="添加讨论问题" className="field px-3 py-2 text-sm"/><button onClick={() => { if (newQuestion.trim()) { patch({ outline: [...active.outline, newQuestion.trim()] }); setNewQuestion(''); } }} className="button-secondary shrink-0 !py-1.5">添加</button></div></section>
    <section className="surface p-5 md:p-7"><div className="mb-5 flex items-center gap-3"><Step n="4"/><div><h2 className="font-semibold">选择参与者与发言上限</h2><p className="text-xs text-[#778195]">{format === 'one_on_one' ? '单用户访谈需要选择 1 位参与者' : '群组讨论建议选择 3-6 位参与者'}</p></div></div>{pool.length === 0 ? <p className="rounded-xl bg-[#f3f5f8] p-6 text-center text-sm text-[#6f798b]">此项目还没有用户画像，请先到“用户画像”页面创建。</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{pool.map((persona) => { const checked = selected.includes(persona.id); return <button key={persona.id} onClick={() => togglePersona(persona.id)} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${checked ? 'border-[#8cb1ff] bg-[#f0f5ff]' : 'border-[#e2e6ed] bg-white'}`}><Avatar persona={persona}/><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{persona.name}</div><div className="truncate text-xs text-[#778195]">{persona.age} 岁 · {persona.occupation}</div></div><span className={`grid h-5 w-5 place-items-center rounded-full border ${checked ? 'border-[#2563eb] bg-[#2563eb] text-white' : 'border-[#cbd1dc]'}`}>{checked && <Check className="h-3 w-3"/>}</span></button>; })}</div>}<div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#f4f6f9] p-4"><div><div className="text-sm font-semibold">参与者发言上限</div><div className="mt-1 text-xs text-[#778195]">主持人与真人研究员消息不计入</div></div><div className="flex items-center gap-3"><input type="range" min={5} max={50} value={active.maxTurns} onChange={(event) => patch({ maxTurns: Number(event.target.value) })} className="w-40 accent-[#2563eb]"/><span className="w-14 rounded-lg bg-white px-2 py-1.5 text-center text-sm font-semibold shadow-sm">{active.maxTurns} 条</span></div></div></section>
    <div className="flex flex-col items-center justify-between gap-3 rounded-2xl bg-[#172033] p-5 text-white sm:flex-row"><div><div className="font-semibold">准备就绪</div><div className="mt-1 text-xs text-white/60">{selected.length} 位参与者 · 最多 {active.maxTurns} 条发言 · {llm.apiKey ? llm.model : 'Mock 演示模式'}</div>{message && <div className="mt-2 text-xs text-[#9fc0ff]">{message}</div>}</div><button onClick={start} className="button-primary bg-white !text-[#172033] hover:!bg-[#eef2f8]">开始研究 <ArrowRight className="h-4 w-4"/></button></div>
  </div>;
}

function Step({ n }: { n: string }) { return <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#172033] text-xs font-semibold text-white">{n}</span>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="label">{label}</span>{children}</label>; }
