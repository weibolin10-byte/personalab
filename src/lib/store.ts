'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LLMConfig, Persona, ResearchConfig, ResearchProject, SimulationRecord } from './types';
import { DEFAULT_PERSONAS } from './default-personas';
import { DEFAULT_PRODUCT_DESCRIPTION, DEFAULT_RESEARCH_GOAL } from './project-defaults';

export const DEFAULT_PROJECT_ID = 'proj_default';
export { DEFAULT_PRODUCT_DESCRIPTION, DEFAULT_RESEARCH_GOAL };

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultProject(now = Date.now()): ResearchProject {
  return { id: DEFAULT_PROJECT_ID, productName: '智能咖啡壶研究', productDescription: '一款支持预约冲煮、口味记忆和 App 远程控制的智能咖啡壶。', researchGoal: '了解不同用户对核心功能、操作复杂度和价格的真实看法。', researchMode: 'focus_group', personaIds: DEFAULT_PERSONAS.map((persona) => persona.id), outline: ['第一印象与使用场景', '最有价值的功能', '使用顾虑与阻碍', '价格接受度', '购买与推荐意愿'], stimulusA: '', stimulusB: '', maxTurns: 20, createdAt: now, updatedAt: now };
}

interface AppState {
  personas: Persona[];
  addPersona: (persona: Persona) => void;
  updatePersona: (id: string, patch: Partial<Persona>) => void;
  removePersona: (id: string) => void;
  resetPersonas: () => void;
  projects: ResearchProject[];
  activeProjectId: string;
  setActiveProject: (id: string) => void;
  addProject: (project: ResearchProject) => void;
  updateProject: (id: string, patch: Partial<ResearchProject>) => void;
  deleteProject: (id: string) => void;
  researches: ResearchConfig[];
  addResearch: (research: ResearchConfig) => void;
  deleteResearch: (id: string) => void;
  records: SimulationRecord[];
  upsertRecord: (record: SimulationRecord) => void;
  deleteRecord: (id: string) => void;
  llm: LLMConfig;
  setLLM: (patch: Partial<LLMConfig>) => void;
  isMockMode: () => boolean;
}

const DEFAULT_LLM: LLMConfig = { baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat', temperature: 0.7 };
type PersistedState = Pick<AppState, 'personas' | 'projects' | 'activeProjectId' | 'researches' | 'records' | 'llm'>;

function freshPersistedState(): PersistedState {
  return { personas: DEFAULT_PERSONAS, projects: [createDefaultProject()], activeProjectId: DEFAULT_PROJECT_ID, researches: [], records: [], llm: DEFAULT_LLM };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...freshPersistedState(),
      addPersona: (persona) => set((state) => ({ personas: [...state.personas, persona], projects: state.projects.map((project) => project.id === persona.projectId ? { ...project, personaIds: Array.from(new Set([...project.personaIds, persona.id])), updatedAt: Date.now() } : project) })),
      updatePersona: (id, patch) => set((state) => ({ personas: state.personas.map((persona) => persona.id === id ? { ...persona, ...patch } : persona) })),
      removePersona: (id) => set((state) => ({ personas: state.personas.filter((persona) => persona.id !== id), projects: state.projects.map((project) => ({ ...project, personaIds: project.personaIds.filter((personaId) => personaId !== id) })) })),
      resetPersonas: () => set({ personas: DEFAULT_PERSONAS }),
      setActiveProject: (id) => set({ activeProjectId: id }),
      addProject: (project) => set((state) => ({ projects: [project, ...state.projects], activeProjectId: project.id })),
      updateProject: (id, patch) => set((state) => ({ projects: state.projects.map((project) => project.id === id ? { ...project, ...patch, updatedAt: Date.now() } : project), personas: typeof patch.productName === 'string' ? state.personas.map((persona) => persona.projectId === id ? { ...persona, projectName: patch.productName } : persona) : state.personas })),
      deleteProject: (id) => set((state) => id === DEFAULT_PROJECT_ID ? state : ({ projects: state.projects.filter((project) => project.id !== id), personas: state.personas.filter((persona) => persona.projectId !== id), activeProjectId: state.activeProjectId === id ? DEFAULT_PROJECT_ID : state.activeProjectId })),
      addResearch: (research) => set((state) => ({ researches: [research, ...state.researches].slice(0, 50) })),
      deleteResearch: (id) => set((state) => ({ researches: state.researches.filter((research) => research.id !== id) })),
      upsertRecord: (record) => set((state) => ({ records: state.records.some((item) => item.id === record.id) ? state.records.map((item) => item.id === record.id ? record : item) : [record, ...state.records].slice(0, 80) })),
      deleteRecord: (id) => set((state) => ({ records: state.records.filter((record) => record.id !== id) })),
      setLLM: (patch) => set((state) => ({ llm: { ...state.llm, ...patch } })),
      isMockMode: () => get().llm.apiKey.trim().length === 0,
    }),
    { name: 'personalab-storage', version: 3, migrate: (persisted, fromVersion) => fromVersion < 3 ? freshPersistedState() : (persisted as PersistedState), partialize: (state): PersistedState => ({ personas: state.personas, projects: state.projects, activeProjectId: state.activeProjectId, researches: state.researches, records: state.records, llm: state.llm }) },
  ),
);

export const useStore = useAppStore;
