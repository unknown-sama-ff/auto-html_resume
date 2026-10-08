import React, { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { MapPin, AtSign, Link2, Phone } from 'lucide-react';
import { FONT_STACKS } from '../../shared/design';
import { getBaseNodeStyle } from '../lib/design';
import type { ResumeData } from '../types';

type Props = { resume: ResumeData; selectedNodeId?: string; onSelect?: (id: string) => void; scale?: number; interactive?: boolean };
export function ResumePreview({ resume, selectedNodeId = '', onSelect, scale = 1, interactive = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(1123);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  function node(id: string, component = id, path = id) {
    const defaults = getBaseNodeStyle(resume, id), local = resume.nodeStyles[id], page = resume.nodeStyles.page;
    return {
      className: `resume-node ${interactive && selectedNodeId === id ? 'is-selected' : ''}`,
      'data-node-id': id, 'data-component': component, 'data-content-path': path,
      style: {
        color: page?.color ?? local?.color ?? defaults.color,
        fontSize: (local?.fontSize ?? defaults.fontSize) * ((page?.fontSize ?? 14) / 14),
        fontWeight: local?.fontWeight ?? page?.fontWeight ?? defaults.fontWeight,
        marginBottom: local?.marginBottom ?? defaults.marginBottom,
        ...(local?.accent !== undefined ? { borderLeft: local.accent ? `2px solid ${resume.design.accentColor}` : 'none', paddingLeft: local.accent ? 8 : undefined } : {}),
      } as CSSProperties,
      ...(interactive ? { tabIndex: 0, onClick: () => onSelect?.(id), onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect?.(id); }
      } } : {}),
    };
  }
  function section(title: string, id: string, content: ReactNode) {
    const props = node(`${id}-section-title`, 'section-title', id);
    return <section className="resume-section" data-section={id} key={id}><h2 {...props} className={`${props.className} section-heading`}>{title}</h2>{content}</section>;
  }
  const summary = resume.summary && <section {...node('summary')} className={`${node('summary').className} resume-summary`}><p>{resume.summary}</p></section>;
  const projects = resume.projects.length > 0 && section('项目经历', 'projects', resume.projects.map((item, index) => <article className="project-item" key={item.id}>
    <h3 {...node(`project-${index + 1}-title`, 'project-title', `projects[${index}].title`)}>{item.title}</h3>
    {item.meta && <span className="project-meta">{item.meta}</span>}
    <div {...node(`project-${index + 1}-description`, 'project-description', `projects[${index}].description`)} className={`${node(`project-${index + 1}-description`).className} project-description`}>{item.description.map((line, i) => <p key={i}>{line}</p>)}</div>
    {item.stack.length > 0 && <div className="tag-row">{item.stack.map((tag, i) => <span key={i}>{tag}</span>)}</div>}
  </article>));
  const experience = resume.experience.length > 0 && section('工作 / 实习经历', 'experience', resume.experience.map((item, index) => <article {...node(`experience-${index + 1}`, 'experience', `experience[${index}]`)} className={`${node(`experience-${index + 1}`).className} experience-item`} key={index}>
    <div className="experience-header"><strong>{item.role}</strong><span>{item.period}</span></div><div className="experience-company">{item.company}</div><ul>{item.bullets.map((line, i) => <li key={i}>{line}</li>)}</ul>
  </article>));
  const education = resume.education.length > 0 && section('教育经历', 'education', resume.education.map((item, index) => <div {...node(`education-${index + 1}`, 'education', `education[${index}]`)} className={`${node(`education-${index + 1}`).className} education-item`} key={index}><strong>{item.school}</strong><span>{item.degree}</span><small>{item.period}</small></div>));
  const skills = resume.skills.length > 0 && section('核心技能', 'skills', <div {...node('skills')} className={`${node('skills').className} skill-list`}>{resume.skills.map((item, i) => <div className="skill-item" key={i}><span>{item.label}</span>{item.level && <small>{item.level}</small>}</div>)}</div>);
  const awards = resume.awards.length > 0 && section('获奖 / 证书', 'awards', <div {...node('awards')} className={`${node('awards').className} awards-list`}>{resume.awards.map((item, i) => <p key={i}>{item}</p>)}</div>);
  const custom = resume.customSections.map((item, index) => {
    const title = node(`custom-${item.id}-title`, 'custom-title', `customSections[${index}].title`), content = node(`custom-${item.id}-content`, 'custom-content', `customSections[${index}].items`);
    return <section className="resume-section custom-section" data-section={`custom-${item.id}`} key={item.id}><h2 {...title} className={`${title.className} section-heading`}>{item.title}</h2><div {...content} className={`${content.className} custom-content`}>{item.items.map((line, i) => <p key={i}>{line}</p>)}</div></section>;
  });
  const identity = <header className="resume-header"><div className="resume-header-copy"><h1 {...node('profile-name', 'name', 'name')}>{resume.name}</h1><p {...node('profile-role', 'role', 'role')}>{resume.role}</p><div {...node('profile-contact', 'contact')} className={`${node('profile-contact').className} contact-row`}>
    {resume.location && <span><MapPin size={11} />{resume.location}</span>}{resume.email && <span><AtSign size={11} />{resume.email}</span>}{resume.phone && <span><Phone size={11} />{resume.phone}</span>}{resume.website && <span><Link2 size={11} />{resume.website}</span>}
  </div></div>{resume.avatarDataUrl && <div {...node('profile-avatar', 'avatar', 'avatarDataUrl')} className={`${node('profile-avatar').className} avatar-wrap`}><div className={`resume-avatar ${resume.design.avatarShape}`}><img src={resume.avatarDataUrl} alt="个人头像" /></div></div>}</header>;
  const template = resume.design.templateId;
  const style = {
    '--resume-accent': resume.design.accentColor, '--section-gap': `${resume.nodeStyles.page?.marginBottom ?? resume.design.sectionGap}px`, '--resume-font': FONT_STACKS[resume.design.fontFamily],
    background: resume.design.paperColor, color: resume.nodeStyles.page?.color ?? resume.design.inkColor, fontWeight: resume.nodeStyles.page?.fontWeight,
    borderLeft: resume.nodeStyles.page?.accent ? `2px solid ${resume.design.accentColor}` : undefined, transform: `scale(${scale})`, transformOrigin: 'top left',
  } as CSSProperties;
  let body: ReactNode;
  if (template === 'modern') body = <div className="resume-layout-shell"><aside className="resume-identity-panel">{identity}{summary}{skills}{education}{awards}</aside><main className="resume-main-column">{projects}{experience}{custom}</main></div>;
  else if (template === 'minimal' || template === 'academic') body = <>{identity}{summary}<main className="resume-body-single">{education}{template === 'minimal' ? experience : projects}{template === 'minimal' ? projects : experience}{custom}{skills}{awards}</main></>;
  else body = <>{identity}{template !== 'editorial' && summary}<div className="resume-grid"><main className="resume-main-column">{template === 'timeline' ? experience : projects}{template === 'timeline' ? projects : experience}{custom}</main><aside className="resume-side-column">{template === 'editorial' && summary}{skills}{education}{awards}</aside></div></>;
  return <div className="resume-paper-wrap" style={{ width: 794 * scale, height: height * scale }}><div ref={ref} className={`resume-paper resume-document template-${template} density-${resume.design.density} headings-${resume.design.headingStyle} ${interactive ? 'interactive-paper' : 'export-paper'}`} style={style} data-template={template} data-node-id="page" data-component="page">
    {interactive && <button className="page-selection-control" onClick={() => onSelect?.('page')}>选择整页</button>}{body}
  </div></div>;
}
