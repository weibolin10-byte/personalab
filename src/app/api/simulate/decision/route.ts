import { NextResponse } from 'next/server';
import { chatJSON, isMockMode } from '@/lib/llm/llm';
import { leastTalkative, mockDecision, topicFor, transcriptText } from '@/lib/llm/session';
import type { LLMConfig, Persona, ResearchConfig, SessionMessage, TurnDecision } from '@/lib/types';

interface DecisionBody {
  config: ResearchConfig;
  personas: Persona[];
  messages: SessionMessage[];
  llm: LLMConfig;
  forcedSpeakerId?: string;
  mentionChain?: number;
}

export async function POST(req: Request) {
  const body = (await req.json()) as DecisionBody;
  if (!body.config || !Array.isArray(body.personas) || body.personas.length === 0) {
    return NextResponse.json({ error: '研究配置或参与者无效' }, { status: 400 });
  }

  const forced = body.personas.find((persona) => persona.id === body.forcedSpeakerId);
  if (forced && (body.mentionChain ?? 0) < 3) {
    const last = body.messages.at(-1);
    return NextResponse.json({ type: 'persona', speakerId: forced.id, instruction: `回应${last?.speakerName ?? '研究员'}刚才直接提给你的问题或观点。`, topic: topicFor(body.config, body.messages), replyToId: last?.id } satisfies TurnDecision);
  }
  if (isMockMode(body.llm)) return NextResponse.json(mockDecision(body.config, body.personas, body.messages));

  if (body.messages.length === 0) {
    return NextResponse.json({ type: 'moderator', speakerId: 'ai_moderator', instruction: `简短介绍研究目标并提出第一个开放问题，优先从“${body.config.outline[0] ?? '第一印象'}”开始。`, topic: body.config.outline[0] ?? '第一印象' } satisfies TurnDecision);
  }

  const last = body.messages.at(-1)!;
  if (last.role === 'human_researcher') {
    const target = leastTalkative(body.personas, body.messages);
    return NextResponse.json({ type: 'persona', speakerId: target.id, instruction: '直接回应真人研究员刚才的问题，给出具体经历与真实判断。', topic: topicFor(body.config, body.messages), replyToId: last.id } satisfies TurnDecision);
  }

  try {
    const counts = body.personas.map((persona) => `${persona.name}(${persona.id})：${body.messages.filter((message) => message.role === 'persona' && message.speakerId === persona.id).length}次`).join('；');
    const data = await chatJSON<TurnDecision>(body.llm, [
      { role: 'system', content: `你是定性研究会话的发言调度器。每次只安排一个动作，避免同一参与者连续发言，兼顾相关性和发言公平。需要推进提纲、追问重要观点或收束跑题时安排 moderator，否则安排 persona。只能从给定人格 id 中选择 persona。只输出 JSON：{"type":"moderator|persona","speakerId":"id或ai_moderator","instruction":"给该角色的具体发言指令","topic":"当前话题","replyToId":"可选消息id"}` },
      { role: 'user', content: `研究目标：${body.config.goal}\n提纲：${body.config.outline.join('；')}\n会话形态：${body.config.format}\n参与者：${body.personas.map((persona) => `${persona.name}(${persona.id})`).join('、')}\n发言统计：${counts}\n当前话题：${topicFor(body.config, body.messages)}\n最近对话：\n${transcriptText(body.messages)}\n\n决定下一步，只安排一个角色。` },
    ], { temperature: 0.4 });
    const validPersona = body.personas.some((persona) => persona.id === data.speakerId);
    if (data.type === 'moderator') return NextResponse.json({ ...data, speakerId: 'ai_moderator' });
    if (validPersona) return NextResponse.json(data);
    const fallback = leastTalkative(body.personas, body.messages, last.role === 'persona' ? last.speakerId : undefined);
    return NextResponse.json({ type: 'persona', speakerId: fallback.id, instruction: data.instruction || '补充你的真实观点。', topic: data.topic || topicFor(body.config, body.messages), replyToId: last.id } satisfies TurnDecision);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '调度失败' }, { status: 500 });
  }
}
