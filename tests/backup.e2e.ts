import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initialResume } from '../src/data';
import type { GenerationResult, WorkspaceState } from '../src/types';

const personalDetails='姓名：张雨\n技能：Python、SQL\n项目：电商数据分析';
function result():GenerationResult {
  const resume=structuredClone(initialResume);
  resume.name='张雨';resume.role='数据分析师';resume.projects[0].title='电商数据分析';
  return {resume,jobTitle:'数据分析师',warnings:[],report:{summary:'有数据分析经验。',requirements:[]}};
}
test.beforeEach(async({page})=>{
  await page.route('**/api/ai/presets',route=>route.fulfill({json:[{id:'cf-api-fan',label:'Relay',provider:'OpenAI-compatible',model:'test-model',baseUrl:'https://cf.api.fan/v1',description:'测试通道'}]}));
  await page.route('**/api/ai/generate',route=>route.fulfill({json:result()}));
});
async function generate(page:Page) {
  await page.locator('.intake-card textarea').first().fill(personalDetails);
  await page.locator('.intake-card textarea').nth(1).fill('岗位：数据分析师，要求Python和SQL');
  await page.locator('.consent-line input').check();
  await page.getByRole('button',{name:'生成我的岗位简历',exact:true}).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('张雨');
  await expect(page.locator('.save-state')).toHaveText('已本地保存');
}
async function savedWorkspace(page:Page):Promise<WorkspaceState> {
  return page.evaluate(()=>new Promise<WorkspaceState>((resolve,reject)=>{
    const request=indexedDB.open('folio-atelier',1);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const database=request.result;
      const read=database.transaction('workspace','readonly').objectStore('workspace').get('resume-editor-state');
      read.onsuccess=()=>{resolve(read.result.value);database.close();};
      read.onerror=()=>{reject(read.error);database.close();};
    };
  }));
}
async function openFromSidebar(page:Page) {
  await page.getByRole('button',{name:'展开侧边栏',exact:true}).click();
  await page.locator('.side-rail').getByRole('button',{name:'备份与恢复',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'简历备份与恢复',exact:true});
  await expect(dialog).toBeVisible();
  return dialog;
}
async function editName(page:Page,name:string) {
  await page.locator('.resume-paper h1').click();
  await page.getByRole('textbox',{name:'选中区块的内容'}).fill(name);
  await page.getByRole('button',{name:'保存内容',exact:true}).click();
  await expect(page.locator('.resume-paper h1')).toHaveText(name);
  await expect(page.locator('.save-state')).toHaveText('已本地保存');
}

test('downloaded backup previews and restores all versions without replacing current edits, then survives reload',async({page})=>{
  await page.goto('/');await generate(page);
  const originalId=await page.locator('.version-select').inputValue();
  await editName(page,'张雨（备份时）');
  await page.getByRole('button',{name:'复制当前版本',exact:true}).click();
  await page.getByRole('textbox',{name:'版本名称',exact:true}).fill('产品经理投递版本');
  await expect(page.locator('.save-state')).toHaveText('已本地保存');
  const dialog=await openFromSidebar(page);
  await expect(dialog).toContainText('无需打开或修改这个文件');
  await expect(dialog).toContainText('投递');await expect(dialog).toContainText('PDF');await expect(dialog).toContainText('HTML');
  await page.screenshot({path:'.tmp/screenshots/backup-dialog.png'});
  const downloadPromise=page.waitForEvent('download');
  await dialog.getByRole('button',{name:'下载全部版本备份',exact:true}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const backupText=await readFile((await download.path())!,'utf8');
  const backup=JSON.parse(backupText) as WorkspaceState;
  expect(backup.schemaVersion).toBe(2);expect(backup.versions).toHaveLength(2);
  expect(backup.versions.find(version=>version.id===originalId)?.history.length).toBeGreaterThan(0);
  expect(backup.versions.every(version=>version.profileText===personalDetails)).toBe(true);
  await dialog.getByRole('button',{name:'关闭备份与恢复',exact:true}).click();

  await page.locator('.version-select').selectOption(originalId);
  await editName(page,'张雨（当前修改保留）');
  const current=await savedWorkspace(page);
  await page.locator('.side-rail').getByRole('button',{name:'备份与恢复',exact:true}).click();
  await dialog.getByRole('button',{name:'从备份恢复',exact:true}).click();
  await dialog.getByLabel('选择简历备份文件',{exact:true}).setInputFiles({name:download.suggestedFilename(),mimeType:'application/json',buffer:Buffer.from(backupText)});
  await expect(dialog.locator('.backup-preview')).toContainText('可恢复 2 份简历');
  for(const version of backup.versions)await expect(dialog.locator('.backup-preview')).toContainText(version.title);
  await expect(dialog.locator('.backup-preview')).toContainText('不覆盖当前内容');
  await dialog.getByRole('button',{name:'恢复这些简历',exact:true}).click();
  await expect(page.locator('.version-item')).toHaveCount(4);
  await expect(page.locator('.save-state')).toHaveText('已本地保存');
  const restored=await savedWorkspace(page);
  expect(new Set(restored.versions.map(version=>version.id)).size).toBe(4);
  for(const version of current.versions)expect(restored.versions.find(item=>item.id===version.id)).toEqual(version);
  const copies=restored.versions.filter(version=>!current.versions.some(item=>item.id===version.id));
  for(const source of backup.versions) {
    const copy=copies.find(version=>version.title.includes(source.title));
    expect(copy?.title).toContain('恢复副本');
    expect(copy?.resume).toEqual(source.resume);
    expect(copy?.profileText).toBe(source.profileText);
    expect(copy?.jobText).toBe(source.jobText);
    expect(copy?.history).toEqual(source.history);
    expect(copy?.messages).toEqual(source.messages);
  }
  await page.reload();await page.getByRole('button',{name:'打开版本侧边栏',exact:true}).click();
  await expect(page.locator('.version-item')).toHaveCount(4);
  await page.locator(`.version-item[data-version-id="${originalId}"]`).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('张雨（当前修改保留）');
});

test('invalid backup shows an actionable error and leaves the saved workspace intact',async({page})=>{
  await page.goto('/');await generate(page);
  const current=await savedWorkspace(page);
  const dialog=await openFromSidebar(page);
  await dialog.getByRole('button',{name:'从备份恢复',exact:true}).click();
  for(const contents of ['{broken JSON',JSON.stringify({schemaVersion:2,activeVersionId:'broken',versions:[{id:'broken',title:'不完整的简历'}]})]) {
    await dialog.getByLabel('选择简历备份文件',{exact:true}).setInputFiles({name:'broken-backup.json',mimeType:'application/json',buffer:Buffer.from(contents)});
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText(/备份|JSON|简历/);
    await expect(dialog.locator('.backup-preview')).toHaveCount(0);
    await expect(dialog.getByRole('button',{name:'恢复这些简历',exact:true})).toHaveCount(0);
    expect(await savedWorkspace(page)).toEqual(current);
  }
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  await expect(page.locator('.resume-paper h1')).toHaveText('张雨');
  await page.reload();await page.getByRole('button',{name:'打开版本侧边栏',exact:true}).click();
  await expect(page.locator('.version-item')).toHaveCount(1);
  await page.locator(`.version-item[data-version-id="${current.activeVersionId}"]`).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('张雨');
});

test('oversized full backup offers a restorable contents backup without changing saved resumes',async({page})=>{
  const withAvatar=result();
  withAvatar.resume.avatarDataUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS4sAAAAASUVORK5CYII=';
  withAvatar.warnings=['请确认项目指标'];
  await page.route('**/api/ai/generate',route=>route.fulfill({json:withAvatar}));
  await page.route('**/api/ai/edit',route=>route.fulfill({json:{patch:{id:'backup-edit',targetNodeId:'profile-name',operation:'setStyle',path:'style.color',value:'#315A64',reason:'调整姓名色彩',preview:'姓名改为深蓝色',requiresConfirmation:false}}}));
  await page.goto('/');await generate(page);
  await editName(page,'张雨（保留当前正文）');
  await editName(page,'张雨（撤回的修改）');
  await page.getByRole('textbox',{name:'AI修改要求'}).fill('姓名改为深蓝色');
  await page.getByRole('button',{name:'生成修改',exact:true}).click();
  await expect(page.locator('.patch-card')).toContainText('姓名改为深蓝色');
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('张雨（保留当前正文）');
  await expect(page.locator('.save-state')).toHaveText('已本地保存');
  const current=await savedWorkspace(page);
  const original=current.versions[0];
  for(const key of ['past','future','history','messages'] as const)expect(original[key].length).toBeGreaterThan(0);
  await page.evaluate(()=>{
    const OriginalBlob=window.Blob;
    window.Blob=class extends OriginalBlob {
      constructor(parts:BlobPart[]=[],options?:BlobPropertyBag){
        super(parts,options);
        if(options?.type!=='application/json')return;
        try {
          const workspace=JSON.parse(parts.filter(part=>typeof part==='string').join(''));
          if(workspace.schemaVersion===2&&workspace.versions?.some((version:{history?:unknown[]})=>version.history?.length)) {
            Object.defineProperty(this,'size',{value:128*1024*1024+1});
          }
        } catch { /* Only workspace JSON backups receive the simulated size. */ }
      }
    };
  });
  let downloadCount=0;page.on('download',()=>{downloadCount+=1;});
  const dialog=await openFromSidebar(page);
  const contentsDownload=dialog.getByRole('button',{name:'下载简历内容备份（不含历史和对话）',exact:true});
  await expect(contentsDownload).toHaveCount(0);
  await dialog.getByRole('button',{name:'下载全部版本备份',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('128 MB');
  await expect(contentsDownload).toBeVisible();
  await expect(dialog.locator('.backup-size-option')).toContainText('保留所有当前简历、头像、模板和已保存资料');
  await expect(dialog.locator('.backup-size-option')).toContainText('不包含修改历史、撤销记录与编辑对话');
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  expect(downloadCount).toBe(0);expect(await savedWorkspace(page)).toEqual(current);
  const downloadPromise=page.waitForEvent('download');
  await contentsDownload.click();
  const download=await downloadPromise;
  const text=await readFile((await download.path())!,'utf8');
  const compact=JSON.parse(text) as WorkspaceState;
  expect(downloadCount).toBe(1);
  expect(compact).toEqual({...current,versions:[{...original,past:[],future:[],history:[],messages:[]}]});
  expect(await savedWorkspace(page)).toEqual(current);
  await expect(dialog.getByRole('status')).toContainText('不含历史与对话');
  await dialog.getByRole('button',{name:'从备份恢复',exact:true}).click();
  await dialog.getByLabel('选择简历备份文件',{exact:true}).setInputFiles({name:download.suggestedFilename(),mimeType:'application/json',buffer:Buffer.from(text)});
  await expect(dialog.locator('.backup-preview')).toContainText('可恢复 1 份简历');
  await expect(dialog.locator('.backup-preview')).toContainText('0 条修改记录 · 0 条编辑对话');
  await dialog.getByRole('button',{name:'恢复这些简历',exact:true}).click();
  await expect(page.locator('.version-item')).toHaveCount(2);
  await expect(page.locator('.resume-paper h1')).toHaveText('张雨（保留当前正文）');
  await expect(page.locator('.save-state')).toHaveText('已本地保存');
  const restored=await savedWorkspace(page);
  expect(restored.versions.find(version=>version.id===original.id)).toEqual(original);
  const copy=restored.versions.find(version=>version.id!==original.id);
  expect(copy?.resume).toEqual(original.resume);expect(copy?.profileText).toBe(original.profileText);expect(copy?.report).toEqual(original.report);
  for(const key of ['past','future','history','messages'] as const)expect(copy?.[key]).toEqual([]);
});

test('storage read failure pauses saving and retry recovers the existing resume for editing',async({page})=>{
  await page.goto('/');await generate(page);
  await editName(page,'张雨（读取失败前已保存）');
  const current=await savedWorkspace(page);
  await page.addInitScript(()=>{
    const mock={failReads:true,workspaceWrites:0};
    Reflect.set(window,'__resumeStorageFailure',mock);
    const originalOpen=IDBFactory.prototype.open;
    IDBFactory.prototype.open=function(name,version){
      if(name==='folio-atelier'&&mock.failReads)throw new DOMException('Simulated IndexedDB read failure','UnknownError');
      return Reflect.apply(originalOpen,this,version===undefined?[name]:[name,version]);
    };
    const originalGet=Storage.prototype.getItem;
    Storage.prototype.getItem=function(key){
      if(key==='resume-editor-state'&&mock.failReads)throw new DOMException('Simulated fallback read failure','SecurityError');
      return originalGet.call(this,key);
    };
    const originalPut=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,key){
      if(this.name==='workspace'&&value?.key==='resume-editor-state')mock.workspaceWrites+=1;
      return Reflect.apply(originalPut,this,key===undefined?[value]:[value,key]);
    };
    const originalSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(key==='resume-editor-state')mock.workspaceWrites+=1;
      return originalSet.call(this,key,value);
    };
  });
  await page.reload();
  const failureHeading=page.getByRole('heading',{name:'暂时无法读取本地简历',exact:true});
  const retry=page.getByRole('button',{name:'重新读取本地简历',exact:true});
  await expect(failureHeading).toBeVisible();await expect(retry).toBeEnabled();
  await expect(page.locator('.intake-card')).toHaveCount(0);
  await expect(page.locator('.resume-paper')).toHaveCount(0);
  await retry.click();
  await expect(failureHeading).toBeVisible();await expect(retry).toBeEnabled();
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  expect(await page.evaluate(()=>Reflect.get(window,'__resumeStorageFailure').workspaceWrites)).toBe(0);
  await page.evaluate(()=>{Reflect.get(window,'__resumeStorageFailure').failReads=false;});
  expect(await savedWorkspace(page)).toEqual(current);
  await retry.click();
  await expect(failureHeading).toHaveCount(0);
  await page.getByRole('button',{name:'打开版本侧边栏',exact:true}).click();
  await expect(page.locator('.version-item')).toHaveCount(1);
  await page.locator(`.version-item[data-version-id="${current.activeVersionId}"]`).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('张雨（读取失败前已保存）');
  await expect(page.locator('.save-state')).toHaveText('已本地保存');
  expect(await savedWorkspace(page)).toEqual(current);
  await editName(page,'张雨（重新读取后继续编辑）');
  const edited=await savedWorkspace(page);
  expect(edited.versions).toHaveLength(1);
  expect(edited.versions[0].id).toBe(current.activeVersionId);
  expect(edited.versions[0].profileText).toBe(personalDetails);
  expect(edited.versions[0].resume.name).toBe('张雨（重新读取后继续编辑）');
});

test('reload recovers newer fallback edits instead of reverting to the older IndexedDB resume',async({page})=>{
  await page.goto('/');await generate(page);
  const original=await savedWorkspace(page);
  await page.evaluate(()=>{
    const originalPut=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,key){
      if(this.name==='workspace'&&value?.key==='resume-editor-state')throw new DOMException('Simulated IndexedDB write failure','UnknownError');
      return Reflect.apply(originalPut,this,key===undefined?[value]:[value,key]);
    };
  });
  await editName(page,'张雨（备用存储的新资料）');
  expect(await savedWorkspace(page)).toEqual(original);
  const fallback=await page.evaluate(()=>{
    const raw=localStorage.getItem('resume-editor-state');
    if(!raw)throw new Error('Expected the changed resume to be saved in fallback storage');
    return JSON.parse(raw).value as WorkspaceState;
  });
  expect(fallback.versions[0].resume.name).toBe('张雨（备用存储的新资料）');
  expect(fallback.versions[0].history).toHaveLength(original.versions[0].history.length+1);
  await page.reload();
  await page.getByRole('button',{name:'打开版本侧边栏',exact:true}).click();
  await expect(page.locator('.version-item')).toHaveCount(1);
  await page.locator(`.version-item[data-version-id="${original.activeVersionId}"]`).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('张雨（备用存储的新资料）');
  await expect(page.locator('.save-state')).toHaveText('已本地保存');
  expect(await savedWorkspace(page)).toEqual(fallback);
});

test('phone keeps home and sidebar backup entry points accessible and the new role guide inside the viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const headerEntry=page.locator('.landing-topbar').getByRole('button',{name:'备份与恢复',exact:true});
  await expect(headerEntry).toBeVisible();await headerEntry.click();
  const dialog=page.getByRole('dialog',{name:'简历备份与恢复',exact:true});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'从备份恢复',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(dialog.getByRole('button',{name:'选择简历备份文件',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
  await dialog.getByRole('button',{name:'关闭备份与恢复',exact:true}).click();
  await expect(headerEntry).toBeFocused();
  await page.getByRole('button',{name:'打开版本侧边栏',exact:true}).click();
  const sidebarEntry=page.locator('.side-rail').getByRole('button',{name:'备份与恢复',exact:true});
  await expect(sidebarEntry).toBeVisible();await sidebarEntry.click();
  await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'下载备份',exact:true}).click();
  await expect(dialog).toContainText('无需打开或修改这个文件');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
  await page.keyboard.press('Escape');
  const sidebarBackdrop=page.getByRole('button',{name:'收起侧边栏背景',exact:true});
  if(await sidebarBackdrop.isVisible())await sidebarBackdrop.click();
  await generate(page);
  await page.getByRole('button',{name:'基于当前版本创建岗位简历',exact:true}).click();
  await expect(page.locator('.new-role-guide h1')).toHaveText('为新岗位创建简历');
  await expect(page.locator('.new-role-guide')).toBeInViewport();
  await expect(page.locator('.imported-profile-panel textarea')).toHaveValue(personalDetails);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({path:'.tmp/screenshots/new-role-phone.png',fullPage:true});
  await page.getByRole('button',{name:'填写新岗位要求',exact:true}).click();
  await expect(page.locator('.intake-card textarea').nth(1)).toBeFocused();
  await expect(page.locator('.intake-card textarea').nth(1)).toBeInViewport();
});
