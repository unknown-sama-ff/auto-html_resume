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
async function extractPdfPages(pdf: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), disableWorker: true });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map(item => 'str' in item ? item.str : '').join(' '));
  }
  await doc.cleanup();
  await task.destroy();
  return pages;
}

test('all templates retain selection, facts, undo, duplication and local persistence',async({page})=>{
  test.setTimeout(90000);
  await createResume(page);await page.locator('[data-node-id="project-1-title"]').click();
  for(const {id,label} of RESUME_TEMPLATES){
    await page.locator('.workspace-design').getByRole('button',{name:new RegExp(label)}).click();
    await expect(page.locator('.resume-paper')).toHaveAttribute('data-template',id);
    await expect(page.locator('.resume-paper')).toContainText(initialResume.education[0].school);
    await expect(page.locator('[data-node-id="project-1-title"]')).toHaveClass(/is-selected/);
    await expect(page.locator('.selected-context-chip')).toContainText(initialResume.projects[0].title);
  }
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.resume-paper')).toHaveAttribute('data-template',RESUME_TEMPLATES.at(-2)!.id);
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.locator('.resume-paper')).toHaveAttribute('data-template',RESUME_TEMPLATES.at(-1)!.id);
  await page.getByRole('button',{name:'复制当前版本'}).click();const id=await page.locator('.version-select').inputValue();await expect(page.locator('.save-state')).toContainText('已本地保存');await page.reload();await page.getByRole('button',{name:'打开版本侧边栏'}).click();await page.locator(`.version-item[data-version-id="${id}"]`).click();await expect(page.locator('.resume-paper')).toHaveAttribute('data-template',RESUME_TEMPLATES.at(-1)!.id);
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
  test.setTimeout(90000);
  await page.setViewportSize({width:390,height:844});await createResume(page);
  for(const {id,label} of RESUME_TEMPLATES){
    await page.locator('.workspace-design').getByRole('button',{name:new RegExp(label)}).click();await expect(page.locator('.resume-paper')).toHaveAttribute('data-template',id);expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
  }
});

test('portfolio keyboard drag moves between the main area and stacked support index',async({page})=>{
  await createResume(page);
  await page.locator('.workspace-design').getByRole('button',{name:/作品展示/}).click();
  const main=page.locator('.resume-main-sections'),support=page.locator('.resume-support-grid');
  async function move(label:string,direction:string){
    const handle=page.getByRole('button',{name:'拖动栏目 '+label,exact:true});
    await handle.scrollIntoViewIfNeeded();await handle.hover();await handle.focus();
    const overlay=page.locator('.section-drag-overlay').filter({hasText:label});
    await page.keyboard.press('Space');await expect(overlay).toBeVisible();
    await page.keyboard.press(direction);await page.keyboard.press('Space');await expect(overlay).toBeHidden();
  }
  async function undo(){await page.locator('.preview-toolbar').getByRole('button',{name:'撤销',exact:true}).click();}
  await move('项目经历','ArrowRight');
  await expect(support.locator('[data-section="projects"]')).toHaveCount(1);
  await expect(main.locator('[data-section="projects"]')).toHaveCount(0);
  await undo();await expect(main.locator('[data-section="projects"]')).toHaveCount(1);
  await move('教育经历','ArrowLeft');
  await expect(main.locator('[data-section="education"]')).toHaveCount(1);
  await expect(support.locator('[data-section="education"]')).toHaveCount(0);
  await undo();await expect(support.locator('[data-section="education"]')).toHaveCount(1);
  await move('工作 / 实习经历','ArrowDown');
  await expect(support.locator('[data-section="experience"]')).toHaveCount(1);
  await undo();await expect(main.locator('[data-section="experience"]')).toHaveCount(1);
  await move('核心技能','ArrowUp');
  await expect(main.locator('[data-section="skills"]')).toHaveCount(1);
  await expect(support.locator('[data-section="skills"]')).toHaveCount(0);
  for(const fact of [initialResume.projects[0].title,initialResume.education[0].school,initialResume.skills[0].label])await expect(page.locator('.resume-paper')).toContainText(fact);
});

test('campus supports left/right keyboard moves including an empty side column',async({page})=>{
  const resume=structuredClone(initialResume);resume.education=[];resume.skills=[];resume.awards=[];
  resume.customSections=[{id:'keyboard-facts',title:'语言与研究',items:['NEW_TEMPLATE_CUSTOM_FACT']}];
  await createResume(page,resume);
  await page.locator('.workspace-design').getByRole('button',{name:/校园新锐/}).click();
  const main=page.locator('.resume-main-column, .resume-main-sections').last();
  const side=page.locator('.resume-side-column, .resume-side-sections').last();
  async function move(label:string,direction:string){
    const handle=page.getByRole('button',{name:'拖动栏目 '+label,exact:true});
    await handle.scrollIntoViewIfNeeded();await handle.hover();await handle.focus();
    const overlay=page.locator('.section-drag-overlay').filter({hasText:label});
    await page.keyboard.press('Space');await expect(overlay).toBeVisible();
    await page.keyboard.press(direction);await page.keyboard.press('Space');await expect(overlay).toBeHidden();
  }
  await expect(side.locator('[data-section]')).toHaveCount(0);
  await move('项目经历','ArrowLeft');
  await expect(side.locator('[data-section="projects"]')).toHaveCount(1);
  await expect(main.locator('[data-section="projects"]')).toHaveCount(0);
  await move('项目经历','ArrowRight');
  await expect(main.locator('[data-section="projects"]')).toHaveCount(1);
  await expect(side.locator('[data-section="projects"]')).toHaveCount(0);
  await move('语言与研究','ArrowLeft');
  await expect(side.locator('[data-section="custom-keyboard-facts"]')).toContainText('NEW_TEMPLATE_CUSTOM_FACT');
  await move('语言与研究','ArrowRight');
  await expect(main.locator('[data-section="custom-keyboard-facts"]')).toContainText('NEW_TEMPLATE_CUSTOM_FACT');
});

test('new template cards uses the same conventional left/right column navigation',async({page})=>{
  await createResume(page);await page.locator('.workspace-design').getByRole('button',{name:/信息卡片/}).click();
  const main=page.locator('.resume-main-column, .resume-main-sections').last();
  const side=page.locator('.resume-side-column, .resume-side-sections').last();
  const handle=page.getByRole('button',{name:'拖动栏目 项目经历',exact:true});await handle.scrollIntoViewIfNeeded();await handle.hover();await handle.focus();
  const overlay=page.locator('.section-drag-overlay').filter({hasText:'项目经历'});
  await page.keyboard.press('Space');await expect(overlay).toBeVisible();await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');await expect(overlay).toBeHidden();
  await expect(side.locator('[data-section="projects"]')).toHaveCount(1);await expect(main.locator('[data-section="projects"]')).toHaveCount(0);
});

test('cards heading choices control title borders in preview and exported HTML',async({page,context})=>{
  await createResume(page);await page.locator('.workspace-design').getByRole('button',{name:/信息卡片/}).click();
  await expect(page.getByLabel('标题风格')).toHaveValue('plain');
  const exported=await context.newPage();
  for(const mode of ['plain','accent','line']){
    if(mode!=='plain')await page.getByLabel('标题风格').selectOption(mode);
    const border=mode==='line'?1:0;
    expect(await page.locator('.section-heading').evaluateAll(elements=>elements.map(element=>parseFloat(getComputedStyle(element).borderBottomWidth)))).toEqual(Array(await page.locator('.section-heading').count()).fill(border));
    await exported.setContent(await downloadedHtml(page));
    expect(await exported.locator('.section-heading').evaluateAll(elements=>elements.map(element=>parseFloat(getComputedStyle(element).borderBottomWidth)))).toEqual(Array(await exported.locator('.section-heading').count()).fill(border));
  }
  await exported.close();
});

test('new templates wrap long edited experience periods within column and paper bounds',async({page,context})=>{
  test.setTimeout(60000);
  const resume=structuredClone(initialResume);resume.sectionColumns.experience='side';
  await createResume(page,resume);
  const period='2020.01 - 2026.10 · '+'跨部门项目协作'.repeat(10);
  const field=page.locator('[data-node-id="experience-1-period"]');await field.fill(period);await field.press('Enter');
  const exported=await context.newPage();
  async function withinBounds(target:import('@playwright/test').Page){
    await expect(target.locator('[data-node-id="experience-1-period"]')).toHaveText(period);
    const metrics=await target.locator('[data-node-id="experience-1-period"]').evaluate(element=>{
      const header=element.closest('.experience-header')!,paper=element.closest('.resume-paper') as HTMLElement;
      const rect=element.getBoundingClientRect(),headerRect=header.getBoundingClientRect(),paperRect=paper.getBoundingClientRect();
      const paperStyle=getComputedStyle(paper),scale=paperRect.width/paper.offsetWidth;
      return {left:rect.left,right:rect.right,headerLeft:headerRect.left,headerRight:headerRect.right,contentLeft:paperRect.left+parseFloat(paperStyle.paddingLeft)*scale,contentRight:paperRect.right-parseFloat(paperStyle.paddingRight)*scale,overflow:element.scrollWidth-element.clientWidth};
    });
    expect(metrics.left).toBeGreaterThanOrEqual(metrics.headerLeft-1);expect(metrics.right).toBeLessThanOrEqual(metrics.headerRight+1);
    expect(metrics.left).toBeGreaterThanOrEqual(metrics.contentLeft-1);expect(metrics.right).toBeLessThanOrEqual(metrics.contentRight+1);
    expect(metrics.overflow).toBeLessThanOrEqual(2);
    for(const fact of resume.experience[0].bullets)await expect(target.locator('[data-section="experience"]')).toContainText(fact);
  }
  for(const id of ['campus','classic','cards']){
    const template=RESUME_TEMPLATES.find(item=>item.id===id)!;
    await page.locator('.workspace-design').getByRole('button',{name:new RegExp(template.label)}).click();
    const column=id==='classic'?'main':'side';
    await expect(page.locator(`[data-column="${column}"] [data-section="experience"]`)).toHaveCount(1);
    await withinBounds(page);await exported.setContent(await downloadedHtml(page));await withinBounds(exported);
  }
  await exported.close();
});

test('all exported layouts are self-contained and match preview geometry and facts',async({page,context})=>{
  test.setTimeout(90000);
  const resume=structuredClone(initialResume);resume.customSections=[{id:'export-facts',title:'附加经历',items:['NEW_TEMPLATE_EXPORT_FACT']}];
  await createResume(page,resume);const exported=await context.newPage();let external=0;
  await exported.route('https://**',route=>{external++;return route.abort();});
  for(const {id,label} of RESUME_TEMPLATES){
    await page.locator('.workspace-design').getByRole('button',{name:new RegExp(label)}).click();const html=await downloadedHtml(page);expect(html).not.toContain('@import');expect(html).not.toContain('<button');expect(html).not.toContain('遗漏的志愿活动事实');
    await exported.setContent(html);await expect(exported.locator('.resume-paper')).toHaveAttribute('data-template',id);
    for(const fact of [resume.name,resume.education[0].school,resume.experience[0].company,resume.projects[0].title,resume.skills[0].label,'NEW_TEMPLATE_EXPORT_FACT'])await expect(exported.locator('.resume-paper')).toContainText(fact);
    const metric=await exported.locator('.resume-paper').evaluate(e=>({width:e.getBoundingClientRect().width,overflow:e.scrollWidth-e.clientWidth}));expect(metric.width).toBe(794);expect(metric.overflow).toBeLessThanOrEqual(2);
    if(id==='compact')expect(await exported.locator('[data-section="experience"]').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(2);
    if(id==='portfolio'){
      expect(await exported.locator('[data-section="projects"]').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(2);
      expect(await exported.locator('.resume-support-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(3);
    }
    if(id==='campus'){
      const columns=await exported.locator('.resume-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns);
      expect(columns.split(' ')[0]).toBe('210px');
      expect(columns).toBe(await page.locator('.resume-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns));
      expect(await exported.locator('.resume-side-column [data-section="education"]').count()).toBe(1);
      expect(await exported.locator('.resume-main-column [data-section="projects"]').count()).toBe(1);
      const side=await exported.locator('.resume-side-column').boundingBox(),main=await exported.locator('.resume-main-column').boundingBox();
      expect(side!.x+side!.width).toBeLessThanOrEqual(main!.x);
    }
    if(id==='classic'){
      expect(await exported.locator('.resume-grid').count()).toBe(0);
      expect(await exported.locator('[data-node-id="profile-contact"]').evaluate(e=>getComputedStyle(e).gridColumnStart)).toBe('2');
      const columns=await exported.locator('.resume-header-copy').evaluate(e=>getComputedStyle(e).gridTemplateColumns);
      expect(columns).toBe(await page.locator('.resume-header-copy').evaluate(e=>getComputedStyle(e).gridTemplateColumns));
      expect(await exported.locator('.section-heading').first().evaluate(e=>getComputedStyle(e,'::before').display)).not.toBe('none');
      expect(await exported.locator('.section-heading').first().evaluate(e=>getComputedStyle(e,'::after').display)).not.toBe('none');
    }
    if(id==='cards'){
      const columns=await exported.locator('.resume-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns);
      expect(columns.split(' ').length).toBe(2);
      expect(columns).toBe(await page.locator('.resume-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns));
      expect(await exported.locator('.resume-grid [data-section="projects"]').count()).toBe(1);
      expect(await exported.locator('.resume-grid [data-section="skills"]').count()).toBe(1);
      const side=await exported.locator('.resume-side-column').boundingBox(),main=await exported.locator('.resume-main-column').boundingBox();
      expect(main!.x+main!.width).toBeLessThanOrEqual(side!.x);
    }
    await exported.locator('.resume-paper').screenshot({path:`.tmp/templates/${id}.png`});
    const screenPadding=await exported.locator('.resume-paper').evaluate(e=>{const style=getComputedStyle(e);return {top:style.paddingTop,right:style.paddingRight,left:style.paddingLeft};});await exported.emulateMedia({media:'print'});const printPadding=await exported.locator('.resume-paper').evaluate(e=>{const style=getComputedStyle(e);return {top:style.paddingTop,right:style.paddingRight,left:style.paddingLeft,bottom:style.paddingBottom};});expect(printPadding).toEqual({...screenPadding,bottom:'0px'});
    if(['minimal','editorial','academic'].includes(id))expect(await exported.locator('.section-heading').first().evaluate(e=>getComputedStyle(e,'::after').display)).not.toBe('none');
    await exported.emulateMedia({media:'screen'});
  }
  expect(external).toBe(0);await exported.close();
});

test('explicit new home template is submitted and wins over a conflicting model suggestion',async({page})=>{
  let selected='';await page.route('**/api/ai/generate',route=>{selected=route.request().postDataJSON().templateId;return route.fulfill({json:{resume:initialResume,jobTitle:'工程师',report:{summary:'',requirements:[]},warnings:[]}});});
  await page.goto('/');await page.locator('.intake-design').getByRole('button',{name:/作品展示/}).click();await page.locator('.intake-card textarea').first().fill('个人经历测试');await page.locator('.intake-card textarea').nth(1).fill('岗位要求测试');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();await expect(page.locator('.resume-paper')).toHaveAttribute('data-template','portfolio');expect(selected).toBe('portfolio');
});

test('homepage can explicitly submit one of the new templates',async({page})=>{
  let selected='';await page.route('**/api/ai/generate',route=>{selected=route.request().postDataJSON().templateId;return route.fulfill({json:{resume:initialResume,jobTitle:'工程师',report:{summary:'',requirements:[]},warnings:[]}});});
  await page.goto('/');await expect(page.locator('.intake-design .template-option:not(.template-auto)')).toHaveCount(12);await page.locator('.intake-design').getByRole('button',{name:/校园新锐/}).click();await page.locator('.intake-card textarea').first().fill('个人经历测试');await page.locator('.intake-card textarea').nth(1).fill('岗位要求测试');await page.locator('.consent-line input').check();await page.getByRole('button',{name:'生成我的岗位简历'}).click();await expect(page.locator('.resume-paper')).toHaveAttribute('data-template','campus');expect(selected).toBe('campus');
});

test('PDF print retains long entries and final custom facts across pages',async({page,context})=>{
  test.setTimeout(60000);
  const resume=structuredClone(initialResume);resume.projects=Array.from({length:2},(_,index)=>({id:`long-${index}`,title:`PDF_PROJECT_${index}`,meta:'2024 — 2026',stack:[],description:Array.from({length:index===0?12:4},(_,line)=>`FACT_${index}_${line}: Mixed English and 中文真实项目内容，保留学校课程与完整事实。${'Long content wraps without clipping. '.repeat(3)}`)}));resume.customSections=[{id:'final-section',title:'自定义栏目',items:['PDF_FINAL_FACT_987654321']}];
  await createResume(page,resume);const printed=await context.newPage();
  await page.locator('.workspace-design').getByRole('button',{name:/极简商务/}).click();await printed.setContent(await downloadedHtml(page));
  const pdf=await printed.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
  const facts=await extractPdfPages(pdf);
  expect(facts.length).toBeGreaterThan(1);expect(facts.length).toBeLessThan(15);expect(facts.every(text=>text.trim().length>0)).toBe(true);
  const text=facts.join(' ');expect(text).toContain('PDF_FINAL_FACT_987654321');for(const item of resume.projects)for(const line of item.description)expect(text).toContain(line.split(':')[0]);
  await printed.close();
});
