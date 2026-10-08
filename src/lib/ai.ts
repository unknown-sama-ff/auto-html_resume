import { formatApiFailure } from '../../shared/errorDiagnostics';
import { editPatchSchema } from '../../shared/contracts';
import { buildEditMessages, parseEditPatch } from '../../shared/edit';
import { requestDirectModel } from './directModel';
import { DEFAULT_NODE_STYLE } from '../data';
import type { ResumeData, SelectionMeta, EditPatch, ModelConfig } from '../types';
export const cloneResume = (resume: ResumeData): ResumeData => structuredClone(resume);
export const getNodeStyle = (resume: ResumeData, id: string): Required<ResumeData['nodeStyles'][string]> => ({ ...DEFAULT_NODE_STYLE, ...(id==='page'?{color:resume.design.inkColor,marginBottom:resume.design.sectionGap}:{}), ...resume.nodeStyles[id] });
export function getNodeContent(resume: ResumeData, id: string): string {
  if (id === 'profile-name') return resume.name;
  if (id === 'profile-role') return resume.role;
  if (id === 'profile-contact') return [resume.location, resume.email, resume.phone, resume.website].join('\n');
  if (id === 'summary') return resume.summary;
  if (id === 'skills') return resume.skills.map(s => `${s.label}${s.level ? ' | ' + s.level : ''}`).join('\n');
  if (id === 'awards') return resume.awards.join('\n');
  const project = id.match(/^project-(\d+)-(title|description)$/);
  if (project) { const item = resume.projects[Number(project[1])-1]; return item ? project[2] === 'title' ? item.title : item.description.join('\n') : ''; }
  const experience = id.match(/^experience-(\d+)$/);
  if (experience) { const item = resume.experience[Number(experience[1])-1]; return item ? [item.company, item.role, item.period, ...item.bullets].join('\n') : ''; }
  const education = id.match(/^education-(\d+)$/);
  if (education) { const item = resume.education[Number(education[1])-1]; return item ? [item.school, item.degree, item.period].join('\n') : ''; }
  return '';
}
export function updateContent(resume: ResumeData, id: string, value: string): ResumeData {
  const next = cloneResume(resume); const lines = value.split('\n');
  if (id === 'profile-name') next.name = value;
  if (id === 'profile-role') next.role = value;
  if (id === 'profile-contact') [next.location, next.email, next.phone, next.website] = Array.from({length:4}, (_,i) => lines[i] ?? '');
  if (id === 'summary') next.summary = value;
  if (id === 'skills') next.skills = lines.filter(Boolean).map(line => { const [label, level=''] = line.split('|').map(s=>s.trim()); return {label,level}; });
  if (id === 'awards') next.awards = lines.filter(Boolean);
  const p = id.match(/^project-(\d+)-(title|description)$/);
  if (p && next.projects[Number(p[1])-1]) { const item = next.projects[Number(p[1])-1]; if (p[2] === 'title') item.title=value; else item.description=lines.filter(Boolean); }
  const e = id.match(/^experience-(\d+)$/);
  if (e && next.experience[Number(e[1])-1]) next.experience[Number(e[1])-1] = { company: lines[0]??'', role:lines[1]??'', period:lines[2]??'', bullets:lines.slice(3).filter(Boolean) };
  const d = id.match(/^education-(\d+)$/);
  if (d && next.education[Number(d[1])-1]) next.education[Number(d[1])-1] = { school:lines[0]??'', degree:lines[1]??'', period:lines[2]??'' };
  return next;
}
export function getNodeMeta(resume: ResumeData, id: string): SelectionMeta {
  const simple: Record<string,{label:string;kind:SelectionMeta['kind']}> = {
    page:{label:'整张简历',kind:'page'}, 'profile-name':{label:'姓名',kind:'name'}, 'profile-role':{label:'职业定位',kind:'role'}, 'profile-contact':{label:'联系方式（地点/邮箱/电话/网址各一行）',kind:'contact'}, 'profile-avatar':{label:'头像',kind:'avatar'}, summary:{label:'个人简介',kind:'summary'}, skills:{label:'技能（每行一项，级别用 | 分隔）',kind:'skills'}, awards:{label:'获奖情况',kind:'awards'},
  };
  let label = simple[id]?.label ?? id; let kind = simple[id]?.kind ?? 'section-title';
  const p = id.match(/^project-(\d+)-(title|description)$/);
  if(p) { label = `项目经历 > ${resume.projects[Number(p[1])-1]?.title??''} > ${p[2]==='title'?'标题':'描述'}`; kind=p[2]==='title'?'project-title':'project-description'; }
  if(/^experience-\d+$/.test(id)){ label='工作经历（公司/岗位/时间/描述逐行填写）'; kind='experience'; }
  if(/^education-\d+$/.test(id)){ label='教育经历（学校/学位/时间逐行填写）'; kind='education'; }
  const style=getNodeStyle(resume,id);
  return { id,label,breadcrumb:label,kind,path:id,content:getNodeContent(resume,id),style,code:`.${id} {\n  color: ${style.color};\n  font-size: ${style.fontSize}px;\n  font-weight: ${style.fontWeight};\n  margin-bottom: ${style.marginBottom}px;\n}` };
}
export function validatePatch(patch: EditPatch, selection: SelectionMeta): EditPatch {
  if(patch.targetNodeId!==selection.id) throw new Error('AI 修改目标与当前选择不一致，已拒绝。');
  if(patch.operation==='rewriteText') {
    if(['page','avatar','section-title'].includes(selection.kind) || typeof patch.value!=='string' || patch.value.length>6000) throw new Error('该区块不能应用此文案修改。');
    return {...patch,requiresConfirmation:true};
  }
  if(patch.operation!=='setStyle') throw new Error('不支持此修改操作。');
  const safe = patch.path==='style.color' ? typeof patch.value==='string' && /^#[a-f0-9]{6}$/i.test(patch.value)
    : patch.path==='style.fontSize' ? typeof patch.value==='number' && patch.value>=8 && patch.value<=48
    : patch.path==='style.fontWeight' ? typeof patch.value==='number' && [400,500,600,700,800].includes(patch.value)
    : patch.path==='style.marginBottom' ? typeof patch.value==='number' && patch.value>=0 && patch.value<=40
    : patch.path==='style.accent' ? typeof patch.value==='boolean'
    : patch.path==='design.avatarShape' ? selection.kind==='avatar' && ['circle','square'].includes(String(patch.value)) : false;
  if(!safe) throw new Error('AI 返回了不受支持或超出范围的属性。');
  return patch;
}
export function applyPatch(resume: ResumeData, patch: EditPatch): ResumeData {
  validatePatch(patch,getNodeMeta(resume,patch.targetNodeId));
  if(patch.operation==='rewriteText') return updateContent(resume,patch.targetNodeId,String(patch.value));
  const next=cloneResume(resume);
  if(patch.path==='design.avatarShape') next.design.avatarShape=patch.value==='circle'?'circle':'square';
  else next.nodeStyles[patch.targetNodeId] = {...next.nodeStyles[patch.targetNodeId], [patch.path.replace('style.','')]:patch.value};
  return next;
}
export async function requestAIEdit(config: ModelConfig, instruction: string, selection: SelectionMeta, signal?: AbortSignal): Promise<EditPatch> {
  if(config.mode==='custom')return validatePatch(parseEditPatch(await requestDirectModel(config,buildEditMessages(instruction,selection),signal),selection.id),selection);
  const response=await fetch('/api/ai/edit',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({prompt:instruction,selection,config:{mode:'preset',presetId:config.presetId}})});
  const payload: unknown=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(formatApiFailure(payload,response.status,'AI编辑失败，请重试。'));
  if(!payload || typeof payload!=='object' || !('patch' in payload) || !payload.patch || typeof payload.patch!=='object') throw new Error('模型返回的数据格式不正确');
  // All fields and paths are constrained again before application.
  const parsed=editPatchSchema.safeParse(payload.patch);
  if(!parsed.success)throw new Error('模型返回的修改建议不完整，已拒绝。');
  return validatePatch(parsed.data,selection);
}
