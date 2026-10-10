import { Check, LockKeyhole, Settings2, ShieldCheck, X } from 'lucide-react';
import { AUTHOR_PRESET_ID, AUTHOR_PRESET_LABEL, CUSTOM_URL_LABEL, AUTHOR_MODEL, AUTHOR_REASONING_EFFORT } from '../../shared/modelOptions';
import { REASONING_EFFORTS } from '../../shared/errorDiagnostics';
import { parseReasoningEffort } from '../../shared/modelProtocol';
import type { ModelConfig, ModelPreset } from '../types';

const reasoningLabels = { none: '通道默认', minimal: '最少（minimal）', low: '低（low）', medium: '中（medium）', high: '高（high）', xhigh: '最高（xhigh）' };

export function ModelSettings({ config, presets, onChange, onClose, onSave }: {
  config: ModelConfig; presets: ModelPreset[]; onChange: (config: ModelConfig) => void;
  onClose: () => void; onSave: () => void;
}) {
  const author = presets.find(preset => preset.id === AUTHOR_PRESET_ID);
  const isAuthor = config.mode === 'preset';
  let validCustomUrl = false;
  try {
    const url = new URL(config.url);
    validCustomUrl = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { /* Incomplete input is not yet a usable endpoint. */ }
  const canSave = isAuthor || (validCustomUrl && config.model.trim().length > 0);

  return <div className="modal-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="model-modal" role="dialog" aria-modal="true" aria-labelledby="model-settings-title">
      <div className="modal-head">
        <div><span className="panel-kicker">AI CONNECTION</span><h2 id="model-settings-title">AI 模型设置</h2>
          <p>仅提供作者预设和自定义URL两种接入方式。</p></div>
        <button className="quiet-icon" onClick={onClose} aria-label="关闭模型设置"><X size={17}/></button>
      </div>
      <div className="model-mode-tabs">
        <button className={isAuthor ? 'active' : ''} aria-pressed={isAuthor}
          onClick={() => onChange({ ...config, mode: 'preset', presetId: AUTHOR_PRESET_ID })}>
          <ShieldCheck size={15}/>{AUTHOR_PRESET_LABEL}
        </button>
        <button className={!isAuthor ? 'active' : ''} aria-pressed={!isAuthor}
          onClick={() => onChange({ ...config, mode: 'custom' })}>
          <Settings2 size={15}/>{CUSTOM_URL_LABEL}
        </button>
      </div>
      {isAuthor ? <div className="selected-preset">
        <ShieldCheck size={18}/><div><strong>{AUTHOR_PRESET_LABEL}</strong>
          <small>模型：{author?.model || AUTHOR_MODEL} · URL和Key由后端配置</small></div>
      </div> : <div className="model-form">
        <label htmlFor="model-url">完整 URL</label>
        <input id="model-url" type="url" value={config.url} autoComplete="off" spellCheck={false}
          onChange={event => onChange({ ...config, url: event.target.value })}
          placeholder="https://你的通道域名/v1/chat/completions 或 /v1/responses"/>
        <label htmlFor="model-name">模型名称</label>
        <input id="model-name" value={config.model} autoComplete="off" spellCheck={false}
          onChange={event => onChange({ ...config, model: event.target.value })} placeholder="例如 gpt-6.1-sol"/>
        <label htmlFor="model-key">API Key</label>
        <input id="model-key" type="password" value={config.apiKey} autoComplete="off"
          onChange={event => onChange({ ...config, apiKey: event.target.value })} placeholder="你的通道Key"/>
        <div className="model-note"><ShieldCheck size={14}/>
          <span>浏览器直接调用你填写的URL；Key和资料不会经过我们的后端，不写入本地简历。接口必须支持浏览器跨域（CORS），无需后端域名白名单。</span>
        </div>
        {!canSave && <p className="code-safe">请填写有效的HTTP(S)地址和模型名称。</p>}
      </div>}
      <div className="model-reasoning">
        <label htmlFor="model-reasoning">思考强度</label>
        <select id="model-reasoning" value={isAuthor ? AUTHOR_REASONING_EFFORT : config.reasoningEffort ?? 'none'}
          disabled={isAuthor} aria-describedby="model-reasoning-note"
          onChange={event => onChange({ ...config, reasoningEffort: parseReasoningEffort(event.target.value) })}>
          {REASONING_EFFORTS.map(effort => <option key={effort} value={effort}>{reasoningLabels[effort]}</option>)}
        </select>
        <p id="model-reasoning-note">{isAuthor ? <><LockKeyhole size={13}/>作者预设固定为 high</> : '通道默认由模型服务决定；指定强度须由所选模型支持。'}</p>
      </div>
      <div className="modal-foot">
        <button className="ghost-button" onClick={onClose}>取消</button>
        <button className="apply-button" disabled={!canSave} onClick={onSave}><Check size={14}/>保存模型选择</button>
      </div>
    </section>
  </div>;
}
