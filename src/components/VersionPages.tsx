import { ChevronRight, History, Target, WandSparkles } from 'lucide-react';
import type { ResumeVersion, EditOperation, MatchReport, ResumeData } from '../types';
import { containsQuotedText, getResumeEvidenceText } from '../../shared/contracts';
import { defaultRequirementNodeId, evidenceNodeId, type MatchRequirement } from '../lib/matchEditing';

const labels = { matched: '有材料依据', partial: '部分匹配', missing: '待补充' };
type ResumeEvidenceItem = NonNullable<MatchReport['requirements'][number]['resumeEvidence']>[number];

function ResumeEvidence({ item, resume, onEdit }: { item: ResumeEvidenceItem; resume: ResumeData; onEdit: (nodeId: string) => void }) {
  const current = getResumeEvidenceText(resume, item.resumePath);
  const nodeId = evidenceNodeId(resume, item.resumePath);
  const changed = !current || !containsQuotedText(current, item.resumeQuote);
  return <div className="resume-evidence">
    <p><b>原始依据{item.sourceType === 'image' ? '（资料图片，请核对识别）' : ''}：</b>{item.sourceQuote}</p>
    <p><b>简历中的对应描述：</b>{item.resumeQuote}</p>
    {changed && <small>当前正文已变化，这段描述来自生成时，请重新核对。</small>}
    {!nodeId && !changed && <small>对应栏目已隐藏或移除，请在工作台选择其他内容进行修改。</small>}
    {nodeId && <button className="ghost-button" type="button" onClick={() => onEdit(nodeId)}>编辑对应描述</button>}
  </div>;
}

export function MatchPage({ version, onBack, onEditRequirement }: {
  version: ResumeVersion;
  onBack: () => void;
  onEditRequirement: (item: MatchRequirement, targetNodeId?: string) => void;
}) {
  const report = version.report;
  const total = report?.requirements.length ?? 0;
  const matched = report?.requirements.filter(item => item.status === 'matched').length ?? 0;
  return <div className="subpage match-page">
    <div className="subpage-head">
      <div><span className="panel-kicker">ROLE FIT</span><h1>岗位匹配</h1><p>{version.title} · {version.isDemo ? '示例分析' : '来自当前版本生成时的岗位分析'}</p></div>
      <button className="outline-button" onClick={onBack}><ChevronRight size={14} className="rotate-back"/>返回编辑</button>
    </div>
    <div className="match-overview">
      <Target size={32}/>
      <div className="match-overview-copy">
        <span className="match-badge">{matched} / {total} 项要求有明确依据</span><h2>{version.role}</h2>
        <p>{report?.summary ?? '此旧版没有真实岗位分析，请从首页重新生成。'}</p>
        <small>这是生成时的材料分析。可把岗位要求和建议带到工作台，用 AI 修改选中内容；正文编辑后，原始报告仍保留供核对。</small>
      </div>
    </div>
    <div className="requirements-list">{report?.requirements.map((item, index) => {
      const changed = item.resumeEvidence?.some(entry => {
        const current = getResumeEvidenceText(version.resume, entry.resumePath);
        return !evidenceNodeId(version.resume, entry.resumePath) || !current || !containsQuotedText(current, entry.resumeQuote);
      });
      return <article className={'analysis-card requirement-' + item.status} key={index}>
        <div className="requirement-head"><h3>{item.requirement}</h3><span>{labels[item.status]}</span></div>
        <p><b>依据：</b>{item.evidence || '目前材料没有相应证据。'}</p>
        {item.resumeEvidence?.map((entry, evidenceIndex) => <ResumeEvidence key={evidenceIndex} item={entry} resume={version.resume} onEdit={nodeId => onEditRequirement(item, nodeId)}/>)}
        {item.suggestion && <p><b>建议：</b>{item.suggestion}</p>}
        {changed && <p className="match-stale-notice">对应正文已修改或栏目已移除，匹配状态仍来自生成时，请核对当前内容。</p>}
        <button className="outline-button" type="button" onClick={() => onEditRequirement(item, defaultRequirementNodeId(version.resume, item) ?? undefined)}><WandSparkles size={14}/>用 AI 修改</button>
      </article>;
    })}</div>
    {version.warnings.length > 0 && <div className="analysis-card"><h3>需要确认的信息</h3><ul>{version.warnings.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
  </div>;
}
export function HistoryPage({version,onBack,onRestore}:{version:ResumeVersion;onBack:()=>void;onRestore:(op:EditOperation)=>void}){
  return <div className="subpage history-page"><div className="subpage-head"><div><span className="panel-kicker">REVISION LOG</span><h1>修改历史</h1><p>只显示 {version.title} 的记录，恢复不会影响其他版本。</p></div><button className="outline-button" onClick={onBack}>返回编辑</button></div><div className="history-summary"><div><strong>{version.past.length}</strong><span>可撤销修改</span></div><div><strong>{version.history.length}</strong><span>历史记录（保留最近40条）</span></div><div><strong>{version.messages.length}</strong><span>编辑对话</span></div></div>
  {version.history.length===0?<div className="empty-history"><History size={28}/><h2>还没有修改记录</h2><p>在工作台保存内容或应用AI修改后，这里会记录修改前后状态。</p><button className="outline-button" onClick={onBack}>开始编辑</button></div>:<div className="history-list">{version.history.slice().reverse().map((op,i)=><article className="history-item" key={op.id}><span className="history-index">{String(i+1).padStart(2,'0')}</span><div><strong>{op.label}</strong><small>{new Date(op.createdAt).toLocaleString('zh-CN')} · {op.source==='ai'?'AI修改':op.source==='restore'?'恢复操作':'手动编辑'}</small><details><summary>查看修改前后</summary><div className="history-diff"><pre>{JSON.stringify(op.before,null,2)}</pre><pre>{JSON.stringify(op.after,null,2)}</pre></div></details><button className="outline-button" onClick={()=>onRestore(op)}>恢复到此修改之后</button></div></article>)}</div>}
  {version.messages.length>0&&<section className="history-conversations"><h2>编辑对话</h2>{version.messages.map(m=><div className="history-item" key={m.id}><span>{m.role==='user'?'你':'AI'}</span><p>{m.content}</p></div>)}</section>}</div>;
}
