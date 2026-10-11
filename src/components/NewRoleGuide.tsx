import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';

export function NewRoleGuide({ title, onBack, onJob, busy }: { title: string; onBack: () => void; onJob: () => void; busy: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.scrollIntoView({ block: 'start' });
    heading.current?.focus({ preventScroll: true });
  }, []);
  return <section className="new-role-guide" aria-label="新岗位简历创建引导">
    <button className="ghost-button new-role-back" disabled={busy} onClick={onBack}><ArrowLeft size={14}/>返回原简历</button>
    <div className="eyebrow-ui"><CheckCircle2 size={15}/>个人资料已带入</div>
    <h1 ref={heading} tabIndex={-1}>为新岗位创建简历</h1>
    <p>已从「<strong>{title}</strong>」带入资料、模板和已有头像。核对下方资料，再填写新岗位要求，生成一份独立简历。原简历会继续保留。</p>
    <ol className="new-role-steps">
      <li><CheckCircle2 size={17}/><span>确认已带入的资料</span></li>
      <li aria-current="step"><span className="step-number">2</span><span>填写新岗位要求</span></li>
      <li><span className="step-number">3</span><span>生成新岗位简历</span></li>
    </ol>
    <button className="primary-button" disabled={busy} onClick={onJob}>填写新岗位要求<ArrowRight size={15}/></button>
  </section>;
}
