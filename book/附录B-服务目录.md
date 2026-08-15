# 附录 B　DSH 服务目录（`ctx.*`）

> 这一节列出插件开发最常打交道的 `ctx.*` 服务。它们由 `dsh-base` / `dsh-web-app` 等 bundle 提供，宿主平面（进程级）。完整清单见 `dsh-tool-cordis` 的 API 目录（`cordis_inspect` 工具）。

---

## B.1 注册表与执行

| 服务 | 键 | 提供方 | 插件作者用途 |
|---|---|---|---|
| 工具注册表 | `ctx.tools` | `dsh-tools` | `register(defineTool(...))`、`guard`、`schemas` |
| 命令注册表 | `ctx.commands` | `dsh-commands` | `register({name,description,handler,...})` |
| Skill 注册表 | `ctx.skills` | `dsh-skill` | `registerProvider(...)` |
| 系统提示词 | `ctx.systemPrompt` | `dsh-system-prompt` | `section`/`context`/`variable`/`tools` |
| Agent Preset | `ctx.agentPresets` | `dsh-agent-presets` | `mount`/`composeFrom`/`list`/`copy` |

## B.2 Agent 与会话

| 服务 | 键 | 用途 |
|---|---|---|
| Agent 工厂 | `ctx.agentLoop` / `ctx.agents` | 创建/恢复 agent；`setFactory` 注册工厂 |
| 会话 | `ctx.session` | 持久化日志（`append(type, data)`） |
| 会话投影 | `ctx.sessionProjections` | 从事件推导 UI 状态（todo 列表等） |
| 目标 | `ctx.goals` | `get/create/edit/pause/resume/clear` |
| 子代理 | `ctx.subagents` | 子代理注册表 |

## B.3 安全与副作用

| 服务 | 键 | 用途 |
|---|---|---|
| 文件系统 | `ctx.fs` | `resolve`/`readText`/`writeText`/`editText`/`listDir`（走沙箱） |
| 审批 | `ctx.approval` | `request()`（ask/never/allowed-once） |
| 凭据 | `ctx.credentials` | `resolve`/`set`/`unset`/`describe` |
| 沙箱 | `ctx.sandbox` | 沙箱策略/执行环境 |

## B.4 模型与网络

| 服务 | 键 | 用途 |
|---|---|---|
| 模型路由 | `ctx.llm` | 发起模型请求；`createUserMessage` 等 |
| 默认模型 | `ctx.agentDefaultModel` | `currentSelection()`/`saveSelection()` |
| 网页检索 | `ctx.web` | 搜索/抓取 |

## B.5 横切与基础设施

| 服务 | 键 | 用途 |
|---|---|---|
| 压缩 | `ctx.compaction` | `compactIfNeeded`/`compactNow` |
| Token 计量 | `ctx.tokenMeter` | 上下文 token 统计 |
| 后台任务 | `ctx.jobs` | 后台任务注册表 |
| 定时器 | `ctx.timer` | disposal-aware 定时器（`cordis-plugin-timer`） |
| 客户端模块 | `ctx.clientModules` | Web 插件表（`graph()`/`onRebuilt`） |
| 代码运行时 | `ctx.codeRuntime` | `run(request)`（Code Mode 执行后端） |

## B.6 消费方式对照

| 场景 | 用法 |
|---|---|
| 必须有才能工作 | `export const inject = ['tools']` |
| 可选、缺失时降级 | `const approval = ctx.get('approval')` |
| 按 agent 键控读状态 | 通过 `exec.agent` / `invocation.agent` 拿到 agent，再访问其 session |
| 惰性读服务实例 | `ctx.get('fs')` 返回 `undefined` 若未提供 |

---

*本书到此结束。祝你在 DeepSeek Harness 上构建出好用的插件。*
