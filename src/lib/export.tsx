import { renderToStaticMarkup } from 'react-dom/server';
import { ResumePreview } from '../components/ResumePreview';
import resumeCss from '../styles/resume.css?inline';
import type { ResumeData } from '../types';
export function renderResumeHtml(resume:ResumeData):string {
  const css=resumeCss;
  const markup=renderToStaticMarkup(<ResumePreview resume={resume} interactive={false}/>);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>个人简历</title><style>${css}\nhtml,body{background:white;margin:0} .resume-paper-wrap{margin:0 auto;height:auto!important}.resume-paper.resume-document{transform:none!important;position:static!important;box-shadow:none}</style></head><body>${markup}</body></html>`;
}
export function downloadResume(resume:ResumeData){const url=URL.createObjectURL(new Blob([renderResumeHtml(resume)],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${resume.name.replace(/[\\/:*?"<>|]/g,'')}-resume.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
export function printResume(resume:ResumeData):Promise<void> {
  return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe'); frame.title='简历打印预览'; frame.style.cssText='position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;';
    const timeout=window.setTimeout(()=>{frame.remove();reject(new Error('打印预览加载超时，请重试。'));},20000);
    frame.onload=async()=>{
      if(!frame.contentWindow || !frame.contentDocument)return;
      await frame.contentDocument.fonts.ready;
      await Promise.all([...frame.contentDocument.images].map(image=>image.complete?Promise.resolve():new Promise<void>(r=>{image.onload=()=>r();image.onerror=()=>r();})));
      window.clearTimeout(timeout);
      frame.contentWindow.onafterprint=()=>frame.remove();
      frame.contentWindow.focus();frame.contentWindow.print();resolve();
      // afterprint may not fire if the print dialog is cancelled by the browser.
      window.setTimeout(()=>frame.remove(),120000);
    };
    frame.srcdoc=renderResumeHtml(resume);document.body.appendChild(frame);
  });
}
