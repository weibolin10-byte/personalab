import { streamChat, isMockMode, parseJSONLoose } from '@/lib/llm/llm';
import { mockPersonaText, transcriptText } from '@/lib/llm/session';
import type { LLMConfig, Persona, ResearchConfig, SessionMessage, TurnDecision, TurnOutput, TurnStreamEvent } from '@/lib/types';

interface TurnBody {
  config: ResearchConfig;
  personas: Persona[];
  messages: SessionMessage[];
  decision: TurnDecision;
  llm: LLMConfig;
}

export async function POST(req: Request) {
  const body = (await req.json()) as TurnBody;
  const speaker = body.personas.find((persona) => persona.id === body.decision.speakerId);
  if (!body.config || (body.decision.type === 'persona' && !speaker)) return new Response('Invalid turn', { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TurnStreamEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        send({ type: 'message_start', speakerId: body.decision.speakerId });
        if (isMockMode(body.llm)) {
          const content = body.decision.type === 'moderator'
            ? mockModeratorText(body.config, body.messages, body.decision)
            : mockPersonaText(speaker!, body.config, body.messages, body.decision.instruction);
          for (const char of Array.from(content)) {
            send({ type: 'message_delta', text: char });
            await new Promise((resolve) => setTimeout(resolve, 8));
          }
          const mentionId = body.decision.type === 'persona' && body.config.format === 'group' && body.messages.filter((message) => message.role === 'persona').length % 5 === 3
            ? body.personas.find((persona) => persona.id !== speaker!.id)?.id
            : undefined;
          send({ type: 'message_end', output: { content, emotion: body.decision.type === 'moderator' ? 'neutral' : 'curious', willingness: 0.62, references: [body.decision.topic], mentionId } });
        } else if (body.decision.type === 'moderator') {
          let content = '';
          await streamChat(body.llm, [
            { role: 'system', content: '你是一位专业、自然的用户研究主持人。只说对参与者可见的话，不解释内部决策。每次最多80字，只提出一个开放问题，避免诱导。' },
            { role: 'user', content: `研究目标：${body.config.goal}\n产品：${body.config.product}\n当前话题：${body.decision.topic}\n最近对话：\n${transcriptText(body.messages)}\n\n你的任务：${body.decision.instruction}` },
          ], (delta) => { content += delta; send({ type: 'message_delta', text: delta }); }, { temperature: 0.6, signal: req.signal });
          send({ type: 'message_end', output: { content: content.trim(), emotion: 'neutral', willingness: 1, references: [body.decision.topic] } });
        } else {
          const validIds = body.personas.filter((persona) => persona.id !== speaker!.id).map((persona) => persona.id);
          let raw = '';
          let visible = '';
          await streamChat(body.llm, [
            { role: 'system', content: `你正在扮演真实目标用户。必须完全代入角色，不要说“作为AI”。\n姓名：${speaker!.name}，${speaker!.age}岁，${speaker!.occupation}\n价值观：${speaker!.values}\n态度：${speaker!.attitude}\n行为：${speaker!.behavior}\n沟通风格：${speaker!.communication}\n产品：${body.config.product}\n研究目标：${body.config.goal}\n只输出 JSON：{"content":"口语化发言，60-160字","emotion":"curious|resistant|excited|confused|neutral","willingness":0到1,"references":["关键词"],"mentionId":"可选，只能是${validIds.join('|')}之一或空字符串"}。最多 @ 一个人；只有确实想邀请对方回应时才填写 mentionId。` },
            { role: 'user', content: `最近对话：\n${transcriptText(body.messages)}\n\n现在请：${body.decision.instruction}` },
          ], (_delta, full) => {
            raw = full;
            const extracted = extractVisibleContent(full);
            if (extracted.length > visible.length) {
              const delta = extracted.slice(visible.length);
              visible = extracted;
              send({ type: 'message_delta', text: delta });
            }
          }, { temperature: 0.8, signal: req.signal });
          const parsed = parseJSONLoose<Partial<TurnOutput>>(raw);
          const content = String(parsed.content || visible || '我需要再想一想。');
          if (!visible && content) send({ type: 'message_delta', text: content });
          const mentionId = typeof parsed.mentionId === 'string' && validIds.includes(parsed.mentionId) ? parsed.mentionId : undefined;
          send({ type: 'message_end', output: { content, emotion: parsed.emotion ?? 'neutral', willingness: typeof parsed.willingness === 'number' ? parsed.willingness : 0.5, references: Array.isArray(parsed.references) ? parsed.references : [], mentionId } });
        }
      } catch (error) {
        if (!req.signal.aborted) send({ type: 'error', message: error instanceof Error ? error.message : '发言生成失败' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}

function extractVisibleContent(raw: string): string {
  const match = raw.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
  if (!match) return '';
  try { return JSON.parse(`"${match[1]}"`) as string; } catch { return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'); }
}

function mockModeratorText(config: ResearchConfig, messages: SessionMessage[], decision: TurnDecision): string {
  if (messages.length === 0) return `欢迎参加这次关于“${config.product}”的研究。我们想了解大家真实的使用判断。先从${decision.topic}开始，你的第一反应是什么？`;
  const last = messages.at(-1);
  return `${last?.speakerName ? `谢谢${last.speakerName}。` : ''}接下来想具体聊聊${decision.topic}：能结合一个真实场景，说说你为什么会这样判断吗？`;
}
