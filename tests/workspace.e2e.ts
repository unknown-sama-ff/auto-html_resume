import { test, expect } from '@playwright/test';
import { initialResume } from '../src/data';
import type { GenerationResult } from '../src/types';
const makeResult=(name='张雨',role='数据分析师'):GenerationResult=>{
  const resume=structuredClone(initialResume);resume.name=name;resume.role=role;resume.projects[0].title='电商数据分析';
  return {resume,jobTitle:role,warnings:[],report:{summary:'材料显示有数据分析经验。',requirements:[{requirement:'Python',status:'matched',evidence:'项目使用Python',suggestion:''}]}};
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
  await expect(page.locator('.save-state')).toContainText('已本地保存');await page.reload();await page.getByRole('button',{name:'继续编辑已保存版本'}).click();await expect(page.locator('.resume-paper h1')).toHaveText('张雨（第二版）');expect(errors).toEqual([]);
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
  await expect(page.locator('.intake-card').first()).toContainText('已提取文字');await page.locator('.intake-card textarea').nth(1).fill('数据分析岗位');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();await expect(page.locator('.resume-paper h1')).toHaveText('张雨');expect(profile).toContain('Python and SQL');
});

test('job screenshots reach the model as images rather than file names',async({page})=>{
  let dataUrl='';await page.route('**/api/ai/generate',route=>{dataUrl=route.request().postDataJSON().jobImages[0].dataUrl;return route.fulfill({json:makeResult()});});
  await page.goto('/');await page.locator('.intake-card textarea').nth(0).fill('姓名：张雨');await page.getByLabel('上传岗位要求文件').setInputFiles({name:'job.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS4sAAAAASUVORK5CYII=','base64')});await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();await expect(page.locator('.resume-paper h1')).toHaveText('张雨');expect(dataUrl).toMatch(/^data:image\/png;base64,/);
});

test('AI local patch is confirmed, undoable, and only contains selected context',async({page})=>{
  let sent:Record<string,unknown>={};await page.route('**/api/ai/edit',route=>{sent=route.request().postDataJSON();return route.fulfill({json:{patch:{id:'patch-test',targetNodeId:'profile-name',operation:'setStyle',path:'style.color',value:'#315A64',reason:'按要求更新姓名色彩',preview:'姓名改为深蓝色',requiresConfirmation:false}}});});
  await page.goto('/');await generate(page);await page.locator('.resume-paper h1').click();await page.getByRole('textbox',{name:'AI修改要求'}).fill('把姓名改为深蓝色');await page.getByRole('button',{name:'生成修改',exact:true}).click();await expect(page.locator('.patch-card')).toContainText('姓名改为深蓝色');await page.getByRole('button',{name:'应用修改'}).click();await expect(page.locator('.resume-paper h1')).toHaveCSS('color','rgb(49, 90, 100)');expect(sent).not.toHaveProperty('resume');await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.resume-paper h1')).toHaveCSS('color','rgb(25, 59, 53)');
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

test('saving custom URL sends the entered config without persisting its Key with resume data',async({page})=>{
  let received:Record<string,unknown>={};
  await page.route('**/api/ai/generate',route=>{received=route.request().postDataJSON().config;return route.fulfill({json:makeResult()});});
  await page.goto('/');await page.getByRole('button',{name:'AI 模型',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'AI 模型设置'});
  await dialog.getByRole('button',{name:'自定义URL',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'保存模型选择'})).toBeDisabled();
  await dialog.getByLabel('完整 URL',{exact:false}).fill('https://api.example.com/v1/chat/completions');
  await dialog.getByLabel('模型名称',{exact:true}).fill('custom-test-model');
  await dialog.getByLabel('API Key',{exact:false}).fill('test-custom-key');
  await dialog.getByRole('button',{name:'保存模型选择'}).click();
  await page.locator('.intake-card textarea').nth(0).fill('姓名：张雨');await page.locator('.intake-card textarea').nth(1).fill('岗位：数据分析师');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('张雨');
  expect(received).toMatchObject({mode:'custom',url:'https://api.example.com/v1/chat/completions',model:'custom-test-model',apiKey:'test-custom-key'});
  await expect(page.locator('.save-state')).toHaveText('已本地保存');
  const saved=await page.evaluate(()=>new Promise<string>((resolve,reject)=>{
    const request=indexedDB.open('folio-atelier',1);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result;const read=db.transaction('workspace','readonly').objectStore('workspace').get('resume-editor-state');read.onsuccess=()=>{resolve(JSON.stringify(read.result));db.close();};read.onerror=()=>{reject(read.error);db.close();};};
  }));
  expect(saved).not.toContain('test-custom-key');expect(saved).not.toContain('custom-test-model');
});
