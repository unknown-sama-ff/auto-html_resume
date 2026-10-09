import { test, expect } from '@playwright/test';
import { initialResume } from '../src/data';
import { RESUME_TEMPLATES } from '../shared/design';

test.beforeEach(async({page})=>{
  await page.route('**/api/ai/presets',route=>route.fulfill({json:[]}));
});
async function createResume(page:import('@playwright/test').Page, resume=initialResume) {
  await page.route('**/api/ai/generate',route=>route.fulfill({json:{resume,jobTitle:'工程师',report:{summary:'测试',requirements:[]},warnings:[]}}));
  await page.goto('/');await page.locator('.intake-card textarea').first().fill('测试个人资料\n遗漏的志愿活动事实');await page.locator('.intake-card textarea').nth(1).fill('工程师岗位');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();await expect(page.locator('.resume-paper h1')).toHaveText(resume.name);
}
async function downloadedHtml(page:import('@playwright/test').Page) {
  const promise=page.waitForEvent('download');await page.getByRole('button',{name:'导出 HTML',exact:true}).click();const download=await promise;
  const stream=await download.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks).toString('utf8');
}

test('six templates retain selection, facts, undo, duplication and local persistence',async({page})=>{
  await createResume(page);await page.locator('[data-node-id="project-1-title"]').click();
  for(const {id,label} of RESUME_TEMPLATES){
    await page.locator('.workspace-design').getByRole('button',{name:new RegExp(label)}).click();
    await expect(page.locator('.resume-paper')).toHaveAttribute('data-template',id);
    await expect(page.locator('.resume-paper')).toContainText(initialResume.education[0].school);
    await expect(page.locator('[data-node-id="project-1-title"]')).toHaveClass(/is-selected/);
    await expect(page.locator('.selected-context-chip')).toContainText(initialResume.projects[0].title);
  }
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.resume-paper')).toHaveAttribute('data-template','timeline');
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.locator('.resume-paper')).toHaveAttribute('data-template','modern');
  await page.getByRole('button',{name:'复制当前版本'}).click();const id=await page.locator('.version-select').inputValue();await expect(page.locator('.save-state')).toContainText('已本地保存');await page.reload();await page.getByRole('button',{name:'打开版本侧边栏'}).click();await page.locator(`.version-item[data-version-id="${id}"]`).click();await expect(page.locator('.resume-paper')).toHaveAttribute('data-template','modern');
});

test('page design suggestions preview before confirmation and send only selected design context',async({page})=>{
  await createResume(page);let selection:Record<string,unknown>={};
  await page.route('**/api/ai/edit',route=>{selection=route.request().postDataJSON().selection;return route.fulfill({json:{patch:{id:'theme',targetNodeId:'page',operation:'setTheme',path:'design.templateId',value:'academic',reason:'教育优先',preview:'影响整页：学术研究',requiresConfirmation:true}}});});
  await page.getByRole('button',{name:'让 AI 调整整页设计'}).click();await page.getByRole('textbox',{name:'AI修改要求'}).fill('学术研究风格');await page.getByRole('button',{name:'生成修改',exact:true}).click();await expect(page.locator('.patch-card')).toContainText('影响整页');await expect(page.locator('.resume-paper')).toHaveAttribute('data-template','minimal');
  expect(selection.id).toBe('page');expect(selection.design).toBeTruthy();expect(JSON.stringify(selection)).not.toContain('遗漏的志愿活动事实');
  await page.getByRole('button',{name:'预览建议',exact:true}).click();await expect(page.locator('.resume-paper')).toHaveAttribute('data-template','academic');
  await page.getByRole('button',{name:'放弃',exact:true}).click();await expect(page.locator('.resume-paper')).toHaveAttribute('data-template','minimal');
});

test('source review restores omitted facts into editable sections and deletion is undoable',async({page})=>{
  await createResume(page);await page.locator('.source-review > summary').click();
  const review=page.locator('.source-review');
  await expect(review.locator('textarea')).toHaveCount(0);
  await expect(review.getByRole('button',{name:'添加栏目',exact:true})).toHaveCount(0);
  await expect(page.getByLabel('补充栏目名称')).toHaveCount(0);
  await page.getByLabel('遗漏的志愿活动事实',{exact:true}).check();await page.getByLabel('补充栏目名称').fill('志愿服务');await page.getByRole('button',{name:'将 1 条原文加入简历'}).click();await expect(page.locator('.resume-paper')).toContainText('遗漏的志愿活动事实');
  await expect(review.locator('.custom-section-list')).toHaveCount(0);
  await expect(page.getByLabel('补充栏目名称')).toHaveCount(0);
  await page.locator('.custom-content').click();await page.getByRole('textbox',{name:'选中区块的内容'}).fill('社区志愿服务原文补回');await page.getByRole('button',{name:'保存内容',exact:true}).click();await expect(page.locator('.resume-paper')).toContainText('社区志愿服务原文补回');
  await page.getByRole('button',{name:'删除栏目 志愿服务'}).click();await expect(page.locator('.custom-content')).toHaveCount(0);await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.resume-paper')).toContainText('社区志愿服务原文补回');
});

test('generic HTML headings and table cells keep unfamiliar sections before generation',async({page})=>{
  await page.goto('/');await page.getByLabel('上传个人资料文件').setInputFiles({name:'resume.html',mimeType:'text/html',buffer:Buffer.from('<html><body><header>测试姓名</header><main><section><h2>教育经历</h2><table><tr><td>真实大学</td><td>工程管理</td></tr></table></section><section><h2>海外志愿服务</h2><p>完整保留的社区活动事实</p></section></main><script>window.evil=true</script></body></html>')});
  await page.locator('.extracted-material summary').first().click();await expect(page.locator('.extracted-material pre').first()).toContainText('[海外志愿服务]');await expect(page.locator('.extracted-material pre').first()).toContainText('真实大学 | 工程管理');expect(await page.evaluate(()=>('evil' in window))).toBe(false);
});

test('mobile template controls do not introduce horizontal page overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await createResume(page);
  await page.locator('.workspace-design').getByRole('button',{name:/现代侧栏/}).click();await expect(page.locator('.resume-paper')).toHaveAttribute('data-template','modern');expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
});

test('all exported layouts are self-contained and match preview geometry and facts',async({page,context})=>{
  await createResume(page);const exported=await context.newPage();let external=0;
  await exported.route('https://**',route=>{external++;return route.abort();});
  for(const {id,label} of RESUME_TEMPLATES){
    await page.locator('.workspace-design').getByRole('button',{name:new RegExp(label)}).click();const html=await downloadedHtml(page);expect(html).not.toContain('@import');expect(html).not.toContain('<button');expect(html).not.toContain('遗漏的志愿活动事实');
    await exported.setContent(html);await expect(exported.locator('.resume-paper')).toHaveAttribute('data-template',id);await expect(exported.locator('.resume-paper')).toContainText(initialResume.education[0].school);
    const metric=await exported.locator('.resume-paper').evaluate(e=>({width:e.getBoundingClientRect().width,overflow:e.scrollWidth-e.clientWidth}));expect(metric.width).toBe(794);expect(metric.overflow).toBeLessThanOrEqual(2);
    await exported.locator('.resume-paper').screenshot({path:`.tmp/templates/${id}.png`});
    const printPadding=await exported.locator('.resume-paper').evaluate(e=>getComputedStyle(e).padding);await exported.emulateMedia({media:'print'});expect(await exported.locator('.resume-paper').evaluate(e=>getComputedStyle(e).padding)).toBe(printPadding);
    if(['minimal','editorial','academic'].includes(id))expect(await exported.locator('.section-heading').first().evaluate(e=>getComputedStyle(e,'::after').display)).not.toBe('none');
    await exported.emulateMedia({media:'screen'});
  }
  expect(external).toBe(0);await exported.close();
});

test('explicit home template is submitted and wins over a conflicting model suggestion',async({page})=>{
  let selected='';await page.route('**/api/ai/generate',route=>{selected=route.request().postDataJSON().templateId;return route.fulfill({json:{resume:initialResume,jobTitle:'工程师',report:{summary:'',requirements:[]},warnings:[]}});});
  await page.goto('/');await page.locator('.intake-design').getByRole('button',{name:/现代侧栏/}).click();await page.locator('.intake-card textarea').first().fill('个人经历测试');await page.locator('.intake-card textarea').nth(1).fill('岗位要求测试');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();await expect(page.locator('.resume-paper')).toHaveAttribute('data-template','modern');expect(selected).toBe('modern');
});

test('real PDFs retain long single entries, final custom facts and all six layouts across pages',async({page,context},testInfo)=>{
  test.setTimeout(90000);
  const resume=structuredClone(initialResume);resume.projects=Array.from({length:4},(_,index)=>({id:`long-${index}`,title:`PDF_PROJECT_${index}`,meta:'2024 — 2026',stack:[],description:Array.from({length:index===0?30:12},(_,line)=>`FACT_${index}_${line}: Mixed English and 中文真实项目内容，保留学校课程与完整事实。${'Long content wraps without clipping. '.repeat(6)}`)}));resume.customSections=[{id:'final-section',title:'自定义栏目',items:['PDF_FINAL_FACT_987654321']}];
  await createResume(page,resume);const printed=await context.newPage();
  for(const {id,label} of RESUME_TEMPLATES){
    await page.locator('.workspace-design').getByRole('button',{name:new RegExp(label)}).click();await printed.setContent(await downloadedHtml(page));
    const pdf=await printed.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});await testInfo.attach(`long-${id}.pdf`,{body:pdf,contentType:'application/pdf'});
    const facts=await page.evaluate(async base64=>{
      const modulePath='/node_modules/pdfjs-dist/build/pdf.mjs';
      const pdfjs=await import(modulePath);pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/build/pdf.worker.mjs';
      const task=pdfjs.getDocument({data:Uint8Array.from(atob(base64),char=>char.charCodeAt(0))});const doc=await task.promise;const pages:string[]=[];
      for(let i=1;i<=doc.numPages;i++){const content=await(await doc.getPage(i)).getTextContent();pages.push(content.items.map((item:{str?:string})=>item.str??'').join(' '));}
      await task.destroy();return pages;
    },pdf.toString('base64'));
    expect(facts.length).toBeGreaterThan(1);expect(facts.length).toBeLessThan(15);expect(facts.every(text=>text.trim().length>0)).toBe(true);
    const text=facts.join(' ');expect(text).toContain('PDF_FINAL_FACT_987654321');for(const item of resume.projects)for(const line of item.description)expect(text).toContain(line.split(':')[0]);
  }
  await printed.close();
});
