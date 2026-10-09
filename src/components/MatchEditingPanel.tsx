import React from 'react';
import { Target, WandSparkles } from 'lucide-react';
import { containsQuotedText, getResumeEvidenceText } from '../../shared/contracts';
import type { ResumeVersion } from '../types';
import { evidenceNodeId, type MatchRequirement } from '../lib/matchEditing';
export function MatchEditingPanel({ version, onEdit, onView }: { version: ResumeVersion; onEdit: (item: MatchRequirement) => void; onView: () => void }): React.ReactElement {
  const gaps = version.report?.requirements.filter(item => item.status !== 'matched' || item.resumeEvidence?.some(entry => !evidenceNodeId(version.resume, entry.resumePath) || !containsQuotedText(getResumeEvidenceText(version.resume, entry.resumePath) ?? '', entry.resumeQuote))) ?? [];
  return <div className="match-editing-panel"><div className="match-editing-heading"><strong><Target size={14} />岗位匹配与修改</strong><button className="ghost-button" onClick={onView}>查看全部</button></div>
    {gaps.length ? <div className="match-gap-list">{gaps.map((item, i) => <article key={i}><strong>{item.requirement}</strong><p>{item.suggestion || '核对当前正文，补充已有经历中的相关依据。'}</p><button className="tool-button" onClick={() => onEdit(item)}><WandSparkles size={13} />用 AI 修改</button></article>)}</div> : <p>{version.report ? '暂无待补充项；可查看岗位依据并继续优化表述。' : '此版本没有岗位分析，请提供资料生成岗位版本。'}</p>}
  </div>;
}
