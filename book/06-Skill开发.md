# 第 6 章 Skill 开发

Skill（技能）是「按需加载的指令/知识」。它和工具互补：**工具给模型「能做什么」，Skill 给模型「怎么做、何时做」**。这一章讲 SKILL.md 的格式、frontmatter、发现根目录、provider 注册，以及如何写一个自定义 skill 提供方。

---

## 6.1 Skill 是什么，如何进入模型

DSH 的 Skill 体系分三块：

| 包 | 角色 |
|---|---|
| `@deepseek-ai/dsh-skill` | `ctx.skills` **注册表** |
| `@deepseek-ai/dsh-skill-filesystem` | 本地文件系统**提供方**（扫描项目/用户目录） |
| `@deepseek-ai/dsh-tool-skill` | 面向模型的**目录与加载器工具**（`skill` 工具） |

模型体验（真实契约）：`dsh-tool-skill` 把可调用的 skill 名称 + 有长度上限的描述渲染到初始/替换目录中，把选中的当前指令正文渲染到保留的工具历史里。**路径、provider rank、被禁用的 skill 对模型隐藏。**

关键点：skill 的 `name`/`description`（目录概览）与正文（加载后）是**独立的生命周期**——发现阶段解析 frontmatter 生成概览，每次 `skill(name)` 加载时**重新读取文件**，所以正文编辑无需 hash/修订/缓存失效。

---

## 6.2 SKILL.md 格式

skill 可以是**单层目录 bundle**（`<name>/SKILL.md`）或**平铺 Markdown 文件**（`<name>.md`）。**刻意不支持嵌套 `**/SKILL.md`**（发现深度一层）。

格式 = YAML frontmatter + Markdown 正文：

```markdown
---
name: my-awesome-skill
description: 一句话说明这个 skill 何时用、做什么。
whenToUse: 可选，更详细的触发条件。
metadata:
  version: 1
  category: coding
disable-model-invocation: false
user-invocable: true
---

# 正文从这里开始

这里是模型加载该 skill 后会读到的完整指令正文……
```

### 6.2.1 frontmatter 字段（真实契约）

| 字段 | 必填 | 含义 |
|---|---|---|
| `name` | ✅ | skill 名，**必须 kebab-case**（`isSkillName` 校验） |
| `description` | ✅ | 目录里展示的一句话描述 |
| `whenToUse` | ❌ | 可选的详细触发条件 |
| `metadata` | ❌ | 任意开放对象（目前不授予调用权限） |
| `disable-model-invocation` | ❌ | `true` 则从模型目录与 loader 排除 |
| `user-invocable` | ❌ | `false` 则从面向用户命令排除 |

**调用策略校验遵循「失败时默认拒绝」**：布尔字段用驼峰（`disableModelInvocation`）或非布尔值，都会**记录警告并排除整个 skill**，而不是只丢字段或回退宽松默认。可接受的布尔写法：YAML 布尔值，以及大小写不敏感的 `true/false`、`yes/no`、`on/off`、`1/0`。

> 误用驼峰会静默导致你的 skill「不出现」——这是最常见的坑。写 frontmatter 务必用**小写连字符**：`disable-model-invocation`、`user-invocable`。

### 6.2.2 正文与资源基底

加载后，`resourceBase` 是 `{ kind: 'directory', path }`——即 skill 所在目录。正文里可以用相对路径引用同目录的 `references/`、`scripts/`、`assets/` 等资源，模型通过文件工具按该基底访问。

---

## 6.3 发现根目录与 rank

`dsh-skill-filesystem` 按 rank 顺序扫描以下根（真实契约）：

| rank | source | 路径 |
|---|---|---|
| 100 | project-dsh | `<projectRoot>/.dsh/skills` |
| 200 | project-agents | `<projectRoot>/.agents/skills` |
| 300 | custom | `Config.customSkillDirs` |
| 400 | user-dsh | `<dshHome>/skills` |
| 500 | user-agents | `<agentsHome>/skills` |

- **项目根**是「包含 `.git` 的最近祖先目录」；没有 `.git` 则用 cwd。
- 用户 DSH 根会跳过 `.system` 子目录（系统拥有的 skill 不当普通用户 skill）。
- **rank 决定同名 skill 的覆盖优先级**：rank 越小优先级越高（project 覆盖 user）。

所以：想给「当前项目」写 skill，放 `<project>/.dsh/skills/<name>/SKILL.md`；想给「你自己所有项目」写，放 `~/.dsh/skills/<name>/SKILL.md`；想在代码仓库里随项目分发，放 `.agents/skills/`。

---

## 6.4 写一个 Skill（实战）

目标：写一个「检查并修复 Markdown 链接」的 skill，随项目分发。

### 目录结构

```
<project>/.dsh/skills/markdown-link-check/
└── SKILL.md
```

### SKILL.md

```markdown
---
name: markdown-link-check
description: 检查并修复 Markdown 文档中的死链与相对路径错误。
whenToUse: 当用户要求"检查链接""修复死链""check links"或审查 Markdown 文档时使用。
---

# Markdown 链接检查

## 目标
找出当前仓库 Markdown 文件中的断链。

## 步骤
1. 用 grep 工具列出所有 `](...)` 形式的链接。
2. 对每个相对链接，解析为相对于所在文件的路径。
3. 用 read 或 glob 工具确认目标文件是否存在。
4. 收集所有断链，按文件分组汇报，并给出修复建议（改名/改路径/删除）。
5. 未经用户确认，不要批量改写文件；先给清单。

## 常见陷阱
- 锚点链接（`#xxx`）不视为断链，但可在有目标文件时顺带核对标题。
- 忽略外部 http(s) 链接，除非用户明确要求。
```

把它放进项目后，模型的下一次请求里 `skill` 工具就能看到 `markdown-link-check`，触发词命中时加载正文。

---

## 6.5 自定义 Skill 提供方（进阶）

如果你想让 skill 来自数据库、远程 API 或其他非文件系统来源，就实现一个 provider 并注册到 `ctx.skills`。

provider 契约（源自 `dsh-skill-filesystem` 的实现，真实结构）：

```ts
// my-skill-provider.ts
export const name = 'my-skill-provider'
export const inject = ['skills']

export function apply(ctx, config) {
  ctx.skills.registerProvider((control) => {
    return new MyProvider(ctx, control, config)
  })
}

class MyProvider {
  name = 'my-provider'
  constructor(ctx, control, config) {
    // control.signal: 当提供方应停止时触发
    // control.invalidate: 让注册表重新发现（目录变了时调用）
    control.signal.addEventListener('abort', () => { /* 清理 */ }, { once: true })
  }

  // 返回 skill 概览候选（name/description/whenToUse/rank/provider/source/…）
  async list(options) {
    return candidates
  }

  // 根据候选 locator 加载完整正文，返回 { name, description, content, resourceBase, ... }
  async get(candidate, options) {
    return fullSkill   // 文件消失时返回 undefined
  }
}
```

关键点：

- `list(options)` 的 `options.cwd` 用于 cwd 敏感的工作区（本地 provider 据此选项目根）。
- `get(candidate, options)` 的 `options.signal` 用于取消文件/网络读取。
- 提供方被 `control.invalidate` 失效后，注册表会重新 `list`。
- 文件系统 provider 还监听 `fs/observed` 事件：第一方 `write`/`edit` 工具改了可能影响 skill 的文件时，**同步**失效，让模型下一步无需等 watcher 就能看到自己的改动。

---

## 6.6 目录变更检测（了解即可）

`dsh-skill-filesystem` 用 Chokidar 监视现有 skill 根：只关心**直属 bundle 目录的增删**、**平铺 `.md` 文件的增删**、**`SKILL.md` 的增删改**；`change` 事件用于重新发现 `name`/`description` 等 frontmatter。`references/`、`scripts/`、`assets/` 等资源变更**不会**使目录失效（不影响概览）。

不存在的根会从最近现有祖先开始逐段轮询探测（`fs.watchFile`），所以「创建整个 skills 目录」也能被观察到。

---

## 6.7 Skill vs 工具：什么时候用哪个

| 维度 | 工具（tool） | Skill（skill） |
|---|---|---|
| 本质 | 可执行的函数 + 强类型 schema | 按需加载的指令/知识 |
| 模型看到 | 每次请求都在 schema 里 | 概览在目录里，正文加载后进历史 |
| 成本 | 每次请求固定成本（与工具数成正比） | 概览成本低，正文按需加载 |
| 适合 | 确定性操作（读文件、执行命令、写 todo） | 流程性知识、领域规范、复杂工作流 |
| 分发 | npm 包（插件） | 纯 Markdown 文件（放目录即可） |

一句话：**「做一件事」用工具；「怎么把一件复杂的事做好」用 skill。**

---

## 6.8 本章小结

- Skill = frontmatter + Markdown；`name` 必须 kebab-case，`description` 必填。
- 调用策略字段用小写连字符；非法值默认拒绝（整个 skill 被排除）。
- 根目录 rank：project(100/200) > custom(300) > user(400/500)。
- 注册表 `ctx.skills`，提供方实现 `list`/`get`，通过 `registerProvider` 接入。
- 正文按需加载、每次重读；资源基底指向 skill 目录。

下一章讲 **命令开发**——人类与 Agent 的斜杠命令交互。
