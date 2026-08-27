import type { LLMConfig } from '../types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 调用 OpenAI 兼容的 chat completions（非流式），解析 JSON。
 * 处理 DeepSeek 等模型的"累积型 delta"问题的非流式版本：直接取 message.content。
 */
export async function chatJSON<T>(
  cfg: LLMConfig,
  messages: ChatMessage[],
  opts: { temperature?: number; json?: boolean } = {},
): Promise<T> {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const payload: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: opts.temperature ?? cfg.temperature ?? 0.7,
    frequency_penalty: 0.3,
  };
  if (opts.json !== false) payload.response_format = { type: 'json_object' };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  };

  let res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  // 兼容性重试：部分 OpenAI 兼容网关（如 new-api / 各类反代）不接受
  // response_format 参数，会以 400/422 拒绝；去掉该字段再试一次，
  // 返回内容仍由 parseJSONLoose 做宽松解析。
  if (!res.ok && payload.response_format && (res.status === 400 || res.status === 422)) {
    delete payload.response_format;
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  }

  if (!res.ok) {
    throw new Error(`LLM 请求失败 ${res.status}：${await readProviderError(res)}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? '';
  return parseJSONLoose<T>(content);
}

/** 提取 OpenAI 兼容网关的错误信息（尽量取 error.message 字段）。 */
async function readProviderError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const json = JSON.parse(text) as {
      error?: { message?: string } | string;
    };
    const msg = typeof json.error === 'string' ? json.error : json.error?.message;
    if (msg) return msg.slice(0, 300);
  } catch {
    // 非 JSON 错误体，走下面的原文
  }
  return text.slice(0, 300) || '未知错误';
}

/**
 * 流式 chat，以 SSE 形式回调文本增量。
 * DeepSeek 的 delta.content 可能是累积型（整段重复），
 * 这里用 emittedText 累计器 + 前缀检测，确保只回调真正新增的部分。
 */
export async function streamChat(
  cfg: LLMConfig,
  messages: ChatMessage[],
  onDelta: (delta: string, full: string) => void,
  opts: { temperature?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: opts.temperature ?? cfg.temperature ?? 0.7,
      frequency_penalty: 0.3,
      stream: true,
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM 流式请求失败 ${res.status}：${text.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let emittedText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload) as {
          choices: { delta?: { content?: string } }[];
        };
        const piece = json.choices?.[0]?.delta?.content;
        if (typeof piece !== 'string' || piece.length === 0) continue;
        full += piece;
        // 累积型 delta 处理：若新 full 以已发出内容开头，只发增量；
        // 否则若 piece 是之前内容的重复拼接，按 full 做去重。
        if (full.length > emittedText.length && full.startsWith(emittedText)) {
          const delta = full.slice(emittedText.length);
          emittedText = full;
          onDelta(delta, full);
        } else if (piece.startsWith(emittedText)) {
          const delta = piece.slice(emittedText.length);
          emittedText = piece;
          full = piece;
          if (delta) onDelta(delta, full);
        } else if (!emittedText) {
          emittedText = full;
          onDelta(full, full);
        }
      } catch {
        // 忽略无法解析的碎片
      }
    }
  }
  return full;
}

/** 宽松解析 JSON：剥除 ```json 代码块包裹。 */
export function parseJSONLoose<T>(text: string): T {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // 尝试直接解析
  try {
    return JSON.parse(t) as T;
  } catch {
    // 尝试截取第一个 { 到最后一个 }
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(t.slice(start, end + 1)) as T;
    }
    throw new Error('无法解析 LLM 返回的 JSON：' + t.slice(0, 200));
  }
}

export function isMockMode(cfg: LLMConfig): boolean {
  return !cfg.apiKey || cfg.apiKey.trim() === '';
}
