import { NextResponse } from 'next/server';
import { chatJSON } from '@/lib/llm/llm';
import type { LLMConfig, Persona } from '@/lib/types';
import { AVATAR_COLORS, DEFAULT_PERSONAS } from '@/lib/default-personas';
import { DEFAULT_PRODUCT_DESCRIPTION, DEFAULT_RESEARCH_GOAL } from '@/lib/project-defaults';

interface ReqBody {
  product: string;
  description?: string;
  goal?: string;
  count?: number;
  llm: LLMConfig;
}

interface GenPersona {
  name: string;
  age: number;
  gender: string;
  occupation: string;
  techSavviness: number;
  decisionStyle: string;
  communication: string;
  values: string;
  attitude: string;
  behavior: string;
  catchphrase: string;
  backstory: string;
  painPoint: string;
}

export async function POST(req: Request) {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: '请求体不是有效的 JSON' }, { status: 400 });
  }
  const { product, description, goal, count, llm } = body;
  if (!product) return NextResponse.json({ error: '缺少产品名称' }, { status: 400 });
  const n = Math.min(6, Math.max(3, count ?? 5));

  // 默认占位文案视为「未填写」，避免把占位符原文喂给模型
  const cleanDescription =
    description && description.trim() !== DEFAULT_PRODUCT_DESCRIPTION ? description.trim() : '';
  const cleanGoal = goal && goal.trim() !== DEFAULT_RESEARCH_GOAL ? goal.trim() : '';

  // Mock 模式：基于默认人格 + 产品描述微调
  if (!llm?.apiKey) {
    const mock: Persona[] = DEFAULT_PERSONAS.slice(0, n).map((p, idx) => ({
      ...p,
      id: `p_${Date.now()}_${idx}`,
      occupation: p.occupation,
      catchphrase: p.catchphrase,
      backstory: `${p.backstory} 面对「${product}」${cleanDescription ? '（' + cleanDescription + '）' : ''}，${p.attitude}。`,
      avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length]!,
      createdAt: Date.now(),
    }));
    return NextResponse.json({ personas: mock, mock: true });
  }

  try {
    const sys = `你是一位资深用户研究专家。根据给定的产品和研究目标，设计 ${n} 个差异化、真实可信的目标用户人格。他们应当在年龄、性别、职业、技术接受度、消费力、决策风格上形成互补，能够代表该产品的典型用户群。只返回 JSON：{"personas":[{...}]}`;
    const userPrompt = `产品：${product}
产品描述：${cleanDescription || '（未填写）'}
研究目标：${cleanGoal || '（未填写）'}

为每个人格输出字段：name, age(数字), gender("男"/"女"), occupation, techSavviness(1-5 整数), decisionStyle, communication, values, attitude, behavior, catchphrase(有特色的口头禅), backstory(80-150 字，含与该产品相关的经历/痛点/使用习惯), painPoint(对该产品最在意的一个痛点或期待)。

要求人格之间差异明显，不要都设定成年轻高收入人群；至少包含一位中老年或保守型用户。`;

    const data = await chatJSON<{ personas: GenPersona[] }>(llm, [
      { role: 'system', content: sys },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.85 });

    const list: Persona[] = (data.personas ?? []).slice(0, n).map((g, idx) => ({
      id: `p_ai_${Date.now()}_${idx}`,
      name: String(g.name ?? `用户${idx + 1}`).slice(0, 20),
      age: clampInt(g.age, 16, 80),
      gender: g.gender === '女' ? '女' : '男',
      occupation: String(g.occupation ?? '未填写').slice(0, 30),
      avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length]!,
      techSavviness: clampInt(g.techSavviness, 1, 5),
      decisionStyle: normalizeDecision(g.decisionStyle),
      communication: String(g.communication ?? '平和'),
      values: String(g.values ?? ''),
      attitude: String(g.attitude ?? ''),
      behavior: String(g.behavior ?? ''),
      catchphrase: String(g.catchphrase ?? '').slice(0, 40),
      backstory: String(g.backstory ?? ''),
      createdAt: Date.now(),
    }));

    return NextResponse.json({ personas: list, mock: false });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return Math.round((min + max) / 2);
  return Math.max(min, Math.min(max, n));
}

function normalizeDecision(s: unknown): Persona['decisionStyle'] {
  const v = String(s ?? '');
  if (v.includes('冲动')) return '冲动型';
  if (v.includes('理性') || v.includes('分析')) return '理性型';
  if (v.includes('从众') || v.includes('跟随')) return '从众型';
  if (v.includes('谨慎') || v.includes('保守')) return '谨慎型';
  return '理性型';
}
