import { NextResponse } from 'next/server';
import { chatJSON } from '@/lib/llm/llm';
import type { LLMConfig } from '@/lib/types';

interface ReqBody {
  goal: string;
  product?: string;
  mode?: string;
  stimulus?: string;
  llm: LLMConfig;
}

const MOCK_OUTLINES = [
  '请各位先做个自我介绍，并说说平时是如何接触这类产品的。',
  '看到这个产品，第一印象是什么？最吸引你或最让你迟疑的点是？',
  '在什么场景下你会使用它？能讲一个具体的故事吗？',
  '它解决了你的什么问题？这个问题对你有多重要？',
  '哪些功能你觉得多余，哪些你希望有但没看到？',
  '如果让你为它定价，你觉得多少合适，为什么？',
  '你会把它推荐给谁？用一句话说服他。',
];

export async function POST(req: Request) {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: '请求体不是有效的 JSON' }, { status: 400 });
  }
  const { goal, product, mode, stimulus, llm } = body;
  if (!goal) return NextResponse.json({ error: '缺少研究目标' }, { status: 400 });

  if (!llm?.apiKey) {
    return NextResponse.json({ outline: MOCK_OUTLINES, mock: true });
  }

  try {
    const sys = '你是一位资深定性研究主持人，擅长设计焦点小组和深度访谈提纲。只返回 JSON：{"outline":["问题1","问题2",...]}，5-8 个问题，由浅入深，包含热身、核心体验、痛点、对比和收尾。';
    const userPrompt = `研究目标：${goal}
产品/概念：${product ?? '（未提供）'}
研究模式：${mode ?? '焦点小组'}
刺激物：${stimulus ?? '（无）'}

请设计 5-8 个讨论问题，中文，每个问题一句话，避免引导性和封闭式提问。`;
    const data = await chatJSON<{ outline: string[] }>(llm, [
      { role: 'system', content: sys },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.7 });
    const list = (data.outline ?? []).map((s) => String(s)).filter(Boolean).slice(0, 8);
    return NextResponse.json({ outline: list.length >= 3 ? list : MOCK_OUTLINES, mock: false });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
