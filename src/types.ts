export type NodeKind =
  | 'page'
  | 'name'
  | 'role'
  | 'contact'
  | 'avatar'
  | 'summary'
  | 'section-title'
  | 'project-title'
  | 'project-description'
  | 'experience'
  | 'education'
  | 'skills'
  | 'awards';

export type NodeStyle = {
  color?: string;
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700 | 800;
  marginBottom?: number;
  accent?: boolean;
};

export type Project = {
  id: string;
  title: string;
  meta: string;
  description: string[];
  stack: string[];
};

export type ResumeData = {
  name: string;
  role: string;
  location: string;
  email: string;
  phone: string;
  website: string;
  avatarDataUrl?: string;
  summary: string;
  skills: { label: string; level: string }[];
  projects: Project[];
  experience: { company: string; role: string; period: string; bullets: string[] }[];
  education: { school: string; degree: string; period: string }[];
  awards: string[];
  design: {
    accentColor: string;
    inkColor: string;
    paperColor: string;
    sectionGap: number;
    avatarShape: 'circle' | 'square';
  };
  nodeStyles: Record<string, NodeStyle>;
};

export type ResumeVersion = {
  id: string;
  title: string;
  role: string;
  updatedAt: string;
  accent: string;
  status: 'active' | 'draft' | 'archived';
};

export type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  meta?: string;
};

export type SelectionMeta = {
  id: string;
  label: string;
  breadcrumb: string;
  kind: NodeKind;
  path: string;
  content: string;
  style: Required<NodeStyle>;
  code: string;
};

export type EditPatch = {
  id: string;
  targetNodeId: string;
  operation: 'setStyle' | 'rewriteText' | 'setTheme';
  path: string;
  value: string | number | boolean;
  reason: string;
  requiresConfirmation: boolean;
  preview: string;
};

export type ModelMode = 'preset' | 'custom';

export type ModelConfig = {
  mode: ModelMode;
  presetId: string;
  url: string;
  apiKey: string;
  model: string;
};

export type ModelPreset = {
  id: string;
  label: string;
  provider: string;
  model: string;
  baseUrl: string;
  description: string;
};

export type PersistedAppState = {
  resume: ResumeData;
  activeVersionId: string;
  versions: ResumeVersion[];
  messages: ChatMessage[];
  past: ResumeData[];
  future: ResumeData[];
};


