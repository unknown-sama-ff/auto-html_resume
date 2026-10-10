import { AUTHOR_PRESET_ID, AUTHOR_PRESET_LABEL, AUTHOR_MODEL, AUTHOR_BASE_URL, AUTHOR_REASONING_EFFORT } from '../shared/modelOptions.ts';

// Secrets stay in the server environment. Legacy multi-preset JSON is deliberately ignored.
export function getPresetDefinitions(environment = process.env) {
  return [{
    id: AUTHOR_PRESET_ID,
    label: AUTHOR_PRESET_LABEL,
    provider: 'OpenAI-compatible relay',
    baseUrl: (environment.CF_API_BASE_URL || AUTHOR_BASE_URL).trim(),
    protocol: (environment.CF_API_PROTOCOL || 'auto').trim(),
    reasoningEffort: AUTHOR_REASONING_EFFORT,
    model: (environment.CF_API_MODEL || AUTHOR_MODEL).trim(),
    keyEnv: 'CF_API_KEY',
    description: '由作者后端配置，无需填写API Key。',
  }];
}

export function publicPreset(preset) {
  return {
    id: preset.id, label: preset.label, provider: preset.provider,
    model: preset.model, baseUrl: preset.baseUrl, description: preset.description,
    reasoningEffort: AUTHOR_REASONING_EFFORT,
  };
}
