# folio atelier

一个可开源部署的 AI 岗位定制简历工作台：用户输入经历和岗位要求，生成岗位版本，然后在 A4 预览中点击元素，用自然语言、可视化属性或受控代码上下文继续修改。

## 已实现

- React + TypeScript + Vite 前端工作台
- 可点击的 A4 简历预览和稳定节点 ID
- 结构化内容编辑、颜色、字号、间距和强调线调整
- AI 修改预览：`selection -> prompt -> structured EditPatch -> confirm -> history`
- 撤销、重做、本地 IndexedDB 保存多个版本
- 受控代码片段查看和同步到聊天框
- HTML 下载和浏览器打印/PDF 导出
- 浏览器内上传头像（默认只保存在本地）
- 后端模型预设与自定义 OpenAI-compatible URL / Key / Model 设置
- Railway-ready Express 服务，同时托管 `dist` 和 AI 代理接口

## 安全设计

- 预设模型的真实 API Key 只放在后端环境变量中，前端只能看到名称、模型和 URL。
- 自定义模型的 Key 仅随当前请求发送，不写入 IndexedDB、Cookie、导出 HTML 或日志。
- 自定义 URL 默认必须命中 `ALLOWED_AI_HOSTS`，并拒绝 localhost、私网 IP、DNS 解析到私网的域名和重定向。
- AI 只接收当前选中组件的最小上下文，不直接接收整个浏览器数据库。
- 后端限制 JSON 请求体大小、模型调用超时和单 IP 请求频率。
- AI 返回后端只接受白名单操作和属性，前端不会执行模型返回的 HTML、JavaScript 或任意 CSS。

> 如果确实需要在本地接入 Ollama 等私网模型，请在本地开发环境显式设置 `ALLOW_PRIVATE_AI_URLS=true`；生产 Railway 不建议开启。

## 本地开发

```bash
npm install
npm run dev
```

前端会在 `http://localhost:5173` 启动。没有后端时，聊天修改会自动使用本地演示补丁，不会上传简历。

如需运行真实模型代理，在另一个终端启动：

```bash
copy .env.example .env
# 编辑 .env，填入后端预设 Key
npm run dev:api
```

Vite 会把 `/api` 请求代理到 `http://localhost:8787`。

## AI 模型设置

### 后端预设

在 `.env` 或 Railway Variables 中配置：

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
```

前端的“AI 模型”按钮会读取 `/api/ai/presets`，但不会拿到 Key。

### 自定义模型

用户可以在网页中输入：

- 完整 URL：例如 `https://api.openai.com/v1/chat/completions`，输入基础 `/v1` 也会自动补齐。
- 模型名称：例如 `gpt-4o-mini`、`deepseek-chat` 或其他兼容模型。
- API Key：仅存于当前浏览器会话，不会保存到本地工作区。

为了降低 SSRF 和密钥滥用风险，自定义 URL 的域名必须先加入后端：

```bash
ALLOWED_AI_HOSTS=api.openai.com,api.deepseek.com,api.example.com
```

`AI_PRESETS_JSON` 可以把预设元数据改为你自己的模型列表。每个预设使用 `keyEnv` 引用 Railway 中的环境变量，不要在 JSON 中写入真实 Key：

```bash
AI_PRESETS_JSON=[{"id":"qwen","label":"Qwen","provider":"OpenAI-compatible","baseUrl":"https://dashscope.aliyuncs.com/compatible-mode/v1","model":"qwen-plus","keyEnv":"QWEN_API_KEY"}]
QWEN_API_KEY=...
```

## Railway 部署

1. 将项目推送到 GitHub。
2. 在 Railway 从 GitHub 创建服务。
3. 构建命令使用 `npm run build`，启动命令使用 `npm run start`。
4. 配置 `OPENAI_API_KEY` 或自定义预设所需的环境变量。
5. 将 Railway 域名加入 `CORS_ORIGIN`；生产同源部署时也可只保留前端域名。
6. 若开放自定义模型服务，把对应的精确 hostname 加入 `ALLOWED_AI_HOSTS`。

`railway.json` 已包含构建、启动和 `/api/health` 健康检查配置。

## 开源说明

仓库不应提交 `.env`、API Key、个人简历、头像或真实岗位文件。建议先检查：

```bash
git status
```

再提交代码。MIT License 见 `LICENSE`。

## cf.api.fan / gpt-6.1-sol 预设

项目内置了 `cf.api.fan · gpt-6.1-sol` 预设。Railway 只需要配置：

```bash
CF_API_KEY=你的第三方Key
CF_API_BASE_URL=https://cf.api.fan/v1
CF_API_MODEL=gpt-6.1-sol
ALLOWED_AI_HOSTS=cf.api.fan
```

真实 Key 只放在 Railway Variables，不要写入 `AI_PRESETS_JSON`、前端代码、`.env.example` 或 Git 提交。前端会通过 `/api/ai/presets` 读取预设名称和模型信息，但不会收到 Key。
