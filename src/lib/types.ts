export type Emotion = 'curious' | 'resistant' | 'excited' | 'confused' | 'neutral';
export type ResearchMode = 'focus_group' | 'interview' | 'concept_test' | 'ab_compare';
export type SessionFormat = 'one_on_one' | 'group';
export type SessionStatus = 'ready' | 'running' | 'paused' | 'analyzing' | 'completed' | 'error';
export type SessionRole = 'human_researcher' | 'ai_moderator' | 'persona';

export interface Persona {
  id: string;
  name: string;
  age: number;
  gender: '男' | '女' | '其他';
  occupation: string;
  avatarColor: string;
  techSavviness: number;
  decisionStyle: '冲动型' | '理性型' | '从众型' | '谨慎型';
  communication: string;
  values: string;
  attitude: string;
  behavior: string;
  catchphrase?: string;
  backstory: string;
  projectId?: string;
  projectName?: string;
  createdAt: number;
}

export interface ResearchProject {
  id: string;
  productName: string;
  productDescription: string;
  researchGoal: string;
  researchMode: ResearchMode;
  personaIds: string[];
  outline: string[];
  stimulusA: string;
  stimulusB: string;
  maxTurns: number;
  createdAt: number;
  updatedAt: number;
}

export interface ResearchConfig {
  id: string;
  mode: ResearchMode;
  format: SessionFormat;
  goal: string;
  product: string;
  productDescription?: string;
  stimulusA?: string;
  stimulusB?: string;
  personaIds: string[];
  outline: string[];
  maxTurns: number;
  createdAt: number;
}

export interface SessionMessage {
  id: string;
  sequence: number;
  speakerId: string;
  speakerName: string;
  role: SessionRole;
  content: string;
  emotion: Emotion;
  mentionId?: string;
  replyToId?: string;
  timestamp: number;
}

export interface KeyFinding {
  point: string;
  severity: 'high' | 'medium' | 'low';
  mentionedBy: string[];
}

export interface PainPoint {
  name: string;
  impact: number;
  frequency: number;
}

export interface InsightReport {
  summary: string;
  consensus: string[];
  controversies: { topic: string; positions: { name: string; view: string }[] }[];
  findings: KeyFinding[];
  recommendations: string[];
  painPoints: PainPoint[];
  sentimentTimeline: { turn: number; sentiment: number }[];
  personaComparison: { name: string; stance: string; sentiment: number }[];
  quotes: { text: string; speaker: string; turn: number }[];
  rawMessages: SessionMessage[];
}

export interface SimulationRecord {
  id: string;
  config: ResearchConfig;
  messages: SessionMessage[];
  status: SessionStatus;
  participantTurns: number;
  currentTopic: string;
  mentionChain: number;
  report?: InsightReport;
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export interface LLMChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TurnDecision {
  type: 'moderator' | 'persona';
  speakerId: string;
  instruction: string;
  topic: string;
  replyToId?: string;
}

export interface TurnOutput {
  content: string;
  emotion: Emotion;
  willingness: number;
  references: string[];
  mentionId?: string;
}

export type TurnStreamEvent =
  | { type: 'message_start'; speakerId: string }
  | { type: 'message_delta'; text: string }
  | { type: 'message_end'; output: TurnOutput }
  | { type: 'analysis_progress'; stage: string }
  | { type: 'complete'; report: InsightReport }
  | { type: 'error'; message: string };

export const RESEARCH_MODE_LABEL: Record<ResearchMode, string> = {
  focus_group: '焦点小组',
  interview: '深度访谈',
  concept_test: '概念测试',
  ab_compare: 'A/B 对比',
};

export const MODE_DEFAULT_TURNS: Record<ResearchMode, number> = {
  focus_group: 20,
  interview: 10,
  concept_test: 16,
  ab_compare: 20,
};

export const EMOTION_LABEL: Record<Emotion, string> = {
  curious: '好奇', resistant: '保留', excited: '积极', confused: '困惑', neutral: '平静',
};

export function formatForMode(mode: ResearchMode): SessionFormat {
  return mode === 'interview' ? 'one_on_one' : 'group';
}
