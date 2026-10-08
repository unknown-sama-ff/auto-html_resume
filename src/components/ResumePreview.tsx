import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { CircleUserRound, MapPin, AtSign, Link2, Phone } from 'lucide-react';
import type { ResumeData } from '../types';
export function ResumePreview({ resume, selectedNodeId='', onSelect, scale=1, interactive=true }: { resume: ResumeData; selectedNodeId?: string; onSelect?: (id:string)=>void; scale?: number; interactive?: boolean }) {
  const ref=useRef<HTMLDivElement>(null); const [height,setHeight]=useState(1123);
  useLayoutEffect(()=>{const element=ref.current;if(!element)return;const observer=new ResizeObserver(()=>setHeight(element.offsetHeight));observer.observe(element);return()=>observer.disconnect();},[]);
  function node(id:string, fontSize=12): { className:string; style:CSSProperties; 'data-node-id':string; tabIndex?:number; onClick?:()=>void; onKeyDown?:(event:React.KeyboardEvent<HTMLElement>)=>void } {
    const s=resume.nodeStyles[id];
    return { className:`resume-node ${interactive && selectedNodeId===id?'is-selected':''}`, 'data-node-id':id,
      style:{color:resume.nodeStyles.page?.color??s?.color,fontSize:(s?.fontSize??fontSize)*((resume.nodeStyles.page?.fontSize??14)/14),fontWeight:s?.fontWeight,marginBottom:s?.marginBottom,...(s?.accent?{borderLeft:`2px solid ${resume.design.accentColor}`,paddingLeft:8}:s?.accent===false?{borderLeft:'none'}:{})},
      ...(interactive?{tabIndex:0,onClick:()=>onSelect?.(id),onKeyDown:(event:React.KeyboardEvent<HTMLElement>)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect?.(id);}}}:{}),
    };
  }
  function heading(id:string,title:string){return <div {...node(id,12)} className={`${node(id).className} section-heading`}>{title}</div>;}
  function section(title: string, id:string, content:ReactNode){return <section className="resume-section">{heading(`${id}-section-title`,title)}{content}</section>;}
  const style={'--resume-accent':resume.design.accentColor,'--section-gap':`${resume.nodeStyles.page?.marginBottom??resume.design.sectionGap}px`,background:resume.design.paperColor,color:resume.nodeStyles.page?.color??resume.design.inkColor,fontWeight:resume.nodeStyles.page?.fontWeight,borderLeft:resume.nodeStyles.page?.accent?`2px solid ${resume.design.accentColor}`:undefined,transform:`scale(${scale})`,transformOrigin:'top left'} as CSSProperties;
  return <div className="resume-paper-wrap" style={{width:794*scale,height:height*scale}}><div ref={ref} className={`resume-paper ${!interactive?'export-paper':''}`} style={style}>
    {interactive && <button className="page-selection-control" onClick={()=>onSelect?.('page')}>选择整页</button>}
    <header className="resume-header"><div className="resume-header-copy"><h1 {...node('profile-name',37)}>{resume.name}</h1><p {...node('profile-role',14)}>{resume.role}</p><div {...node('profile-contact',10)} className={`${node('profile-contact').className} contact-row`}>
      {resume.location && <span><MapPin size={11}/>{resume.location}</span>}{resume.email && <span><AtSign size={11}/>{resume.email}</span>}{resume.phone && <span><Phone size={11}/>{resume.phone}</span>}{resume.website && <span><Link2 size={11}/>{resume.website}</span>}
    </div></div><div {...node('profile-avatar')} className={`${node('profile-avatar').className} avatar-wrap`}><div className={`resume-avatar ${resume.design.avatarShape}`}>
      {resume.avatarDataUrl?<img src={resume.avatarDataUrl} alt="个人头像"/>:interactive?<CircleUserRound size={38}/>:null}
    </div></div></header><div className="resume-rule"/>
    {resume.summary && <section {...node('summary',13)} className={`${node('summary').className} resume-summary`}><p>{resume.summary}</p></section>}
    <div className="resume-grid"><div className="resume-main-column">
      {resume.projects.length>0 && section('项目经历','projects',resume.projects.map((item,index)=><article className="project-item" key={item.id}><h2 {...node(`project-${index+1}-title`,17)}>{item.title}</h2><span className="project-meta">{item.meta}</span><div {...node(`project-${index+1}-description`,12)} className={`${node(`project-${index+1}-description`).className} project-description`}>{item.description.map((line,i)=><p key={i}>{line}</p>)}</div><div className="tag-row">{item.stack.map((tag,i)=><span key={i}>{tag}</span>)}</div></article>))}
      {resume.experience.length>0 && section('工作 / 实习经历','experience',resume.experience.map((item,index)=><article {...node(`experience-${index+1}`,12)} className={`${node(`experience-${index+1}`).className} experience-item`} key={index}><div className="experience-header"><strong>{item.role}</strong><span>{item.period}</span></div><div className="experience-company">{item.company}</div><ul>{item.bullets.map((line,i)=><li key={i}>{line}</li>)}</ul></article>))}
    </div><aside className="resume-side-column">
      {resume.skills.length>0 && section('核心技能','skills',<div {...node('skills',12)} className={`${node('skills').className} skill-list`}>{resume.skills.map((item,i)=><div className="skill-item" key={i}><span>{item.label}</span><small>{item.level}</small></div>)}</div>)}
      {resume.education.length>0 && section('教育经历','education',resume.education.map((item,index)=><div {...node(`education-${index+1}`,12)} className={`${node(`education-${index+1}`).className} education-item`} key={index}><strong>{item.school}</strong><span>{item.degree}</span><small>{item.period}</small></div>))}
      {resume.awards.length>0 && section('获奖 / 证书','awards',<div {...node('awards',12)} className={`${node('awards').className} awards-list`}>{resume.awards.map((item,i)=><p key={i}>{item}</p>)}</div>)}
    </aside></div>
  </div></div>;
}
