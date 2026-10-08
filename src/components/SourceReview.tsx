import { useState } from 'react';
import { appendCustomSection, unmatchedSourceLines } from '../lib/sourceReview';
import type { ResumeData } from '../types';

export function SourceReview({ profileText, resume, onChange }: { profileText: string; resume: ResumeData; onChange: (resume: ResumeData, label: string) => void }) {
  const [selected,setSelected]=useState<string[]>([]), [title,setTitle]=useState('补充信息'), [content,setContent]=useState(''), [error,setError]=useState('');
  const unmatched=unmatchedSourceLines(profileText,resume);
  const chosen=selected.filter(line=>unmatched.includes(line));
  function add(items:string[], label:string) {
    try { onChange(appendCustomSection(resume,title,items),label);setSelected([]);setContent('');setError(''); } catch(e) { setError(e instanceof Error?e.message:'添加失败'); }
  }
  return <details className="source-review"><summary>原文核对与补充栏目 {profileText && <span>· {unmatched.length} 条原句待核对</span>}</summary><div className="source-review-body">
    <p>{profileText?'以下原句未在当前简历中找到。AI改写可能产生误报，请核对后再补回。完整原文仅保存在本浏览器。':'此版本没有保存原文；可重新上传生成，或在下方手动补充栏目。'}</p>
    {profileText && <><details className="source-original"><summary>查看完整提取原文</summary><pre>{profileText}</pre></details>{unmatched.length>0?<><button className="ghost-button" type="button" onClick={()=>setSelected(chosen.length===unmatched.length?[]:unmatched)}> {chosen.length===unmatched.length?'取消全选':'选择全部待核对原句'}</button><div className="source-line-list">{unmatched.map(line=><label key={line}><input type="checkbox" checked={chosen.includes(line)} onChange={e=>setSelected(e.target.checked?[...selected,line]:selected.filter(item=>item!==line))}/><span>{line}</span></label>)}</div></>:<p>已找到所有可核对原句；仍建议查看原文检查细节。</p>}</>}
    <label className="input-label">栏目名称<input aria-label="补充栏目名称" value={title} maxLength={195} onChange={e=>setTitle(e.target.value)}/></label>
    {chosen.length>0&&<button className="outline-button" onClick={()=>add(chosen,'从原文补回信息')}>将 {chosen.length} 条原文加入简历</button>}
    <label className="input-label">手动补充内容<textarea aria-label="补充栏目内容" value={content} maxLength={45000} rows={3} onChange={e=>setContent(e.target.value)} placeholder="每行一条，可添加课程、研究、语言、志愿活动等内容。"/></label><button className="outline-button" disabled={!content.trim()} onClick={()=>add(content.split('\n'),'新增自定义栏目')}>添加栏目</button>
    {resume.customSections.length>0&&<div className="custom-section-list">{resume.customSections.map(item=><div key={item.id}><span>{item.title}</span><button className="ghost-button" aria-label={`删除栏目 ${item.title}`} onClick={()=>onChange({...resume,customSections:resume.customSections.filter(section=>section.id!==item.id)},`删除栏目 ${item.title}`)}>删除</button></div>)}</div>}
    {error&&<p role="alert">{error}</p>}
  </div></details>;
}
