import type { InsightReport, Persona, ResearchConfig, SessionMessage, TurnDecision } from '../types';

export function transcriptText(messages: SessionMessage[], limit = 16): string {
  return messages.slice(-limit).map((message) => `${message.speakerName}：${message.content}`).join('\n') || '（会话刚开始）';
}

export function leastTalkative(personas: Persona[], messages: SessionMessage[], excludeId?: string): Persona {
  const counts = new Map(personas.map((persona) => [persona.id, 0]));
  for (const message of messages) {
    if (message.role === 'persona') counts.set(message.speakerId, (counts.get(message.speakerId) ?? 0) + 1);
  }
  return [...personas]
    .filter((persona) => persona.id !== excludeId || personas.length === 1)
    .sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0))[0] ?? personas[0]!;
}

export function mockDecision(config: ResearchConfig, personas: Persona[], messages: SessionMessage[], forcedSpeakerId?: string): TurnDecision {
  const last = messages.at(-1);
  const forced = personas.find((persona) => persona.id === forcedSpeakerId);
  if (forced) return { type: 'persona', speakerId: forced.id, instruction: `直接回应${last?.speakerName ?? '研究员'}刚才的问题或观点。`, topic: topicFor(config, messages), replyToId: last?.id };
  if (messages.length === 0) return { type: 'moderator', speakerId: 'ai_moderator', instruction: `用不超过70字介绍研究目标，并抛出第一个开放问题：${config.outline[0] ?? '请大家谈谈第一印象'}`, topic: config.outline[0] ?? '第一印象' };
  if (last?.role === 'human_researcher' || last?.role === 'ai_moderator') {
    const target = leastTalkative(personas, messages);
    return { type: 'persona', speakerId: target.id, instruction: `回应${last.speakerName}刚才的问题，给出具体、真实的观点。`, topic: topicFor(config, messages), replyToId: last.id };
  }
  const personaTurns = messages.filter((message) => message.role === 'persona').length;
  const lastPersona = last?.role === 'persona' ? last.speakerId : undefined;
  if (config.format === 'one_on_one' || personaTurns % 4 === 0) {
    const outlineIndex = Math.min(config.outline.length - 1, Math.floor(personaTurns / Math.max(1, Math.ceil(config.maxTurns / Math.max(1, config.outline.length)))));
    const topic = config.outline[Math.max(0, outlineIndex)] ?? '进一步追问';
    return { type: 'moderator', speakerId: 'ai_moderator', instruction: `结合上一条回答自然追问，并推进到“${topic}”。只问一个开放问题。`, topic, replyToId: last?.id };
  }
  const target = leastTalkative(personas, messages, lastPersona);
  return { type: 'persona', speakerId: target.id, instruction: '主动补充、赞同或质疑刚才的观点，并结合自己的真实场景说明原因。', topic: topicFor(config, messages), replyToId: last?.id };
}

export function topicFor(config: ResearchConfig, messages: SessionMessage[]): string {
  const turns = messages.filter((message) => message.role === 'persona').length;
  const index = Math.min(config.outline.length - 1, Math.floor(turns / Math.max(1, Math.ceil(config.maxTurns / Math.max(1, config.outline.length)))));
  return config.outline[Math.max(0, index)] ?? '自由讨论';
}

export function mockPersonaText(persona: Persona, config: ResearchConfig, messages: SessionMessage[], instruction: string): string {
  const topic = topicFor(config, messages);
  const views = [
    `我会先看它能不能真正省时间。以我的习惯来说，功能多不是关键，最好打开就会用，而且日常清洁也别太麻烦。`,
    `价格会直接影响我的判断。如果核心体验稳定，我能接受一定溢价，但需要明确告诉我比普通产品多解决了什么问题。`,
    `我的第一反应是概念挺吸引人，不过我会担心联网、维护和长期可靠性。最好给出一个具体使用场景，而不只是功能列表。`,
    `从外观和分享体验看，我会愿意尝试。但如果 App 操作步骤很多，或者离开手机就不能正常使用，热情会很快下降。`,
  ];
  const seed = messages.filter((message) => message.role === 'persona').length + persona.name.charCodeAt(0);
  const prefix = instruction.includes('回应') ? '接着刚才的问题，' : `说到${topic}，`;
  return `${prefix}${views[seed % views.length]}`;
}

export function buildMockReport(config: ResearchConfig, personas: Persona[], messages: SessionMessage[]): InsightReport {
  const personaMessages = messages.filter((message) => message.role === 'persona');
  const quotes = personaMessages.slice(0, 4).map((message, index) => ({ text: message.content, speaker: message.speakerName, turn: index + 1 }));
  return {
    summary: `参与者围绕${config.product}的核心体验、使用门槛和价格进行了讨论。整体兴趣积极，但大家一致要求产品真正节省时间、降低操作与维护成本，并用清晰场景证明相对普通产品的价值。`,
    consensus: ['核心价值应聚焦省时与易用，而不是堆叠功能', '稳定性、清洁维护和离线可用性会显著影响购买', '价格需要与可感知的效率提升建立明确联系'],
    controversies: [{ topic: '智能功能的必要性', positions: personas.slice(0, 2).map((persona, index) => ({ name: persona.name, view: index === 0 ? '愿意为自动化体验付费' : '更看重基础功能与可靠性' })) }],
    findings: [
      { point: '预约与自动化只有在足够稳定时才构成核心卖点', severity: 'high', mentionedBy: personas.slice(0, 3).map((persona) => persona.name) },
      { point: '复杂 App 和清洁成本会快速抵消智能体验的吸引力', severity: 'high', mentionedBy: personas.slice(1, 4).map((persona) => persona.name) },
      { point: '设计感有助于首次尝试，但不足以支撑长期溢价', severity: 'medium', mentionedBy: personas.slice(-2).map((persona) => persona.name) },
    ],
    recommendations: ['用三个高频真实场景重写产品价值主张', '首版减少非必要设置，并确保核心功能可脱离 App 使用', '在价格测试中明确展示节省的时间与维护成本'],
    painPoints: [{ name: '操作复杂', impact: 86, frequency: 78 }, { name: '清洁维护', impact: 74, frequency: 72 }, { name: '价格溢价', impact: 79, frequency: 66 }, { name: '联网稳定性', impact: 68, frequency: 54 }],
    sentimentTimeline: personaMessages.map((message, index) => ({ turn: index + 1, sentiment: message.emotion === 'excited' ? 0.7 : message.emotion === 'resistant' ? -0.5 : 0.25 })),
    personaComparison: personas.map((persona, index) => ({ name: persona.name, stance: index % 2 === 0 ? '认可效率价值，但要求体验稳定' : '关注易用性与价格是否匹配', sentiment: index % 2 === 0 ? 0.45 : 0.15 })),
    quotes,
    rawMessages: messages,
  };
}
