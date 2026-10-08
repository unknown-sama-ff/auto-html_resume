import type { ResumeData } from './types';

export const DEFAULT_NODE_STYLE = {
  color: '#263633',
  fontSize: 14,
  fontWeight: 500 as const,
  marginBottom: 8,
  accent: false,
};

export const initialResume: ResumeData = {
  name: '林知行',
  role: '产品设计师 · 复杂系统的清晰表达者',
  location: '上海 · 可远程',
  email: 'lin.zhixing@example.com',
  phone: '+86 138 0000 2468',
  website: 'linzhixing.design',
  avatarDataUrl: undefined,
  summary: '拥有 4 年 B2B SaaS 与数据产品经验，擅长把复杂业务拆解成有节奏的体验系统。最近专注于 AI 工具和企业协作场景，用研究、原型与指标验证，让产品从“能用”走向“愿意持续使用”。',
  skills: [
    { label: 'Product strategy', level: '核心' },
    { label: 'UX research', level: '核心' },
    { label: 'Design systems', level: '熟练' },
    { label: 'Figma / Prototyping', level: '熟练' },
    { label: 'AI product thinking', level: '熟练' },
  ],
  projects: [
    {
      id: 'project-1',
      title: '智能简历工作台',
      meta: '个人项目 · 2024.08 — 至今',
      description: [
        '从资料采集、岗位解析到版本化编辑，搭建面向求职者的 AI 简历工作流。',
        '设计结构化内容模型与受控视觉系统，让 AI 改写保持证据可追溯、排版可打印。',
      ],
      stack: ['Product design', 'AI workflow', 'Design system'],
    },
    {
      id: 'project-2',
      title: '商家增长驾驶舱',
      meta: '星河科技 · 2023.03 — 2024.05',
      description: [
        '重构多角色数据分析路径，将 12 个常用指标收束为 3 个可行动的经营视图。',
        '推动研究、设计与工程共创，帮助试点商家将周报制作时间缩短约 40%。',
      ],
      stack: ['B2B SaaS', 'Data visualization', '0 → 1'],
    },
  ],
  experience: [
    {
      company: '星河科技',
      role: '高级产品设计师',
      period: '2022.07 — 2024.05',
      bullets: [
        '负责增长与数据产品线，从研究、定义到上线复盘建立端到端设计流程。',
        '与产品和工程共建组件库，覆盖 60+ 核心场景，减少重复设计与交付摩擦。',
      ],
    },
  ],
  education: [{ school: '同济大学', degree: '工业设计 · 学士', period: '2018 — 2022' }],
  awards: ['2023 · 中国设计智造大奖 · 入围', '2022 · 校级优秀毕业设计'],
  design: {
    accentColor: '#D96945',
    inkColor: '#263633',
    paperColor: '#FBF8F1',
    sectionGap: 24,
    avatarShape: 'circle',
  },
  nodeStyles: {
    'profile-name': { color: '#193B35', fontSize: 37, fontWeight: 800, marginBottom: 8, accent: false },
    'profile-role': { color: '#D96945', fontSize: 14, fontWeight: 700, marginBottom: 16, accent: false },
    summary: { color: '#4B5955', fontSize: 13, fontWeight: 500, marginBottom: 0, accent: false },
    'projects-section-title': { color: '#D96945', fontSize: 11, fontWeight: 800, marginBottom: 12, accent: true },
    'experience-section-title': { color: '#D96945', fontSize: 11, fontWeight: 800, marginBottom: 12, accent: true },
    'education-section-title': { color: '#D96945', fontSize: 11, fontWeight: 800, marginBottom: 12, accent: true },
    'skills-section-title': { color: '#D96945', fontSize: 11, fontWeight: 800, marginBottom: 12, accent: true },
    'awards-section-title': { color: '#D96945', fontSize: 11, fontWeight: 800, marginBottom: 12, accent: true },
    'project-1-title': { color: '#263633', fontSize: 17, fontWeight: 800, marginBottom: 5, accent: false },
    'project-2-title': { color: '#263633', fontSize: 17, fontWeight: 800, marginBottom: 5, accent: false },
    'project-1-description': { color: '#45514E', fontSize: 12, fontWeight: 500, marginBottom: 8, accent: false },
    'project-2-description': { color: '#45514E', fontSize: 12, fontWeight: 500, marginBottom: 8, accent: false },
  },
};

export const fallbackPresets = [
  {
    id: 'openai',
    label: 'OpenAI-compatible',
    provider: 'OpenAI-compatible',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    description: '使用后端 Railway 环境变量中的 API Key。',
  },
  {
    id: 'cf-api-fan',
    label: 'cf.api.fan · gpt-6.1-sol',
    provider: 'OpenAI-compatible relay',
    model: 'gpt-6.1-sol',
    baseUrl: 'https://cf.api.fan/v1',
    description: '使用 Railway 后端的 CF_API_KEY。',
  },
  {
    id: 'custom',
    label: '自定义模型',
    provider: 'Custom endpoint',
    model: '',
    baseUrl: '',
    description: '仅本次会话使用，不会把 Key 保存到本地。',
  },
];



