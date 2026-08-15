# 示例仓库：《DeepSeek Harness 插件开发指南》配套代码

这里把书中的「真实案例」落成可直接安装、可运行的代码。全部与书中章节一一对应。

---

## 1. `my-harness-tools/` —— bundle + 工具 + 命令

一个最小 bundle，包含两个插件：

- `lib/index.js` → **时间工具**（第 5、12 章）
- `lib/command-hello.js` → **hello 命令**（第 7 章）
- `cordis.patch.yml` → 用 `- insert:` 声明两行插件（第 3 章）

### 安装

```sh
# 安装进一个自定义 profile（自动初始化 + pnpm add + 对账 bundles）
dsh plugin --profile dsh-book-demo add "D:\lgiang程序\DS对话\examples\my-harness-tools"

# 验证组合树（应能看到 time-tool 与 command-hello 两行）
dsh --profile dsh-book-demo --dump-config
```

### 验证命令是否生效

```sh
# 用 headless 一次性任务时，hello 命令不经过模型，这里仅演示安装/对账；
# 交互式 web 界面下，在输入框敲 /hello world 即可看到 "Hello, world!"
dsh web
```

### 清理（如不需要）

```sh
# 删除整个演示 profile
Remove-Item -Recurse -Force "$env:DSH_HOME\profiles\dsh-book-demo"
```

---

## 2. `skill-example/` —— 一个 Skill（第 6 章）

把 `markdown-link-check` 目录放到任一 skill 根即可被模型发现：

- 项目级：`<project>/.dsh/skills/markdown-link-check/SKILL.md`
- 用户级：`~/.dsh/skills/markdown-link-check/SKILL.md`

```sh
# 拷贝到用户级 skill 根（Windows PowerShell）
$dst = Join-Path $env:DSH_HOME 'skills'
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item -Recurse "D:\lgiang程序\DS对话\examples\skill-example\markdown-link-check" $dst
```

之后在新会话里，模型触发词命中「检查链接 / check links」时即可加载该 skill。

---

## 与书的关系

| 示例 | 章节 |
|---|---|
| `my-harness-tools/lib/index.js` | 第 5 章 工具开发、第 12 章 收尾案例 |
| `my-harness-tools/lib/command-hello.js` | 第 7 章 命令开发 |
| `my-harness-tools/cordis.patch.yml` | 第 3 章 Profile 与 Bundle |
| `my-harness-tools/package.json` | 第 3、12 章（`dsh.bundle.patch` 声明） |
| `skill-example/.../SKILL.md` | 第 6 章 Skill 开发 |

---

## 3. 冒烟验证（`verify-examples.mjs`，已通过）

仓库根目录的 `verify-examples.mjs` 用真实的 `@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools`（`defineTool`）+ `@deepseek-ai/schemastery` 直接加载两个插件的 `apply`/`Config`，验证：

- `Config` 的 schema 校验与默认值归一化；
- 工具定义编译出合法的 `parameters`/`output` schema，`execute` + `render` 真实执行（含时区换算）；
- 命令插件注册成功，`handler` 返回正确的 `CommandResult`。

运行前提：工作区根有一个 `node_modules` junction 指向已安装的 `@deepseek-ai/*` 依赖（本仓库已建好；若失效，重建方式）：

```sh
# Windows（指向你机器上的 dsh node_modules 目录）
New-Item -ItemType Junction -Path "D:\lgiang程序\DS对话\node_modules" `
  -Target "C:\Users\lgian\node-v22.19.0-win-x64\node_modules\@deepseek-ai\dsh\node_modules"

node verify-examples.mjs
```

## 4. 端到端安装验证（已通过）

以下命令在本机实际执行成功（沙箱环境用 `DSH_HOME` 重定向到工作区内 `.dsh-test` 避免写 `~/.dsh`）：

```sh
DSH_HOME=.../.dsh-test dsh plugin --profile dsh-book-demo add <示例目录>
DSH_HOME=.../.dsh-test dsh --profile dsh-book-demo --dump-config
```

`dsh plugin` 自动把 `@book/my-harness-tools` 对账进 `dsh.profile.bundles`；`--dump-config` 正确渲染出 `time-tool`（含 `timezone: Asia/Shanghai`）与 `command-hello` 两行——即第 3 章「bundle 对账 + patch 组合」的完整闭环。
