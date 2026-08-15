# DeepSeek Harness 插件开发指南

> 一本面向工程师的实战手册：从 Cordis 插件框架到 Profile、Bundle、工具、Skill、命令、系统提示词、Agent Preset 与客户端插件的完整开发路径，全部案例均来自 `@deepseek-ai/dsh` 真实代码库（版本 `0.1.0-rc.6`，核心框架 `@deepseek-ai/cordis@4.0.1`）。

---

## 这本书讲什么

DeepSeek Harness（简称 **DSH**）是一个基于 **Cordis** 插件框架构建的 AI Agent 运行时。它的每一块能力——模型路由、文件系统、沙箱、工具、Skill、命令、会话持久化、Web 界面——**都是一个可独立加载、可组合、可配置、可热更新的插件**。

这意味着：**学会写一个 DSH 插件，就等于学会了扩展整个 Agent 运行时的方法。** 你可以给它加一个新工具（tool）、加一组可复用的技能（skill）、加一个斜杠命令（command）、注入一段系统提示词、组合一套专属的 Agent 预设（preset），甚至给浏览器界面加一个新的设置面板。

这本书把这一整套机制拆开讲透，并且**每一个案例都对应真实代码库里的实现**，而不是凭空捏造的伪代码。

---

## 读者与前置条件

- **读者**：想要扩展 DeepSeek Harness、或者想要理解它内部架构的 TypeScript/JavaScript 工程师。
- **前置条件**：熟悉 ES Module、TypeScript 类型、`async`/`await`、npm/pnpm 基础。了解依赖注入（DI）会让第 2、4 章读起来更快。
- **环境**：Node.js ≥ 22，pnpm。Cordis 是 ESM-first；脚手架要求 Node 22+。

---

## 目录

| 章节 | 主题 | 核心产出 |
|---|---|---|
| [第 1 章 体系总览](01-体系总览.md) | Harness 分层架构、插件种类、数据流 | 一张完整的架构心智地图 |
| [第 2 章 Cordis 框架核心](02-Cordis框架核心.md) | Context / Service / plugin / inject / effect / 生命周期 | 第一个可运行的最小插件 |
| [第 3 章 Profile、Bundle 与 patch 层](03-Profile与Bundle.md) | profile 目录、`dsh.profile`、`cordis.patch.yml`、`dsh plugin` | 创建并挂载自己的 bundle |
| [第 4 章 服务与依赖注入](04-服务与依赖注入.md) | `ctx.provide` / `inject` / `Service` / `isolate` | 一个计数器服务 + 消费者 |
| [第 5 章 工具开发](05-工具开发.md) | `defineTool` / ToolRuntime / 输出契约 / 执行流水线 | 多个可上线的工具 |
| [第 6 章 Skill 开发](06-Skill开发.md) | SKILL.md 格式、frontmatter、provider 注册 | 一组可被模型调用的技能 |
| [第 7 章 命令开发](07-命令开发.md) | `ctx.commands.register`、作用域遮蔽 | `/goal` 复刻 + 自定义命令 |
| [第 8 章 系统提示词](08-系统提示词.md) | `systemPrompt.section/context/variable` | 注入部署级 persona 与动态上下文 |
| [第 9 章 Agent Preset](09-AgentPreset.md) | `preset.yml`、`agent.cordis.yml`、`cordis:group`、isolate realm | 定制专属 Agent 预设 |
| [第 10 章 客户端插件](10-客户端插件.md) | `dsh.client` manifest、浏览器侧加载 | 给 Web 界面加插件 |
| [第 11 章 安全、沙箱与审批](11-安全与沙箱.md) | sandbox / approval / credentials / fs 服务 | 安全地接入副作用 |
| [第 12 章 调试、热更新与发布](12-调试与发布.md) | HMR、`--dump-config`、日志、发布 | 把插件发布为 npm 包 |
| [附录 A Cordis API 速查](附录A-Cordis速查.md) | Context / Fiber / 事件 / 生命周期速查表 | 随手查阅 |
| [附录 B DSH 服务目录](附录B-服务目录.md) | `ctx.*` 关键服务清单 | 查你需要的服务名 |

---

## 阅读路径

1. **只想快速上手写一个工具**：读第 2 章（Cordis 核心）→ 第 3 章（bundle/patch）→ 第 5 章（工具开发）。这三章连起来就是一条最短可交付路径。
2. **想全面掌握扩展机制**：按顺序读完全书。
3. **正在调试某个插件**：直接查附录 A、附录 B，再回到对应章节看案例。

---

## 关于「真实案例」

书中所有代码都严格遵循 `@deepseek-ai/dsh` 的真实约定，来源包括但不限于：

- `@deepseek-ai/cordis` 的 README 与核心源码（`Context`/`Service`/`Fiber`/事件/生命周期）
- `@deepseek-ai/dsh-tool-todo`（工具插件的完整范例：`name`/`inject`/`Config`/`apply`/`defineTool`）
- `@deepseek-ai/dsh-command-goal`（命令插件的完整范例）
- `@deepseek-ai/dsh-skill-filesystem`（Skill 提供方范例）
- `@deepseek-ai/dsh-base` 的 `cordis.patch.yml`（bundle patch 层范例）
- `config/agent-presets/standard` 的 `preset.yml` 与 `agent.cordis.yml`（Agent Preset 范例）
- `@deepseek-ai/dsh-system-prompt`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-client-modules` 等核心服务

凡是直接从真实代码精简而来的例子，我都会标注「**源自：**」并指出原始包名，方便你回源码对照。为可读性，代码做了适度缩略与注释改写，但**结构与 API 签名保持原样**。

---

*本书由 DeepSeek Harness 代码库逆向梳理而成，面向教学；API 以你安装的实际版本为准（`dsh --version`）。*
