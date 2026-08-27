import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  try {
    const res = await fetch(`${body.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${body.apiKey}`,
      },
      body: JSON.stringify({
        model: body.model,
        messages: [{ role: 'user', content: '回复"连接成功"四个字，不要其他内容。' }],
        max_tokens: 20,
        temperature: 0,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return Response.json({ ok: false, error: `HTTP ${res.status}：${text.slice(0, 120)}` }, { status: 200 });
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? '';
    return Response.json({ ok: true, reply: text });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : '未知错误' },
      { status: 200 },
    );
  }
}
