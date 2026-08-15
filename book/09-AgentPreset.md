# 第 9 章 Agent Preset 与作用域组合

Agent Preset（预设）是 DSH 最精巧的机制之一：它把一组插件**按「每会话」的作用域**组合成一种可选的 Agent 形态（如「标准模式」「PTC 模式」），且多个会话共享同一个「常驻组合」而不互相污染状态。这一章讲 `preset.yml`、`agent.cordis.yml`、`cordis:group` 与 `isolate` realm。

---

## 9.1 两个平面：host-plane 与 agent-plane

理解 Preset 前，先分清两个平面：

| 平面 | 作用域 | 内容 | 谁拥有 |
|---|---|---|---|
| **host-plane**（宿主） | 进程级 | 注册表本身、沙箱/审批栈、持久化、模型路由 | bundle（`dsh-base`、`dsh-web-app`） |
| **agent-plane**（Agent） | 每会话 | 工具、提示词段、每会话状态 | `agent.cordis.yml`（preset） |

真实代码 `config/agent-presets/standard/agent.cordis.yml` 的头部注释说得非常清楚：

> 宿主组合（`base.cordis.yml` + `web.cordis.yml`）保留一切 preset 不该拥有的东西：注册表本身、沙箱与审批栈、持久化、模型路由。

**判断某行属于哪个平面的一条准则**（真实注释反复强调）：**「宿主行会 `inject` 一个服务」就是宿主平面的判据**——注入在会话存在之前解析，没有 agent 可键控；而 agent-plane 行只「注册进」宿主注册表、不提供需要宿主注入的服务。

---

## 9.2 目录结构与两份文件

一个 preset 是一个目录：

```
config/agent-presets/<id>/
├── preset.yml          # 显示名、描述、排序
└── agent.cordis.yml    # agent-plane 插件组合（真正的"配置树"）
```

真实 `preset.yml`（`standard`）：

```yaml
name: 标准模式
description: 功能完整的编码 Agent，支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。
order: 1
```

`order` 决定选择器里的排序。`@deepseek-ai/dsh-agent-presets` 通过配置的 `roots`（信任级别 `system`）发现这些目录；启动器把随附的 `config/agent-presets/` 注入为 system root。

---

## 9.3 `agent.cordis.yml` 的写法

`agent.cordis.yml` 与 `cordis.patch.yml` 结构相同（`- insert:` 列表 + `- id:` 覆盖），但**语义不同**：它是 agent-plane 组合，由 roster **每个进程挂载一次**在一个「常驻作用域」下，每个命名该 preset 的会话**按 scope 父子关系 join 进来**。

### 9.3.1 普通行（无需 realm）

大多数工具行只是「注册进宿主注册表」，不需要 realm。真实 `standard/agent.cordis.yml` 里：

```yaml
- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'

- id: tool-fs-search
  name: '@deepseek-ai/dsh-tool-fs-search'
  config:
    sampleOverCapGlobResults: false

- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'

- id: tool-skill
  name: '@deepseek-ai/dsh-tool-skill'

- id: tool-todo
  name: '@deepseek-ai/dsh-tool-todo'
  config:
    allowParallelInProgress: true
```

这些行**只注册进宿主 `tools` 注册表、不 provide 任何东西**，所以不需要 realm（它们按 session 键控状态，宿主单实例服务所有会话）。

### 9.3.2 需要 realm 的行：`cordis:group` + `isolate`

当一个服务**不能跨会话共享**（比如 plan-mode 状态是每 agent 的），就必须放进一个带 `isolate` realm 的 group。真实 `standard/agent.cordis.yml` 的 plan-mode 段：

```yaml
- id: planning
  name: cordis:group          # 分组插件
  group: true
  isolate:
    planMode: true            # 为 planMode 服务开辟 entry-local realm
  config:
    - id: plan-mode
      name: '@deepseek-ai/dsh-plan-mode'
      config:
        section: |
              You are in plan mode. Stay in plan mode until exit_plan_mode succeeds...
```

`cordis:group` 是 `@deepseek-ai/cordis-plugin-group` 提供的**嵌套插件组**：`group: true` 表示这一行本身是分组，`config` 里是子行列表；`isolate:` 映射「服务名 → realm 标签」。

真实注释对 `isolate` 的语义说得极准：

> 一个服务行**必须**坐在带 `isolate` realm 的 group 里。没有它，服务发布进 root realm，就是进程级——另一个 preset 发布同名会冲突，宿主读者会为每个会话解析到同一个 preset 实例；`dsh-agent-presets` 在挂载时拒绝这一点。`true` 表示 **entry-local realm**：这个常驻挂载自己的私有实例，与其他 preset 隔开。（共享标签不会池化实例——`provide()` 在第二个 realm 符号下注册会抛错；标签 join 的是 REALM，不是这个文件需要的。）

所以 `isolate: { planMode: true }` 里的 `true` 是「每个预设一份独立实例」的开关。

### 9.3.3 更多 realm 例子

真实 `standard` 里 compaction 与 delegation 也各自开了 realm：

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
      config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 }
```

注释解释为什么 compaction 需要 realm、而 token-meter 不需要：

> `compaction-basic` 用 `ctx.get` 读 `toolResultPrune`，所以 pruner 必须共享这个 realm。…… `tokenMeter` 刻意**不**在这个 realm：meter 留在宿主平面，这里的行解析宿主那一份实例。它每 session 键控折叠、拥有浏览器读取的投影单元——放进 realm 会让这些单元随 preset 挂载与否而来去。

---

## 9.4 实战：复制 standard 做定制 preset

目标是做一个「极简 preset」，只给 Agent 文件工具 + skill，去掉 shell。

### 第 1 步：复制目录

```sh
cp -r config/agent-presets/standard config/agent-presets/minimal-custom
```

### 第 2 步：改 `preset.yml`

```yaml
name: 极简模式
description: 只有文件读写与 Skill，无 Shell 与网络。
order: 3
```

### 第 3 步：裁剪 `agent.cordis.yml`

删掉 `tool-bash`、`tool-pwsh`、`tool-web` 等行（或对相应行写 `disabled: true`）。保留文件工具与 skill。

### 第 4 步：让 roster 能发现它

随附 preset 根是 system root；自定义 preset 通常放在用户可写的 root。启动器把 `config/agent-presets/` 作为 system root 注入（见 `profile-boot` 里对 `agent-presets` 行的处理）。你的部署如果配置了可写 root（`dsh-agent-presets` 的 `copy`/`remove` 能力），就能在 UI 里复制/删除 preset。

> 真实能力：`ctx.agentPresets` 提供 `list/resolve/mount/composeFrom/recompose/read/copy/remove` 等（见 `dsh-tool-cordis` 的 API 目录）。「复制」是**唯一**的作者化写入：按 id 复制整个目录，不验证挂载（源今天能挂载，副本今天就能挂载）。

---

## 9.5 挂载与 join：会话如何「使用」一个 preset

- **mount**：agent 工厂的 `setup(agentCtx)` 调用 `ctx.agentPresets.mount(agentCtx, id)`，确保 preset 的「常驻组合」存在，再把 agent 的 scope 键 parent 到它，让挂载的注册/监听覆盖这个 agent。
- **composeFrom（join）**：子 agent 通过 `composeFrom(agentCtx, parentCtx)` **绑定**到父 agent 已有的同一份常驻组合——**是绑定而非重新挂载**，所以子 agent 拿到的是父 agent 的**同一实例**（同一插件对象、同一工具注册、同一提示词段）。这保证「父子能力继承」不因 preset 文件被编辑而产生代际差异。

真实代码里，两个 in-process subagent 驱动在**同步的 `setup`** 里用 `composeFrom` 组合子 agent，因为它是同步、无组合失败模式的。

---

## 9.6 常见陷阱

1. **把需要 realm 的服务行放 group 外**：`dsh-agent-presets` 挂载时**拒绝**（会发布进 root realm，进程级污染）。
2. **误以为共享 label 能池化实例**：`isolate` 的 label join 的是 **realm**，不是实例池；同一 realm 下二次 `provide` 抛错。
3. **宿主平面行放进了 preset**：宿主注册表（jobs、subagents、token-meter 等）必须在宿主平面，preset 只该贡献「工具/提示词段」。判断准则：宿主行会 `inject` 服务。
4. **改了 preset 文件后子 agent 拿到不同代际**：join 用 `composeFrom` 绑定父实例，不重读 roster；只有新 mount 才重读。

---

## 9.7 本章小结

- 两个平面：host-plane（进程级，bundle 拥有）vs agent-plane（每会话，preset 拥有）。
- preset = `preset.yml`（元数据）+ `agent.cordis.yml`（agent-plane 组合）。
- 需要跨会话隔离的服务用 `cordis:group` + `isolate: { svc: true }` 开 entry-local realm。
- 宿主注册表单例服务所有会话；preset 只贡献工具/提示词段。
- 子 agent 通过 `composeFrom` join 父实例，保证能力继承的代际一致。

下一章讲 **客户端插件**——把扩展能力带到浏览器界面。
