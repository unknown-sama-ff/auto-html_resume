import type { ResumeData } from '../types';

function comparable(text: string) { return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }
export function resumeContent(resume: ResumeData): string {
  return [resume.name,resume.role,resume.location,resume.email,resume.phone,resume.website,resume.summary,
    ...resume.skills.flatMap(item=>[item.label,item.level]), ...resume.projects.flatMap(item=>[item.title,item.meta,...item.description,...item.stack]),
    ...resume.experience.flatMap(item=>[item.company,item.role,item.period,...item.bullets]), ...resume.education.flatMap(item=>[item.school,item.degree,item.period]),
    ...resume.awards, ...resume.customSections.flatMap(item=>[item.title,...item.items])].join('\n');
}
export function unmatchedSourceLines(profileText: string, resume: ResumeData) {
  const rendered = comparable(resumeContent(resume));
  const seen = new Set<string>();
  return profileText.split(/\r?\n/).map(line=>line.trim()).filter(line=>{
    const key=comparable(line);
    if (key.length<3 || /^\[[^\]]+\]$/.test(line) || seen.has(key) || rendered.includes(key)) return false;
    seen.add(key); return true;
  });
}
export function appendCustomSection(resume: ResumeData, title: string, input: string[]) {
  const items=input.flatMap(line=>{
    const text=line.trim(); const chunks:string[]=[];
    for(let offset=0;offset<text.length;offset+=3000)chunks.push(text.slice(offset,offset+3000));
    return chunks;
  });
  if(!title.trim()||title.trim().length>200||!items.length)throw new Error('请填写栏目名称与内容。');
  if(resume.customSections.length+Math.ceil(items.length/30)>30)throw new Error('自定义栏目已达上限，请先整理；原文仍保留在核对区。');
  const next=structuredClone(resume);
  for(let offset=0;offset<items.length;offset+=30)next.customSections.push({id:crypto.randomUUID(),title:offset?`${title.trim()}（续）`:title.trim(),items:items.slice(offset,offset+30)});
  return next;
}
