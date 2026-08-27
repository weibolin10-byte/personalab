'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AtSign, BarChart3, ChevronLeft, CircleStop, Menu, Pause, Play, RotateCcw, Send, Users, X } from 'lucide-react';
import { Avatar } from '@/components/avatar';
import { useStore, uid } from '@/lib/store';
import { EMOTION_LABEL, RESEARCH_MODE_LABEL, type Emotion, type SessionMessage, type SessionStatus, type TurnDecision, type TurnOutput, type TurnStreamEvent } from '@/lib/types';

interface PendingResearcherMessage { id: string; content: string; mentionId?: string }
interface StreamingMessage { speakerId: string; speakerName: string; role: 'ai_moderator' | 'persona'; content: string }

const QUICK_QUESTIONS = ['产品设计怎么样？', '你愿意为它付多少钱？', '最大的顾虑是什么？', '什么场景下会使用？'];

function SessionInner() {
  const params = useSearchParams();
  const researchId = params.get('r') ?? params.get('research') ?? '';
  const researches = useStore((state) => state.researches);
  const records = useStore((state) => state.records);
  const personas = useStore((state) => state.personas);
  const llm = useStore((state) => state.llm);
  const upsertRecord = useStore((state) => state.upsertRecord);
  const stored = useMemo(() => records.find((record) => record.id === researchId), [records, researchId]);
  const config = stored?.config ?? researches.find((research) => research.id === researchId);
  const participants = useMemo(() => personas.filter((persona) => config?.personaIds.includes(persona.id)), [personas, config]);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [status, setStatus] = useState<SessionStatus>('ready');
  const [participantTurns, setParticipantTurns] = useState(0);
  const [topic, setTopic] = useState('准备开始');
  const [mentionChain, setMentionChain] = useState(0);
  const [pending, setPending] = useState<PendingResearcherMessage[]>([]);
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);
  const [generating, setGenerating] = useState(false);
  const [input, setInput] = useState('');
  const [selectedMention, setSelectedMention] = useState<string | undefined>();
  const [mentionOpen, setMentionOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState('');
  const [analysisStage, setAnalysisStage] = useState('');
  const [endRequested, setEndRequested] = useState(false);
  const initializedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const statusRef = useRef<SessionStatus>('ready');

  useEffect(() => {
    if (!config || initializedRef.current) return;
    initializedRef.current = true;
    const restoredStatus = stored?.status === 'running' ? 'paused' : stored?.status ?? 'running';
    const restoredMessages = stored?.messages ?? [];
    const turns = stored?.participantTurns ?? restoredMessages.filter((message) => message.role === 'persona').length;
    setMessages(restoredMessages); setParticipantTurns(turns); setStatus(restoredStatus === 'ready' ? 'running' : restoredStatus); setTopic(stored?.currentTopic ?? config.outline[0] ?? '开始讨论'); setMentionChain(stored?.mentionChain ?? 0);
  }, [config, stored]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, streaming, pending]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const persist = useCallback((nextMessages: SessionMessage[], nextStatus: SessionStatus, nextTurns: number, nextTopic: string, nextMentionChain: number, extra?: { error?: string }) => {
    if (!config) return;
    upsertRecord({ id: researchId, config, messages: nextMessages, status: nextStatus, participantTurns: nextTurns, currentTopic: nextTopic, mentionChain: nextMentionChain, report: stored?.report, startedAt: stored?.startedAt ?? Date.now(), finishedAt: nextStatus === 'completed' ? Date.now() : stored?.finishedAt, error: extra?.error });
  }, [config, researchId, stored?.finishedAt, stored?.report, stored?.startedAt, upsertRecord]);

  const appendMessage = useCallback((message: SessionMessage, nextTopic = topic, nextChain = mentionChain) => {
    const next = [...messages, message];
    const nextTurns = participantTurns + (message.role === 'persona' ? 1 : 0);
    setMessages(next); setParticipantTurns(nextTurns); setTopic(nextTopic); setMentionChain(nextChain);
    persist(next, statusRef.current, nextTurns, nextTopic, nextChain);
    return { next, nextTurns };
  }, [mentionChain, messages, participantTurns, persist, topic]);

  const finishAnalysis = useCallback(async () => {
    if (!config || status === 'analyzing' || status === 'completed') return;
    setStatus('analyzing'); setAnalysisStage('正在准备研究报告'); setError(''); setEndRequested(false);
    persist(messages, 'analyzing', participantTurns, topic, mentionChain);
    try {
      const response = await fetch('/api/simulate/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config, personas: participants, messages, llm }) });
      if (!response.ok || !response.body) throw new Error(`分析请求失败 (${response.status})`);
      const events = await readEventStream(response.body, (event) => { if (event.type === 'analysis_progress') setAnalysisStage(event.stage); });
      const complete = events.findLast((event) => event.type === 'complete');
      if (!complete || complete.type !== 'complete') throw new Error('分析未返回完整报告');
      upsertRecord({ id: researchId, config, messages, status: 'completed', participantTurns, currentTopic: topic, mentionChain, report: complete.report, startedAt: stored?.startedAt ?? Date.now(), finishedAt: Date.now() });
      setStatus('completed'); setAnalysisStage('');
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : '分析失败'; setError(text); setStatus('error'); persist(messages, 'error', participantTurns, topic, mentionChain, { error: text });
    }
  }, [config, llm, mentionChain, messages, participantTurns, participants, persist, researchId, status, stored?.startedAt, topic, upsertRecord]);

  const generateNext = useCallback(async () => {
    if (!config || generating || status !== 'running') return;
    if (participantTurns >= config.maxTurns) { void finishAnalysis(); return; }
    if (pending.length > 0) {
      const [first, ...rest] = pending;
      const message: SessionMessage = { id: first.id, sequence: messages.length + 1, speakerId: 'human_researcher', speakerName: '你', role: 'human_researcher', content: first.content, emotion: 'neutral', mentionId: first.mentionId, timestamp: Date.now() };
      setPending(rest); appendMessage(message, topic, 0); return;
    }
    setGenerating(true); setError('');
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const last = messages.at(-1);
      const forcedSpeakerId = last?.mentionId && (last.role === 'human_researcher' || mentionChain < 3) ? last.mentionId : undefined;
      const decisionResponse = await fetch('/api/simulate/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config, personas: participants, messages, llm, forcedSpeakerId, mentionChain }), signal: controller.signal });
      const decisionData = await decisionResponse.json() as TurnDecision & { error?: string };
      if (!decisionResponse.ok) throw new Error(decisionData.error ?? '无法决定下一位发言者');
      const speaker = decisionData.type === 'moderator' ? undefined : participants.find((persona) => persona.id === decisionData.speakerId);
      const speakerName = decisionData.type === 'moderator' ? 'AI 主持人' : speaker?.name ?? '参与者';
      setTopic(decisionData.topic); setStreaming({ speakerId: decisionData.speakerId, speakerName, role: decisionData.type === 'moderator' ? 'ai_moderator' : 'persona', content: '' });
      const turnResponse = await fetch('/api/simulate/turn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config, personas: participants, messages, decision: decisionData, llm }), signal: controller.signal });
      if (!turnResponse.ok || !turnResponse.body) throw new Error(`发言请求失败 (${turnResponse.status})`);
      let output: TurnOutput | undefined;
      await readEventStream(turnResponse.body, (event) => {
        if (event.type === 'message_delta') setStreaming((current) => current ? { ...current, content: current.content + event.text } : current);
        if (event.type === 'message_end') output = event.output;
        if (event.type === 'error') throw new Error(event.message);
      });
      if (!output) throw new Error('发言未完整结束');
      const role = decisionData.type === 'moderator' ? 'ai_moderator' : 'persona';
      const nextChain = role === 'persona' && output.mentionId ? mentionChain + 1 : role === 'ai_moderator' ? 0 : mentionChain;
      const message: SessionMessage = { id: uid('msg'), sequence: messages.length + 1, speakerId: decisionData.speakerId, speakerName, role, content: output.content, emotion: output.emotion, mentionId: output.mentionId, replyToId: decisionData.replyToId, timestamp: Date.now() };
      appendMessage(message, decisionData.topic, nextChain);
    } catch (cause) {
      if ((cause as Error).name !== 'AbortError') { const text = cause instanceof Error ? cause.message : '生成失败'; setError(text); setStatus('error'); persist(messages, 'error', participantTurns, topic, mentionChain, { error: text }); }
    } finally { abortRef.current = null; setStreaming(null); setGenerating(false); }
  }, [appendMessage, config, finishAnalysis, generating, llm, mentionChain, messages, participantTurns, participants, pending, persist, status, topic]);

  useEffect(() => {
    if (!initializedRef.current || generating) return;
    if (endRequested) { void finishAnalysis(); return; }
    if (status !== 'running') return;
    const timer = window.setTimeout(() => void generateNext(), 180);
    return () => window.clearTimeout(timer);
  }, [endRequested, finishAnalysis, generateNext, generating, messages.length, pending.length, status]);

  const sendResearcherMessage = (content: string) => {
    const value = content.trim(); if (!value) return;
    setPending((current) => [...current, { id: uid('msg'), content: value, mentionId: selectedMention }]); setInput(''); setSelectedMention(undefined); setMentionOpen(false);
  };
  const pause = () => { setStatus('paused'); persist(messages, 'paused', participantTurns, topic, mentionChain); };
  const resume = () => { setError(''); setStatus('running'); persist(messages, 'running', participantTurns, topic, mentionChain); };
  const requestEnd = () => { setEndRequested(true); setStatus('paused'); if (!generating) void finishAnalysis(); };

  if (!config) return <div className="mx-auto max-w-xl surface p-10 text-center"><h1 className="text-xl font-semibold">找不到这场研究</h1><p className="mt-2 text-sm text-[#727c8e]">研究配置可能已被删除。</p><Link href="/lab" className="button-primary mt-6">返回工作台</Link></div>;
  const progress = Math.min(100, Math.round((participantTurns / config.maxTurns) * 100));
  const panel = <ParticipantPanel participants={participants} messages={messages} streamingId={streaming?.speakerId} onClose={() => setPanelOpen(false)}/>;

  return <div className="mx-auto max-w-[1320px]"><header className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Link href="/lab" className="grid h-9 w-9 place-items-center rounded-full border border-[#e0e4eb] bg-white text-[#5f6a7c]" aria-label="返回工作台"><ChevronLeft className="h-4 w-4"/></Link><div><div className="flex items-center gap-2"><h1 className="font-semibold">{config.product}</h1><span className="rounded-full bg-[#edf2fb] px-2 py-0.5 text-[11px] font-semibold text-[#315f9d]">{RESEARCH_MODE_LABEL[config.mode]}</span></div><p className="mt-0.5 text-xs text-[#7a8496]">当前话题 · {topic}</p></div></div><div className="flex items-center gap-2"><button onClick={() => setPanelOpen(true)} className="button-secondary lg:hidden"><Users className="h-4 w-4"/></button>{status === 'running' ? <button onClick={pause} className="button-secondary"><Pause className="h-4 w-4"/> 暂停</button> : (status === 'paused' || status === 'error') && <button onClick={resume} className="button-secondary"><Play className="h-4 w-4"/> {status === 'error' ? '重试' : '继续'}</button>}{!['analyzing','completed'].includes(status) && <button onClick={requestEnd} className="button-danger"><CircleStop className="h-4 w-4"/> 结束</button>}</div></header>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]"><section className="surface flex min-h-[calc(100vh-9rem)] flex-col overflow-hidden"><div className="flex items-center gap-3 border-b border-[#e7eaf0] px-5 py-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e9edf3]"><div className="h-full rounded-full bg-[#2563eb] transition-all" style={{ width: `${progress}%` }}/></div><span className="text-xs font-medium text-[#697386]">{participantTurns} / {config.maxTurns}</span><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${status === 'running' ? 'bg-[#e8f7ef] text-[#287353]' : status === 'analyzing' ? 'bg-[#fff4dc] text-[#8a641a]' : status === 'completed' ? 'bg-[#eaf1ff] text-[#2563eb]' : 'bg-[#f0f2f5] text-[#697386]'}`}>{statusLabel(status, endRequested)}</span></div>
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-7">{messages.length === 0 && !streaming && <div className="mx-auto mt-24 max-w-sm text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#edf2fb] text-[#2563eb]"><MessageIcon/></span><h2 className="mt-4 font-semibold">正在准备讨论</h2><p className="mt-2 text-sm leading-6 text-[#7a8495]">AI 主持人将先介绍研究背景，然后邀请参与者依次发言。</p></div>}{messages.map((message) => <ChatBubble key={message.id} message={message} participants={participants}/>)}{streaming && <StreamingBubble message={streaming} participants={participants}/>} {pending.length > 0 && <div className="mx-auto w-fit rounded-full bg-[#f0f3f7] px-3 py-1.5 text-xs text-[#6f798b]">{pending.length} 条研究员消息等待在当前发言后插入</div>}{status === 'analyzing' && <div className="mx-auto my-8 max-w-sm rounded-2xl bg-[#fff7e8] p-5 text-center"><BarChart3 className="mx-auto h-5 w-5 text-[#a3731f]"/><div className="mt-2 text-sm font-semibold">正在生成研究报告</div><div className="mt-1 text-xs text-[#8b7651]">{analysisStage}</div></div>}{status === 'completed' && <div className="mx-auto my-8 text-center"><div className="text-sm font-semibold">研究报告已生成</div><Link href={`/insights?r=${researchId}`} className="button-primary mt-3"><BarChart3 className="h-4 w-4"/> 查看洞察报告</Link></div>}{error && <div className="mx-auto rounded-xl bg-[#fff1f3] px-4 py-3 text-sm text-[#b33443]">{error}</div>}<div ref={bottomRef}/></div>
      {!['analyzing','completed'].includes(status) && <div className="border-t border-[#e7eaf0] bg-white/85 p-3 sm:p-4"><div className="mb-2 flex gap-2 overflow-x-auto pb-1">{QUICK_QUESTIONS.map((question) => <button key={question} onClick={() => sendResearcherMessage(question)} className="shrink-0 rounded-full border border-[#e1e5ec] bg-white px-3 py-1.5 text-xs text-[#657084] hover:bg-[#f6f8fb]">{question}</button>)}</div>{selectedMention && <div className="mb-2 flex w-fit items-center gap-1 rounded-full bg-[#edf3ff] px-2.5 py-1 text-xs text-[#2563eb]">@{participants.find((persona) => persona.id === selectedMention)?.name}<button onClick={() => setSelectedMention(undefined)} aria-label="移除提及"><X className="h-3 w-3"/></button></div>}<div className="relative flex items-end gap-2 rounded-2xl border border-[#dce1e9] bg-white p-2 shadow-sm focus-within:border-[#9ab9f7] focus-within:ring-4 focus-within:ring-[#2563eb]/10"><button onClick={() => setMentionOpen((value) => !value)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#697386] hover:bg-[#f1f3f6]" aria-label="提及参与者"><AtSign className="h-4 w-4"/></button>{mentionOpen && <div className="absolute bottom-14 left-0 z-20 w-56 rounded-2xl border border-[#e1e5ec] bg-white p-2 shadow-xl"><div className="px-2 py-1 text-[11px] font-semibold text-[#8a93a2]">选择下一位回应者</div>{participants.map((persona) => <button key={persona.id} onClick={() => { setSelectedMention(persona.id); setMentionOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-[#f3f6fa]"><Avatar persona={persona} size="sm"/>{persona.name}</button>)}</div>}<textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendResearcherMessage(input); } }} rows={1} placeholder="随时追加问题，Enter 发送，Shift + Enter 换行" className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none"/><button onClick={() => sendResearcherMessage(input)} disabled={!input.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#2563eb] text-white disabled:opacity-35" aria-label="发送"><Send className="h-4 w-4"/></button></div></div>}
    </section><aside className="hidden lg:block">{panel}</aside></div>{panelOpen && <div className="fixed inset-0 z-50 bg-black/20 lg:hidden" onClick={() => setPanelOpen(false)}><aside className="absolute right-0 top-0 h-full w-[min(86vw,340px)] bg-[#f7f8fa] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>{panel}</aside></div>}</div>;
}

function ChatBubble({ message, participants }: { message: SessionMessage; participants: ReturnType<typeof useStore.getState>['personas'] }) {
  const human = message.role === 'human_researcher';
  const moderator = message.role === 'ai_moderator';
  const persona = participants.find((item) => item.id === message.speakerId);
  const mentioned = participants.find((item) => item.id === message.mentionId);
  return <div className={`message-in flex gap-3 ${human ? 'justify-end' : 'justify-start'}`}>{!human && (moderator ? <Avatar name="AI" color="#172033"/> : <Avatar persona={persona}/>)}<div className={`max-w-[78%] ${human ? 'order-first text-right' : ''}`}><div className={`mb-1 flex items-center gap-2 text-[11px] text-[#818b9c] ${human ? 'justify-end' : ''}`}><span className="font-semibold text-[#4c576a]">{message.speakerName}</span>{moderator && <span className="rounded bg-[#edf1f7] px-1.5 py-0.5">主持人</span>}{message.role === 'persona' && <span>{EMOTION_LABEL[message.emotion]}</span>}</div><div className={`rounded-2xl px-4 py-3 text-left text-sm leading-6 ${human ? 'rounded-tr-md bg-[#2563eb] text-white' : moderator ? 'rounded-tl-md border border-[#dfe5ef] bg-[#f0f4fa] text-[#263247]' : 'rounded-tl-md border border-[#e3e7ed] bg-white text-[#2c3749] shadow-sm'}`}>{mentioned && <span className={`mr-1 font-semibold ${human ? 'text-white' : 'text-[#2563eb]'}`}>@{mentioned.name}</span>}{message.content}</div></div>{human && <Avatar name="你" color="#2563eb"/>}</div>;
}

function StreamingBubble({ message, participants }: { message: StreamingMessage; participants: ReturnType<typeof useStore.getState>['personas'] }) {
  const persona = participants.find((item) => item.id === message.speakerId);
  return <div className="flex gap-3"><Avatar persona={persona} name={message.role === 'ai_moderator' ? 'AI' : message.speakerName} color={message.role === 'ai_moderator' ? '#172033' : undefined}/><div className="max-w-[78%]"><div className="mb-1 text-[11px] font-semibold text-[#4c576a]">{message.speakerName} <span className="font-normal text-[#8c95a4]">正在输入…</span></div><div className="min-h-12 rounded-2xl rounded-tl-md border border-[#dfe4ec] bg-white px-4 py-3 text-sm leading-6 text-[#2c3749] shadow-sm">{message.content || <TypingDots/>}</div></div></div>;
}

function ParticipantPanel({ participants, messages, streamingId, onClose }: { participants: ReturnType<typeof useStore.getState>['personas']; messages: SessionMessage[]; streamingId?: string; onClose: () => void }) {
  return <div className="surface sticky top-20 p-4"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">参与者</h2><p className="mt-1 text-xs text-[#818b9c]">{participants.length} 位用户 Agent</p></div><button onClick={onClose} className="lg:hidden" aria-label="关闭"><X className="h-4 w-4"/></button></div><div className="mt-4 space-y-2">{participants.map((persona) => { const own = messages.filter((message) => message.role === 'persona' && message.speakerId === persona.id); const emotion: Emotion = own.at(-1)?.emotion ?? 'neutral'; const active = streamingId === persona.id; return <div key={persona.id} className={`flex items-center gap-3 rounded-2xl p-2.5 ${active ? 'bg-[#edf3ff]' : 'bg-white/60'}`}><div className="relative"><Avatar persona={persona}/><span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${active ? 'bg-[#22a06b]' : 'bg-[#c8ced8]'}`}/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{persona.name}</div><div className="truncate text-[11px] text-[#7c8698]">{active ? '正在发言' : `${EMOTION_LABEL[emotion]} · ${own.length} 次发言`}</div></div></div>; })}</div><div className="mt-5 border-t border-[#e5e8ee] pt-4"><div className="text-xs font-semibold text-[#596477]">会话规则</div><ul className="mt-2 space-y-2 text-[11px] leading-5 text-[#7c8697]"><li>· 所有 Agent 串行发言</li><li>· 研究员消息在当前发言后优先插入</li><li>· @ 指定对象将获得下一次回应</li></ul></div></div>;
}

function statusLabel(status: SessionStatus, endRequested: boolean) { if (endRequested) return '本条后结束'; return { ready: '准备中', running: '进行中', paused: '已暂停', analyzing: '分析中', completed: '已完成', error: '需要重试' }[status]; }
function TypingDots() { return <span className="inline-flex gap-1"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9aa4b4]"/><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9aa4b4] [animation-delay:120ms]"/><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9aa4b4] [animation-delay:240ms]"/></span>; }
function MessageIcon() { return <Menu className="h-5 w-5"/>; }

async function readEventStream(stream: ReadableStream<Uint8Array>, onEvent: (event: TurnStreamEvent) => void): Promise<TurnStreamEvent[]> {
  const reader = stream.getReader(); const decoder = new TextDecoder(); let buffer = ''; const events: TurnStreamEvent[] = [];
  while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const frames = buffer.split('\n'); buffer = frames.pop() ?? ''; for (const frame of frames) { if (!frame.startsWith('data: ')) continue; const event = JSON.parse(frame.slice(6)) as TurnStreamEvent; events.push(event); onEvent(event); } }
  return events;
}

export default function SessionPage() { return <Suspense fallback={<div className="surface h-[70vh] animate-pulse"/>}><SessionInner/></Suspense>; }
