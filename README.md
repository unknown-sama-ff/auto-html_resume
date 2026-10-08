# folio atelier

面向个人求职者的AI岗位简历工具，React + TypeScript + Vite前端与Express后端合并部署于Railway。

## 使用流程

1. 首次打开显示工具介绍，不自动创建示例版本。
2. 粘贴个人经历和岗位要求，或上传材料。点击“AI模型”选择后端预设或自定义通道。
3. 确认AI处理授权，点击生成。后端实际调用模型；失败保留输入，不用示例冒充生成结果。
4. 生成成功进入工作台，点击区块修改内容或把样式片段发给AI。建议可预览、应用、撤销。
5. 每个岗位版本独立保存内容、对话、岗位分析和修改历史。可以复制、切换、改名、恢复历史。
6. 侧栏可收起；预览支持30%–150%缩放及放大视图，Esc退出。HTML/PDF导出位于顶部同一组。

**示例仅在主动点击“体验示例”时创建，始终标注为示例。** 不要拿示例经历当作自己的真实简历投递。

## 上传与导出边界

- TXT：≤200KB且≤45,000字。
- PDF：≤10MB、最多15页、最多45,000字。浏览器提取文字后提交；扫描件请上传截图或粘贴文字。
- 图片：PNG/JPEG/WebP，单张≤2MB。个人资料和岗位要求各支持一个文件，可配合补充文字。图片识别要求所选模型支持视觉输入。
- 暂不解析Word/Excel，请先转成文字PDF或TXT。
- 头像只加入本地简历，不作为AI的经历材料，不上传身份证/护照。
- HTML自包含，使用和预览相同的渲染器，去除选择标记和远程字体依赖。
- PDF按钮打开浏览器打印窗口，选择“另存为PDF”。缩放不会影响导出尺寸。当前不是服务器直接生成PDF文件。
- 简历长内容支持自然打印分页，但不同浏览器的分页细节可能不同；导出前请检查打印预览。
- 岗位匹配页显示模型在生成时给出的要求、材料依据和补充建议，不伪造匹配百分比，也不是录用预测。后续改写不会自动重做岗位分析。

## 本地运行

需要 **Node.js 22.18或更新版本，推荐Node.js 24**。

```bash
npm ci
npm run dev
```

在另一个终端启动后端：

```bash
cp .env.example .env
# Windows PowerShell用 Copy-Item .env.example .env
# 在.env中配置实际模型Key
npm run dev:api
```

前端 `/api` 代理到后端8787端口。不要把真实Key提交到GitHub。

## Railway环境变量

内置默认预设为 `cf.api.fan / gpt-6.1-sol`。后端和前端共用一个服务。

```env
CF_API_BASE_URL=https://cf.api.fan/v1
CF_API_MODEL=gpt-6.1-sol
CF_API_KEY=在Railway填写真实Key
ALLOWED_AI_HOSTS=cf.api.fan
ALLOW_PRIVATE_AI_URLS=false
AI_RATE_LIMIT=12
CORS_ORIGIN=https://你的Railway公开域名
```

无需手动设PORT，Railway会注入。若已有Node版本覆盖变量，必须设为22.18或更新版本（推荐24）。现有CF_API_*配置可继续使用。

构建：`npm run build`；启动：`npm run start`；健康检查：`/api/health`。`railway.json`已配置。

可以使用`OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL`或`DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL`配置其他内置通道。`AI_PRESETS_JSON`会替换内置预设列表，例如：

```env
AI_PRESETS_JSON=[{"id":"cf-api-fan","label":"第三方通道","provider":"OpenAI-compatible","baseUrl":"https://cf.api.fan/v1","model":"gpt-6.1-sol","keyEnv":"CF_API_KEY","description":"后端预设"}]
```

`keyEnv`引用后端环境变量，不放真实Key。预设名称、模型、URL通过`/api/ai/presets`返回，不返回Key。

自定义模型设置支持URL、Key、模型名。Key只存在当前前端会话，随当前请求临时发给后端，不进入IndexedDB、备份或HTML。自定义URL必须命中后端`ALLOWED_AI_HOSTS`；兼容OpenAI Chat Completions的请求/返回格式，基础URL会补齐`/chat/completions`。

## 安全与隐私

- 拒绝未允许域名、私网解析和重定向；请求体上限8MB；模型请求超时90秒；按IP限流。
- 模型材料按数据而非指令处理；返回简历结构校验；局部修改仅允许受控属性和当前节点，不执行HTML/JS。
- 原始文件在浏览器读取；图片按授权进入模型请求；后端不长期保存求职文件，不记录正文或Key。
- 此工具没有登录或跨设备同步。本地资料不会因上传GitHub而备份；建议下载版本备份。
- `ALLOW_PRIVATE_AI_URLS=true`仅用于管理员明确允许的本地模型开发，生产不建议开启。
- 公开部署仍需按自己的成本/隐私需求设置访问控制、额度和部署策略，IP限流不能替代账号权限。

## 测试

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

Windows浏览器测试使用已安装的Edge；其他平台先运行`npx playwright install chromium`。测试包括资料提交/失败、TXT/PDF/图片读取、版本隔离、撤销、恢复、刷新、导航、手机布局、缩放、放大与导出一致性。

端到端测试使用模拟模型响应验证接口集成，不代表实际第三方通道可用；上线时仍需配置有效Key并验证模型/视觉能力。

MIT License。不要提交真实API Key、`.env`、用户简历、头像或日志。
