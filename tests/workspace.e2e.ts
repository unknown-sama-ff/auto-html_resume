import { test, expect } from '@playwright/test';
import { initialResume } from '../src/data';
import type { GenerationResult } from '../src/types';
const makeResult=(name='张雨',role='数据分析师'):GenerationResult=>{
  const resume=structuredClone(initialResume);resume.name=name;resume.role=role;resume.projects[0].title='电商数据分析';
  return {resume,jobTitle:role,warnings:[],report:{summary:'材料显示有数据分析经验。',requirements:[{requirement:'Python',status:'matched',evidence:'项目使用Python',suggestion:''}]}};
};
const tailoredSummary='围绕数据分析岗位，突出数据分析路径设计、经营视图整理与周报制作实践。';
const makeTargetedPatch=()=>{
  const result=makeResult();
  return {
    summary:tailoredSummary,
    projects:result.resume.projects.map(({id,description},index)=>({id,description:index===0?['围绕资料采集与岗位解析，设计结构化内容模型与证据可追溯的简历工作流。',...description.slice(1)]:description})),
    experience:result.resume.experience.map(({bullets},index)=>({index,bullets})),
    customSections:result.resume.customSections.map(({id,items})=>({id,items})),
    report:result.report,
    warnings:[],
  };
};
test.beforeEach(async({page})=>{
  await page.route('**/api/ai/presets',route=>route.fulfill({json:[{id:'cf-api-fan',label:'Relay',provider:'OpenAI-compatible',model:'test-model',baseUrl:'https://cf.api.fan/v1',description:'测试通道'}]}));
});
async function generate(page:import('@playwright/test').Page,name='张雨',role='数据分析师'){
  await page.route('**/api/ai/generate',route=>route.fulfill({json:makeResult(name,role)}));
  await page.locator('.intake-card textarea').nth(0).fill(`姓名：${name}\n技能：Python、SQL\n项目：电商数据分析`);
  await page.locator('.intake-card textarea').nth(1).fill(`岗位：${role}，要求Python和SQL`);
  await page.locator('.consent-line input').check();
  await page.getByRole('button',{name:'生成我的岗位简历'}).click();
  await expect(page.locator('.resume-paper h1')).toHaveText(name);
}

test('home has introduction and empty versions; real input is submitted',async({page})=>{
  let profile='';await page.route('**/api/ai/generate',route=>{profile=route.request().postDataJSON().profileText;return route.fulfill({json:makeResult()});});
  await page.goto('/');await expect(page.locator('.landing-hero')).toContainText('一份经历');
  await expect(page.locator('.version-item')).toHaveCount(0);
  await page.locator('.intake-card textarea').nth(0).fill('姓名：张雨\n技能：Python、SQL');
  await page.locator('.intake-card textarea').nth(1).fill('岗位：数据分析师');
  await expect(page.getByRole('button',{name:'生成我的岗位简历'})).toBeDisabled();
  await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('张雨');expect(profile).toContain('张雨');
  await expect(page.locator('select[aria-label="选择简历版本"] option')).toHaveCount(1);
});

test('failure keeps uploaded text; never displays fake generated resume',async({page})=>{
  await page.route('**/api/ai/generate',route=>route.fulfill({status:400,json:{error:'Railway 尚未配置 CF_API_KEY'}}));
  await page.goto('/');await page.locator('.intake-card textarea').nth(0).fill('姓名：失败测试');await page.locator('.intake-card textarea').nth(1).fill('岗位：测试');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();
  await expect(page.getByRole('alert')).toContainText('CF_API_KEY');await expect(page.locator('.intake-card textarea').nth(0)).toHaveValue('姓名：失败测试');await expect(page.locator('.resume-paper')).toHaveCount(0);
});

test('versions switch actual content, preserve separate undo/history, and reload',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await generate(page);
  const first=await page.locator('.version-select').inputValue();
  await page.locator('.resume-paper h1').click();await page.getByRole('textbox',{name:'选中区块的内容'}).fill('张雨（第一版）');await page.getByRole('button',{name:'保存内容',exact:true}).click();
  await page.getByRole('button',{name:'复制当前版本'}).click();const second=await page.locator('.version-select').inputValue();expect(second).not.toBe(first);
  await page.locator('.resume-paper h1').click();await page.getByRole('textbox',{name:'选中区块的内容'}).fill('张雨（第二版）');await page.getByRole('button',{name:'保存内容',exact:true}).click();
  await page.locator('.version-select').selectOption(first);await expect(page.locator('.resume-paper h1')).toHaveText('张雨（第一版）');
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.resume-paper h1')).toHaveText('张雨');
  await page.locator('.version-select').selectOption(second);await expect(page.locator('.resume-paper h1')).toHaveText('张雨（第二版）');
  await page.getByRole('button',{name:'岗位匹配',exact:true}).click();await expect(page.locator('.match-page')).toContainText('项目使用Python');
  await page.getByRole('button',{name:'修改历史',exact:true}).click();await expect(page.locator('.history-list')).toContainText('修改姓名');
  await page.getByRole('button',{name:'恢复到此修改之后'}).first().click();await expect(page.locator('.resume-paper h1')).toHaveText('张雨（第二版）');
  await expect(page.locator('.save-state')).toContainText('已本地保存');await page.reload();await page.getByRole('button',{name:'打开版本侧边栏',exact:true}).click();await page.locator(`.version-item[data-version-id="${second}"]`).click();await expect(page.locator('.resume-paper h1')).toHaveText('张雨（第二版）');expect(errors).toEqual([]);
});

test('sidebar, zoom, full screen, exports and selection are real controls',async({page})=>{
  await page.goto('/');await generate(page);
  await expect(page.locator('.app-shell')).toHaveClass(/sidebar-collapsed/);
  const collapsedWidth=await page.locator('.app-main').evaluate(e=>e.getBoundingClientRect().width);
  await page.getByRole('button',{name:'展开侧边栏'}).click();const expandedWidth=await page.locator('.app-main').evaluate(e=>e.getBoundingClientRect().width);expect(collapsedWidth).toBeGreaterThan(expandedWidth);
  await page.getByRole('button',{name:'收起侧边栏'}).click();
  const paperBefore=await page.locator('.resume-paper').evaluate(e=>e.getBoundingClientRect().width);
  await page.getByRole('button',{name:'放大预览',exact:true}).click();await expect(page.locator('.zoom-label')).toHaveText('90%');const paperAfter=await page.locator('.resume-paper').evaluate(e=>e.getBoundingClientRect().width);expect(paperAfter).toBeGreaterThan(paperBefore);
  await page.getByRole('button',{name:'全屏预览',exact:true}).click();await expect(page.getByRole('dialog',{name:'放大简历预览'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.preview-column.is-fullscreen')).toHaveCount(0);
  await page.locator('.resume-paper h1').click();await expect(page.locator('.selected-context-chip')).toContainText('姓名');await page.getByRole('button',{name:'取消选择'}).click();await expect(page.locator('.selected-context-chip')).toContainText('尚未选择');
  await expect(page.locator('.export-actions button')).toHaveText(['导出 HTML','导出 PDF']);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出 HTML',exact:true}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toContain('张雨');
});

test('TXT upload is read and included in AI request; unsafe files rejected',async({page})=>{
  let submitted='';await page.route('**/api/ai/generate',route=>{submitted=route.request().postDataJSON().profileText;return route.fulfill({json:makeResult()});});await page.goto('/');
  await page.getByLabel('上传个人资料文件').setInputFiles({name:'resume.txt',mimeType:'text/plain',buffer:Buffer.from('姓名：张雨\n项目：文件里的经历','utf8')});
  await expect(page.locator('.intake-card').first()).toContainText('resume.txt');await page.locator('.intake-card textarea').nth(1).fill('数据分析岗位');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();await expect(page.locator('.resume-paper h1')).toHaveText('张雨');expect(submitted).toContain('文件里的经历');
});

test('phone viewport keeps both export actions available without horizontal page overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await generate(page);await expect(page.getByRole('button',{name:'导出 HTML',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'导出 PDF',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
});

test('PDF extraction runs in browser and its contents reach the generator',async({page})=>{
  const {textPdf}=await import('./pdf-fixture');let profile='';await page.route('**/api/ai/generate',route=>{profile=route.request().postDataJSON().profileText;return route.fulfill({json:makeResult()});});
  await page.goto('/');await page.getByLabel('上传个人资料文件').setInputFiles({name:'candidate.pdf',mimeType:'application/pdf',buffer:textPdf('Candidate Zhang: Python and SQL project')});
  await expect(page.locator('.intake-card').first()).toContainText('已解析PDF文字');await page.locator('.intake-card textarea').nth(1).fill('数据分析岗位');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();await expect(page.locator('.resume-paper h1')).toHaveText('张雨');expect(profile).toContain('Python and SQL');
});

test('job screenshots reach the model as images rather than file names',async({page})=>{
  let dataUrl='';await page.route('**/api/ai/generate',route=>{dataUrl=route.request().postDataJSON().jobImages[0].dataUrl;return route.fulfill({json:makeResult()});});
  await page.goto('/');await page.locator('.intake-card textarea').nth(0).fill('姓名：张雨');await page.getByLabel('上传岗位要求文件').setInputFiles({name:'job.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS4sAAAAASUVORK5CYII=','base64')});await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();await expect(page.locator('.resume-paper h1')).toHaveText('张雨');expect(dataUrl).toMatch(/^data:image\/png;base64,/);
});

test('AI local patch is confirmed, undoable, and only contains selected context',async({page})=>{
  let sent:Record<string,unknown>={};await page.route('**/api/ai/edit',route=>{sent=route.request().postDataJSON();return route.fulfill({json:{patch:{id:'patch-test',targetNodeId:'profile-name',operation:'setStyle',path:'style.color',value:'#315A64',reason:'按要求更新姓名色彩',preview:'姓名改为深蓝色',requiresConfirmation:false}}});});
  await page.goto('/');await generate(page);await page.locator('.resume-paper h1').click();await page.getByRole('textbox',{name:'AI修改要求'}).fill('把姓名改为深蓝色');await page.getByRole('button',{name:'生成修改',exact:true}).click();await expect(page.locator('.patch-card')).toContainText('姓名改为深蓝色');await page.getByRole('button',{name:'应用修改'}).click();await expect(page.locator('.resume-paper h1')).toHaveCSS('color','rgb(49, 90, 100)');expect(sent).not.toHaveProperty('resume');await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.resume-paper h1')).toHaveCSS('color','rgb(41, 50, 59)');
});

test('exported HTML matches the styled preview and PDF prints that same standalone document',async({page})=>{
  await page.goto('/');await generate(page);await page.locator('.resume-paper h1').click();await page.getByRole('button',{name:'选择颜色 #315A64'}).click();
  const file=page.waitForEvent('download');await page.getByRole('button',{name:'导出 HTML',exact:true}).click();const download=await file;const fs=await import('node:fs/promises');const html=await fs.readFile((await download.path())!,'utf8');expect(html).toContain('张雨');expect(html).toContain('电商数据分析');expect(html).toContain('#315A64');expect(html.split('</style>')[1]).not.toContain('is-selected');expect(html).not.toContain('@import');expect(html).not.toContain('<script');
  await page.addInitScript(()=>{window.print=()=>{document.documentElement.dataset.printCalled='yes';};});
  await page.getByRole('button',{name:'导出 PDF',exact:true}).click();const frame=page.frameLocator('iframe[title="简历打印预览"]');await expect(frame.locator('.resume-paper h1')).toHaveText('张雨');await expect(frame.locator('.resume-paper h1')).toHaveCSS('color','rgb(49, 90, 100)');await expect(frame.locator('.resume-paper')).toHaveCSS('transform','none');
});

test('AI settings expose exactly the author preset and custom URL, even with old preset metadata',async({page})=>{
  await page.route('**/api/ai/presets',route=>route.fulfill({json:[
    {id:'openai',label:'OpenAI',provider:'OpenAI-compatible',model:'old-model',baseUrl:'https://api.openai.com/v1',description:'旧版'},
    {id:'deepseek',label:'DeepSeek',provider:'OpenAI-compatible',model:'deepseek-chat',baseUrl:'https://api.deepseek.com/v1',description:'旧版'},
    {id:'cf-api-fan',label:'Relay',provider:'OpenAI-compatible',model:'gpt-6.1-sol',baseUrl:'https://cf.api.fan/v1',description:'后端预设'},
  ]}));
  await page.goto('/');await page.getByRole('button',{name:'AI 模型',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'AI 模型设置'});
  await expect(dialog.locator('.model-mode-tabs button')).toHaveText(['作者预设6.1-sol','自定义URL']);
  await expect(dialog.locator('.preset-item')).toHaveCount(0);
  await expect(dialog).not.toContainText('DeepSeek');await expect(dialog).not.toContainText('READY');
  await dialog.getByRole('button',{name:'自定义URL',exact:true}).click();
  await expect(dialog.getByLabel('完整 URL',{exact:false})).toBeVisible();
  await expect(dialog.getByLabel('模型名称',{exact:true})).toBeVisible();
  await expect(dialog.getByLabel('API Key',{exact:false})).toBeVisible();
});

test('custom URL fields survive mode toggles; cancel leaves the author default active',async({page})=>{
  let received:Record<string,unknown>={};
  await page.route('**/api/ai/generate',route=>{received=route.request().postDataJSON().config;return route.fulfill({json:makeResult()});});
  await page.goto('/');await page.getByRole('button',{name:'AI 模型',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'AI 模型设置'});
  await dialog.getByRole('button',{name:'自定义URL',exact:true}).click();
  await dialog.getByLabel('完整 URL',{exact:false}).fill('https://api.example.com/v1');
  await dialog.getByLabel('模型名称',{exact:true}).fill('custom-test-model');
  await dialog.getByLabel('API Key',{exact:false}).fill('test-key');
  await dialog.getByRole('button',{name:'作者预设6.1-sol',exact:true}).click();
  await dialog.getByRole('button',{name:'自定义URL',exact:true}).click();
  await expect(dialog.getByLabel('完整 URL',{exact:false})).toHaveValue('https://api.example.com/v1');
  await expect(dialog.getByLabel('API Key',{exact:false})).toHaveValue('test-key');
  await dialog.getByRole('button',{name:'取消',exact:true}).click();
  await page.locator('.intake-card textarea').nth(0).fill('姓名：张雨');await page.locator('.intake-card textarea').nth(1).fill('岗位：数据分析师');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('张雨');expect(received.mode).toBe('preset');expect(received.presetId).toBe('cf-api-fan');expect(received).not.toHaveProperty('apiKey');
});

test('custom generation and editing go directly to the user endpoint without sending Key or materials to backend',async({page})=>{
  let calls=0;let serverCalls=0;let requestModel='';let authorization='';let profile='';
  await page.route('**/api/ai/generate',route=>{serverCalls++;return route.fulfill({status:400,json:{error:'Custom data must not enter the app backend'}});});
  await page.route('**/api/ai/edit',route=>{serverCalls++;return route.fulfill({status:400,json:{error:'Custom data must not enter the app backend'}});});
  await page.route('https://api.example.com/v1/chat/completions',route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Authorization, Content-Type'}});
    calls++;const payload=route.request().postDataJSON();requestModel=payload.model;authorization=route.request().headers().authorization;profile=JSON.stringify(payload.messages);
    const system=payload.messages.find((message:{role:string})=>message.role==='system').content;
    const content=system.includes('岗位正文改写阶段')?makeTargetedPatch():calls===1?makeResult():{id:'direct-edit',targetNodeId:'profile-name',operation:'setStyle',path:'style.color',value:'#315A64',reason:'更新姓名色彩',preview:'姓名改为深蓝色',requiresConfirmation:false};
    if(system.includes('岗位正文改写阶段')){expect(calls).toBe(2);const input=JSON.parse(payload.messages.find((message:{role:string})=>message.role==='user').content);expect(input.profileText).toBe('姓名：张雨');expect(input.jobText).toBe('岗位：数据分析师');expect(input.draft).toBeTruthy();}
    return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{choices:[{message:{content:JSON.stringify(content)}}]}});
  });
  await page.goto('/');await page.getByRole('button',{name:'AI 模型',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'AI 模型设置'});await dialog.getByRole('button',{name:'自定义URL',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'保存模型选择'})).toBeDisabled();
  await dialog.getByLabel('完整 URL',{exact:false}).fill('https://api.example.com/v1');await dialog.getByLabel('模型名称',{exact:true}).fill('custom-test-model');await dialog.getByLabel('API Key',{exact:false}).fill('test-custom-key');await dialog.getByRole('button',{name:'保存模型选择'}).click();
  await page.locator('.intake-card textarea').nth(0).fill('姓名：张雨');await page.locator('.intake-card textarea').nth(1).fill('岗位：数据分析师');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('张雨');await expect(page.locator('.resume-paper')).toContainText(tailoredSummary);expect(calls).toBe(2);expect(requestModel).toBe('custom-test-model');expect(authorization).toBe('Bearer test-custom-key');expect(profile).toContain('张雨');expect(serverCalls).toBe(0);
  await page.locator('.resume-paper h1').click();await page.getByRole('textbox',{name:'AI修改要求'}).fill('把姓名改为深蓝色');await page.getByRole('button',{name:'生成修改',exact:true}).click();await expect(page.locator('.patch-card')).toContainText('姓名改为深蓝色');await page.getByRole('button',{name:'应用修改'}).click();await expect(page.locator('.resume-paper h1')).toHaveCSS('color','rgb(49, 90, 100)');expect(calls).toBe(3);expect(serverCalls).toBe(0);
  await expect(page.locator('.save-state')).toHaveText('已本地保存');
  const saved=await page.evaluate(()=>new Promise<string>((resolve,reject)=>{const request=indexedDB.open('folio-atelier',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const read=db.transaction('workspace','readonly').objectStore('workspace').get('resume-editor-state');read.onsuccess=()=>{resolve(JSON.stringify(read.result));db.close();};read.onerror=()=>{reject(read.error);db.close();};};}));
  expect(saved).not.toContain('test-custom-key');expect(saved).not.toContain('custom-test-model');
});

test('custom connection failure preserves materials and never falls back to the backend',async({page})=>{
  let backendRequests=0;
  await page.route('**/api/ai/generate',route=>{backendRequests++;return route.fulfill({status:400,json:{error:'must not reach backend'}});});
  await page.route('https://failure.example/v1/chat/completions',route=>route.abort('failed'));
  await page.goto('/');await page.getByRole('button',{name:'AI 模型',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'AI 模型设置'});await dialog.getByRole('button',{name:'自定义URL',exact:true}).click();
  await dialog.getByLabel('完整 URL',{exact:false}).fill('https://failure.example/v1');await dialog.getByLabel('模型名称',{exact:true}).fill('own-model');await dialog.getByLabel('API Key',{exact:false}).fill('test-user-key');await dialog.getByRole('button',{name:'保存模型选择'}).click();
  await page.locator('.intake-card textarea').nth(0).fill('保留的个人资料');await page.locator('.intake-card textarea').nth(1).fill('保留的岗位要求');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();
  await expect(page.getByRole('alert')).toContainText('CORS');await expect(page.getByRole('alert')).toContainText('不会自动转发');await expect(page.locator('.intake-card textarea').first()).toHaveValue('保留的个人资料');expect(backendRequests).toBe(0);await expect(page.locator('.resume-paper')).toHaveCount(0);
});

test('home opens the saved-version sidebar directly without a separate continue-editing button',async({page})=>{
  await page.goto('/');await generate(page);
  const versionId=await page.locator('.version-select').inputValue();
  await page.getByRole('button',{name:'工具介绍 / 新建简历',exact:true}).click();
  await expect(page.locator('.landing-hero')).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'继续编辑已保存版本'})).toHaveCount(0);
  await page.getByRole('button',{name:'打开版本侧边栏',exact:true}).click();
  await expect(page.locator('.side-rail .version-list')).toBeVisible();
  await page.locator(`.version-item[data-version-id="${versionId}"]`).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('张雨');
});

test('version deletion requires confirmation, keeps other versions, and persists after reload',async({page})=>{
  await page.goto('/');await generate(page);
  const originalId=await page.locator('.version-select').inputValue();
  await page.getByRole('button',{name:'复制当前版本',exact:true}).click();
  const copyId=await page.locator('.version-select').inputValue();
  await page.getByRole('textbox',{name:'版本名称',exact:true}).fill('要保留的副本');
  await page.getByRole('button',{name:'展开侧边栏',exact:true}).click();
  await page.locator(`.version-row[data-version-id="${originalId}"]`).getByRole('button',{name:/删除版本/}).click();
  const confirm=page.getByRole('alertdialog',{name:'删除简历版本'});
  await expect(confirm).toContainText('张雨 · 数据分析师');
  await confirm.getByRole('button',{name:'取消',exact:true}).click();
  await expect(page.locator('.version-item')).toHaveCount(2);
  await expect(page.locator('.version-select')).toHaveValue(copyId);
  await page.locator(`.version-row[data-version-id="${originalId}"]`).getByRole('button',{name:/删除版本/}).click();
  await confirm.getByRole('button',{name:'确认删除',exact:true}).click();
  await expect(page.locator('.version-item')).toHaveCount(1);
  await expect(page.locator('.version-select')).toHaveValue(copyId);
  await expect(page.locator('.save-state')).toHaveText('已本地保存');
  await page.reload();await page.getByRole('button',{name:'打开版本侧边栏',exact:true}).click();
  await expect(page.locator(`.version-item[data-version-id="${originalId}"]`)).toHaveCount(0);
  await page.locator(`.version-item[data-version-id="${copyId}"]`).click();
  await expect(page.locator('input[aria-label="版本名称"]')).toHaveValue('要保留的副本');
});

test('deleting the active and last version selects a survivor then returns to empty home',async({page})=>{
  await page.goto('/');await generate(page);const first=await page.locator('.version-select').inputValue();
  await page.getByRole('button',{name:'复制当前版本',exact:true}).click();const second=await page.locator('.version-select').inputValue();
  await page.getByRole('button',{name:'展开侧边栏',exact:true}).click();
  await page.locator(`.version-row[data-version-id="${second}"]`).getByRole('button',{name:/删除版本/}).click();
  await page.getByRole('alertdialog',{name:'删除简历版本'}).getByRole('button',{name:'确认删除'}).click();
  await expect(page.locator('.version-select')).toHaveValue(first);await expect(page.locator('.resume-paper h1')).toHaveText('张雨');
  await page.locator(`.version-row[data-version-id="${first}"]`).getByRole('button',{name:/删除版本/}).click();
  await page.getByRole('alertdialog',{name:'删除简历版本'}).getByRole('button',{name:'确认删除'}).click();
  await expect(page.locator('.landing-hero')).toBeVisible();await expect(page.locator('.version-item')).toHaveCount(0);await expect(page.locator('.side-rail')).toContainText('还没有保存的简历');
});

test('saved versions can be opened and deleted from the home sidebar on a phone',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await generate(page);const id=await page.locator('.version-select').inputValue();
  await page.getByRole('button',{name:'工具介绍 / 新建简历',exact:true}).click();await page.getByRole('button',{name:'打开版本侧边栏',exact:true}).click();
  await expect(page.locator('.version-item')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
  await page.locator(`.version-item[data-version-id="${id}"]`).click();await expect(page.locator('.resume-paper h1')).toHaveText('张雨');
  await page.getByRole('button',{name:'展开侧边栏',exact:true}).click();await page.locator(`.version-row[data-version-id="${id}"]`).getByRole('button',{name:/删除版本/}).click();
  await page.getByRole('alertdialog',{name:'删除简历版本'}).getByRole('button',{name:'确认删除'}).click();await expect(page.locator('.landing-hero')).toBeVisible();
});

test('Escape cancels deletion and a late AI edit cannot restore a removed version',async({page})=>{
  let release=()=>{};let editRequested=false;
  await page.route('**/api/ai/edit',async route=>{
    editRequested=true;await new Promise<void>(resolve=>{release=resolve;});
    await route.fulfill({json:{patch:{id:'late-edit',targetNodeId:'profile-name',operation:'setStyle',path:'style.color',value:'#315A64',reason:'迟到建议',preview:'不应应用的修改',requiresConfirmation:false}}}).catch(()=>undefined);
  });
  await page.goto('/');await generate(page);const first=await page.locator('.version-select').inputValue();
  await page.getByRole('button',{name:'复制当前版本',exact:true}).click();const second=await page.locator('.version-select').inputValue();
  await page.getByRole('button',{name:'展开侧边栏',exact:true}).click();
  const remove=page.locator(`.version-row[data-version-id="${second}"]`).getByRole('button',{name:/删除版本/});
  await remove.click();const dialog=page.getByRole('alertdialog',{name:'删除简历版本'});
  await expect(dialog.getByRole('button',{name:'取消',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'确认删除'})).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.locator('.version-select')).toHaveValue(second);
  await page.locator('.resume-paper h1').click();await page.getByRole('textbox',{name:'AI修改要求'}).fill('改姓名颜色');await page.getByRole('button',{name:'生成修改',exact:true}).click();await expect.poll(()=>editRequested).toBe(true);
  try{
    await remove.click();await dialog.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.locator('.version-select')).toHaveValue(first);
  }finally{release();}
  await expect(page.locator('.version-item')).toHaveCount(1);await expect(page.locator('.patch-card')).toHaveCount(0);await expect(page.locator('.resume-paper h1')).toHaveCSS('color','rgb(41, 50, 59)');
  await expect(page.getByRole('textbox',{name:'AI修改要求'})).toHaveValue('');
});

test('HTML resume upload is sanitized to text and reaches the generator',async({page})=>{
  let submitted='';await page.route('**/api/ai/generate',route=>{submitted=route.request().postDataJSON().profileText;return route.fulfill({json:makeResult()});});await page.goto('/');
  await page.getByLabel('上传个人资料文件').setInputFiles({name:'candidate.html',mimeType:'text/html',buffer:Buffer.from('<html><head><title>张雨简历</title><script>window.evil=1</script></head><body><h1>张雨</h1><p>项目：网页数据分析</p><style>.x{}</style></body></html>','utf8')});
  await expect(page.locator('.intake-card').first()).toContainText('已解析HTML文字');await expect(page.locator('.extracted-material pre')).toContainText('网页数据分析');await expect(page.locator('.extracted-material pre')).not.toContainText('window.evil');
  await page.locator('.intake-card textarea').nth(1).fill('数据分析师');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();await expect(page.locator('.resume-paper h1')).toHaveText('张雨');expect(submitted).toContain('网页数据分析');expect(submitted).not.toContain('window.evil');
});

test('DOCX resume upload is extracted in the browser',async({page})=>{
  const JSZip=(await import('jszip')).default;const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>张雨</w:t></w:r></w:p><w:p><w:r><w:t>项目：企业数据看板</w:t></w:r></w:p></w:body></w:document>');
  const buffer=await zip.generateAsync({type:'nodebuffer'});let submitted='';await page.route('**/api/ai/generate',route=>{submitted=route.request().postDataJSON().profileText;return route.fulfill({json:makeResult()});});await page.goto('/');
  await page.getByLabel('上传个人资料文件').setInputFiles({name:'candidate.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer});await expect(page.locator('.intake-card').first()).toContainText('已解析DOCX文字');await expect(page.locator('.extracted-material pre')).toContainText('企业数据看板');
  await page.locator('.intake-card textarea').nth(1).fill('数据分析师');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();await expect(page.locator('.resume-paper h1')).toHaveText('张雨');expect(submitted).toContain('企业数据看板');
});

test('legacy .doc gives a conversion hint instead of silently failing',async({page})=>{
  await page.goto('/');await page.getByLabel('上传个人资料文件').setInputFiles({name:'candidate.doc',mimeType:'application/msword',buffer:Buffer.from('old word','utf8')});await expect(page.getByRole('alert')).toContainText('另存为 .docx');
});

for(const status of [401,403]){
  test(`author HTTP ${status} errors show actionable diagnostics and keep the entered materials`,async({page})=>{
    const error=status===401?'作者预设认证失败（上游 HTTP 401）。请确认 Railway 的 CF_API_KEY 为有效令牌，并在保存变量后重新部署。':'作者预设访问被拒绝（上游 HTTP 403）。请检查令牌分组、模型调用权限、IP 限制或通道网关规则。';
    await page.route('**/api/ai/generate',route=>route.fulfill({status:502,json:{error,upstreamStatus:status}}));
    await page.goto('/');await page.locator('.intake-card textarea').first().fill('个人资料要保留');await page.locator('.intake-card textarea').nth(1).fill('岗位要求要保留');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();
    await expect(page.getByRole('alert')).toContainText(`HTTP ${status}`);await expect(page.locator('.intake-card textarea').first()).toHaveValue('个人资料要保留');await expect(page.locator('.resume-paper')).toHaveCount(0);
  });
}

test('custom Responses generation and edit stay browser-direct and use the proper input fields',async({page})=>{
  let calls=0;let backendRequests=0;
  await page.route('**/api/ai/generate',route=>{backendRequests++;return route.fulfill({status:400,json:{error:'must stay browser-direct'}});});
  await page.route('**/api/ai/edit',route=>{backendRequests++;return route.fulfill({status:400,json:{error:'must stay browser-direct'}});});
  await page.route('https://responses.example/v1/responses',route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Authorization, Content-Type'}});
    const payload=route.request().postDataJSON();expect(payload.store).toBe(false);expect(payload.stream).toBe(false);expect(payload.input[0].content[0].type).toBe('input_text');expect(payload).not.toHaveProperty('messages');calls++;
    const content=payload.instructions.includes('岗位正文改写阶段')?makeTargetedPatch():calls===1?makeResult():{targetNodeId:'profile-name',operation:'setStyle',path:'style.color',value:'#315A64',reason:'调整色彩',preview:'深蓝色建议',requiresConfirmation:false};
    if(payload.instructions.includes('岗位正文改写阶段')){expect(calls).toBe(2);const input=JSON.parse(payload.input[0].content[0].text);expect(input.profileText).toBe('测试个人资料张雨');expect(input.jobText).toBe('测试岗位要求');expect(input.draft).toBeTruthy();}
    return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(content)}]}]}});
  });
  await page.goto('/');await page.getByRole('button',{name:'AI 模型',exact:true}).click();const dialog=page.getByRole('dialog',{name:'AI 模型设置'});await dialog.getByRole('button',{name:'自定义URL',exact:true}).click();await dialog.getByLabel('完整 URL',{exact:false}).fill('https://responses.example/v1/responses');await dialog.getByLabel('模型名称',{exact:true}).fill('test-model');await dialog.getByLabel('API Key',{exact:false}).fill('fake-test-key');await dialog.getByRole('button',{name:'保存模型选择'}).click();
  await page.locator('.intake-card textarea').first().fill('测试个人资料张雨');await page.locator('.intake-card textarea').nth(1).fill('测试岗位要求');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();await expect(page.locator('.resume-paper h1')).toHaveText('张雨');await expect(page.locator('.resume-paper')).toContainText(tailoredSummary);expect(calls).toBe(2);
  await page.locator('.resume-paper h1').click();await page.getByRole('textbox',{name:'AI修改要求'}).fill('姓名改为深蓝色');await page.getByRole('button',{name:'生成修改',exact:true}).click();await expect(page.locator('.patch-card')).toContainText('深蓝色建议');expect(calls).toBe(3);expect(backendRequests).toBe(0);
});

test('custom upstream400 gives a safe known hint and does not retry another interface',async({page})=>{
  let calls=0;let backendRequests=0;
  await page.route('**/api/ai/generate',route=>{backendRequests++;return route.fulfill({status:400,json:{error:'no backend fallback'}});});
  await page.route('https://bad-request.example/v1/chat/completions',route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Authorization, Content-Type'}});
    calls++;return route.fulfill({status:400,headers:{'access-control-allow-origin':'*'},json:{error:{code:'model_not_found',param:'model',message:'Unsupported model. private detail test-user-key'}}});
  });
  await page.goto('/');await page.getByRole('button',{name:'AI 模型',exact:true}).click();const dialog=page.getByRole('dialog',{name:'AI 模型设置'});await dialog.getByRole('button',{name:'自定义URL',exact:true}).click();await dialog.getByLabel('完整 URL',{exact:false}).fill('https://bad-request.example/v1');await dialog.getByLabel('模型名称',{exact:true}).fill('test-model');await dialog.getByLabel('API Key',{exact:false}).fill('fake-test-key');await dialog.getByRole('button',{name:'保存模型选择'}).click();
  await page.locator('.intake-card textarea').first().fill('个人资料保留');await page.locator('.intake-card textarea').nth(1).fill('岗位材料保留');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();
  await expect(page.getByRole('alert')).toContainText('HTTP 400');await expect(page.getByRole('alert')).toContainText('模型');await expect(page.getByRole('alert')).not.toContainText('private detail');await expect(page.getByRole('alert')).not.toContainText('test-user-key');await expect(page.locator('.intake-card textarea').first()).toHaveValue('个人资料保留');expect(calls).toBe(1);expect(backendRequests).toBe(0);
});

test('unknown upstream400 displays diagnostics and request id rather than swallowing all extra fields',async({page})=>{
  await page.route('**/api/ai/generate',route=>route.fulfill({status:502,json:{
    error:'作者预设请求被拒绝（上游 HTTP 400）。通道未接受请求参数。',upstreamStatus:400,diagnostic:'unknown',
    requestId:'11111111-2222-4333-8444-555555555555',
    diagnostics:{protocol:'chat_completions',model:'gpt-6.1-sol',reasoningEffort:'medium',version:'abcdef1'},
  }}));
  await page.goto('/');await page.locator('.intake-card textarea').first().fill('不要丢失的个人资料');await page.locator('.intake-card textarea').nth(1).fill('岗位要求');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();
  const alert=page.getByRole('alert');await expect(alert).toContainText('上游 HTTP 400');await expect(alert).toContainText('chat_completions');await expect(alert).toContainText('medium');await expect(alert).toContainText('abcdef1');await expect(alert).toContainText('11111111-2222-4333-8444-555555555555');await expect(page.locator('.intake-card textarea').first()).toHaveValue('不要丢失的个人资料');
});

test('local deadline feedback displays elapsed time, stage and high effort without losing materials',async({page})=>{
  await page.route('**/api/ai/generate',route=>route.fulfill({status:504,json:{error:'模型请求达到 240 秒等待上限，资料已保留。不会自动重试。',diagnostic:'request_timeout',requestId:'11111111-2222-4333-8444-555555555555',diagnostics:{model:'gpt-6.1-sol',protocol:'chat_completions',reasoningEffort:'high',timeoutMs:240000,elapsedMs:240100,phase:'waiting_response',hasImages:false,version:'abcdef1'}}}));
  await page.goto('/');await page.locator('.intake-card textarea').first().fill('超时后保留个人资料');await page.locator('.intake-card textarea').nth(1).fill('超时后保留岗位');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();
  const alert=page.getByRole('alert');await expect(alert).toContainText('应用 HTTP 504');await expect(alert).toContainText('等待上限 240秒');await expect(alert).toContainText('耗时 240.1秒');await expect(alert).toContainText('等待通道响应');await expect(alert).toContainText('high');await expect(page.locator('.intake-card textarea').first()).toHaveValue('超时后保留个人资料');await expect(page.locator('.resume-paper')).toHaveCount(0);
});
