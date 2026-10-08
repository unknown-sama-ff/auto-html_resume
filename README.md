# folio atelier

面向个人求职者的AI岗位简历工具，React + TypeScript + Vite前端与Express后端合并部署于Railway。

## 使用流程

1. 首次打开显示工具介绍，不自动创建示例版本。首页和工作台共用同一侧边栏；点首页“我的简历”可直接展开保存的版本并选择继续编辑。
2. 粘贴个人经历和岗位要求，或上传材料。点击“AI模型”，只有“作者预设6.1-sol”和“自定义URL”两个入口。
3. 确认AI处理授权，点击生成。后端实际调用模型；失败保留输入，不用示例冒充生成结果。
4. 生成成功进入工作台，点击区块修改内容或把样式片段发给AI。建议可预览、应用、撤销。
5. 每个岗位版本独立保存内容、对话、岗位分析和修改历史。可以复制、切换、改名、恢复历史；版本旁的删除按钮会先显示确认框。删除当前版本后切换到剩余版本，删除最后一份后回到主页。
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

AI接入只提供 **“作者预设6.1-sol”** 和 **“自定义URL”** 两种方式。默认使用作者预设，由后端的CF_API_*变量配置`cf.api.fan / gpt-6.1-sol`；前后端共用一个服务。

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

### 两种AI接入方式

- **作者预设6.1-sol**：无需用户填写URL或Key，后端使用上面的CF_API_*变量。预设Key从不发送到前端，页面不显示其他供应商选项。
- **自定义URL**：用户在网页填写完整URL、模型名称和自己的API Key。浏览器将资料和Key直接发送给用户指定的模型服务，不经过我们的后端。Key只存在当前前端会话，不进入IndexedDB、备份或HTML。切换模式保留自定义输入；取消设置不会改变已保存选择。

自定义URL由浏览器直接调用，不经过Railway后端、不使用后端域名白名单。接口需要兼容OpenAI Chat Completions，基础URL会补齐`/chat/completions`。在HTTPS网页上只能使用HTTPS接口。

旧的`OPENAI_*`、`DEEPSEEK_*`和`AI_PRESETS_JSON`不再生效，可从Railway删除；现有`CF_API_*`变量保持兼容。`/api/ai/presets`只返回一个作者预设（id保持为`cf-api-fan`）。

## 是否需要分开部署？

不需要。一个Railway服务仍然同时提供静态网页和作者预设接口：

- 作者预设：浏览器 → Railway后端（作者Key）→ 作者模型服务。
- 自定义URL：浏览器（用户URL/Key/模型名）→ 用户自己的模型服务，资料不进入Railway后端。
- 简历、版本、修改历史保存在用户浏览器中，不配置用户数据库或文件存储。

### 自定义API必须允许浏览器跨域（CORS）

模型接口所在服务器需要允许工具网站的Origin，并正确响应OPTIONS预检，例如以下响应头（将域名换成工具网站实际地址）：

```http
Access-Control-Allow-Origin: https://your-tool.up.railway.app
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
```

这是配置在**用户的模型接口服务器**上的，不是工具的Railway `CORS_ORIGIN`变量。更改我们网站的CORS设置不能替第三方接口开启跨域。若无法控制该接口且服务商不支持CORS，则该通道不能从浏览器直连；页面会明确提示，不会发送资料到我们的后端兜底。参考MDN CORS文档：`https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS`。

`ALLOWED_AI_HOSTS`只用于作者后端出站检查，自定义URL不需要部署者逐个加白名单。现有CF_API_*和Railway构建/启动设置不变。

## 安全与隐私

- 作者预设：后端出站仍验证目标域名和私网解析，拒绝重定向；请求体上限8MB；请求超时90秒；按IP限流。
- 自定义URL：浏览器直连，使用自己的Key、URL、模型名称；不携带Cookie、不发送Referrer、不跟随重定向，连接失败不自动回退到后端代理。
- 模型材料按数据而非指令处理；返回简历结构校验；局部修改仅允许受控属性和当前节点，不执行HTML/JS。
- 原始文件在浏览器读取；简历版本、历史和备份位于本地浏览器。作者预设请求在后端内存中临时处理，不落库、不写求职文件、不记录正文或用户Key。后端仅保留作者环境变量及临时IP限流记录。
- 自定义模式的资料和用户Key不经过我们的后端，但所选第三方模型服务的保存策略由该服务决定，工具不能保证第三方不保留请求。
- 此工具没有登录或跨设备同步。本地资料不会因上传GitHub而备份；建议下载版本备份。删除版本会同时移除它的简历、对话、岗位分析和历史，不能通过编辑器撤销恢复，其他版本与已下载文件不受影响。
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
