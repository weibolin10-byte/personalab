import { chatJSON, isMockMode } from '@/lib/llm/llm';
import { buildMockReport, transcriptText } from '@/lib/llm/session';
import type { InsightReport, LLMConfig, Persona, ResearchConfig, SessionMessage, TurnStreamEvent } from '@/lib/types';

interface AnalyzeBody { config: ResearchConfig; personas: Persona[]; messages: SessionMessage[]; llm: LLMConfig }

export async function POST(req: Request) {
  const body = (await req.json()) as AnalyzeBody;
  if (!body.config || !Array.isArray(body.messages)) return new Response('Invalid analysis', { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TurnStreamEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        send({ type: 'analysis_progress', stage: '正在梳理对话与关键主题' });
        let report: InsightReport;
        if (isMockMode(body.llm)) {
          await new Promise((resolve) => setTimeout(resolve, 350));
          send({ type: 'analysis_progress', stage: '正在提炼共识、争议与建议' });
          report = buildMockReport(body.config, body.personas, body.messages);
        } else {
          const raw = await chatJSON<Omit<InsightReport, 'rawMessages'>>(body.llm, [
            { role: 'system', content: '你是资深用户研究分析师。区分事实和推测，发现必须能被对话支持，建议必须具体可执行。只输出符合要求的 JSON。' },
            { role: 'user', content: `研究目标：${body.config.goal}\n产品：${body.config.product}\n完整对话：\n${transcriptText(body.messages, 200)}\n\n输出 JSON：{"summary":"200字内","consensus":[""],"controversies":[{"topic":"","positions":[{"name":"","view":""}]}],"findings":[{"point":"","severity":"high|medium|low","mentionedBy":[""]}],"recommendations":[""],"painPoints":[{"name":"","impact":0,"frequency":0}],"sentimentTimeline":[{"turn":1,"sentiment":0}],"personaComparison":[{"name":"","stance":"","sentiment":0}],"quotes":[{"text":"","speaker":"","turn":1}]}` },
          ], { temperature: 0.4 });
          report = { ...raw, rawMessages: body.messages };
        }
        send({ type: 'analysis_progress', stage: '报告已完成' });
        send({ type: 'complete', report });
      } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : '分析失败' });
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' } });
}
