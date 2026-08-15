# 第 3 章 Profile、Bundle 与 patch 层

这一章回答一个核心问题：**你写好的插件，如何进入 DSH 并被加载？** 答案是三件套：bundle（打包插件行）、profile（组合 bundle）、patch 层（覆盖与配置）。

---

## 3.1 目录结构与三份文件

一个 profile 是一个目录，位于 `$DSH_HOME/profiles/<name>`（`$DSH_HOME` 默认 `~/.dsh`，可通过环境变量覆盖）。首次使用 `web`/`headless` 或执行 `dsh plugin` 时会自动初始化，得到三份文件：

```
$DSH_HOME/profiles/<name>/
├── package.json           # 依赖 + profile manifest（dsh.profile.bundles）
├── cordis.patch.yml       # 用户自己的 patch 层
├── pnpm-workspace.yaml    # pnpm 配置（nodeLinker: hoisted 等）
└── node_modules/          # 树外插件由 pnpm 安装到这里
```

真实代码（`@deepseek-ai/dsh-app-boot` 的 `initProfile`）生成的结构：

```jsonc
// package.json（真实模板）
{
  "name": "dsh-profile-<name>",
  "private": true,
  "dependencies": {},
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base"] } }
}
```

```yaml
# cordis.patch.yml（真实模板）
# 你的 patch 层，应用在所有 bundle 层之后：一个顶层 YAML 数组，
# 含 loader patch 条目（按 id 定位的配置覆盖、disable、insert 列表；允许 !!js 表达式）。
[]
```

```yaml
# pnpm-workspace.yaml（真实模板）
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
```

---

## 3.2 三层 patch 的叠加顺序

DSH 的配置树从「空根」开始，按以下顺序叠加（**后者覆盖前者**）：

1. `dsh.profile.bundles` 中**每个 bundle 的 patch**（按 bundles 列表顺序）；
2. profile 自身的 `cordis.patch.yml`；
3. home 级的 `$DSH_HOME/cordis.patch.yml`（机器级偏好，作用于所有 profile，所以它高于 per-profile 层）；
4. `--patch` 指定的覆盖层（argv 顺序）；
5. 启动器派生的 flag patch（如遥测禁用开关）。

真实代码（`@deepseek-ai/dsh/lib/profile-boot-*.js` 的 `composeProfile`）明确了这个顺序。**层优先级越高，越靠后应用，越有最终决定权。**

> 理解这个顺序的实用价值：你想「覆盖一个 bundle 里某插件的配置」，就写在 profile 的 `cordis.patch.yml`；你想「本机所有 profile 都关掉某个东西」，就写在 `$DSH_HOME/cordis.patch.yml`；你想「临时试一个覆盖」，就用 `--patch`。

---

## 3.3 patch 条目的语义

patch 文件是一个**顶层 YAML 数组**，元素是 loader patch 条目。最常用的是 `insert` 与「按 id 覆盖」。

### 3.3.1 insert：声明插件行

这是 bundle 的核心内容。真实代码（`@deepseek-ai/dsh-base/cordis.patch.yml` 节选）：

```yaml
- insert:
    - id: timer
      name: '@deepseek-ai/cordis-plugin-timer'

    - id: llm
      name: '@deepseek-ai/dsh-llm'

    - id: agent-default-model
      name: '@deepseek-ai/dsh-agent-default-model'
      config:
        provider: deepseek-official
        model: deepseek-v4-flash

    - id: bash-sandbox
      name: '@deepseek-ai/dsh-bash-sandbox'
      disabled: !!js process.platform === 'win32'
      config:
        timeoutMs: 60000
```

每一行的字段：

| 字段 | 含义 |
|---|---|
| `id` | 该行的**寻址标识**，后续层按它覆盖/禁用 |
| `name` | 插件包名（loader 据此解析模块） |
| `config` | 传给插件 `apply` 的配置对象（会被 `Config` schema 校验） |
| `disabled` | 为真则该行不加载（可用 `!!js` 表达式按平台/环境动态决定） |

注意两点：

1. **`config` 是整体替换，不是深合并**。后一个层写了同一 `id` 的 `config`，就完全替换前一个层的 `config`。所以「按模式不同而不同的行」不属于共享 bundle（base），而是每个模式 bundle 各自完整声明（这是 `dsh-base` 头部注释明确说明的约定）。
2. **行顺序不承载加载语义**。激活是「服务可用性驱动」的（第 2 章），行顺序只是给读者分组。

### 3.3.2 按 id 覆盖与禁用

用户在自己的 `cordis.patch.yml` 里，可以引用 bundle 已声明的 `id` 来覆盖：

```yaml
# profile 的 cordis.patch.yml —— 覆盖 base 里 session-query-sqlite 的配置
- id: session-query-sqlite
  config:
    path: '/data/sessions.db'
    openAt: first-search

# 禁用某行
- id: skill-badge
  disabled: true
```

`!!js` 表达式让配置可以依赖运行环境。真实代码里大量使用：

```yaml
- id: bash-sandbox
  name: '@deepseek-ai/dsh-bash-sandbox'
  disabled: !!js process.platform === 'win32'      # Windows 上禁用 bash

- id: pwsh-sandbox
  name: '@deepseek-ai/dsh-pwsh-sandbox'
  disabled: !!js process.platform !== 'win32'      # 非 Windows 上禁用 pwsh
```

---

## 3.4 bundle：`dsh.bundle.patch` 声明

一个 bundle 就是一个 npm 包，它的 `package.json` 里声明了 patch 文件的路径：

```jsonc
// @deepseek-ai/dsh-base/package.json（真实节选）
{
  "name": "@deepseek-ai/dsh-base",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./cordis.patch.yml": "./cordis.patch.yml"
  }
}
```

`dsh plugin` 的**自动对账**（reconcile）机制就依赖这个声明：一个依赖包如果解析到了 `dsh.bundle.patch`，它就会自动加入 `dsh.profile.bundles`；如果某个已列出的依赖不再声明（被卸载，或新版本删掉了声明），就从列表移除。真实代码（`@deepseek-ai/dsh/lib/plugin-*.js`）：

```ts
function exportsPatch(packageName, profileDir) {
  const dir = resolveBundleDir(NAME, packageName, INSTALL_ANCHOR, profileDir)
  return readProfileManifest(NAME, dir).dsh?.bundle?.patch !== void 0
}
```

---

## 3.5 模块解析：两锚点

`dsh.profile.bundles` 里的包名按以下顺序解析（真实代码注释明确）：

1. **先**从 dsh 安装目录（launcher 自身的包）解析——`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-headless` 等 in-box bundle 永远从这里来；
2. **再**从 profile 自己的 `node_modules` 解析——pnpm 把树外插件装在这里。

这是「**bundles 来自安装**」契约的体现：内置 bundle 不经 pnpm 管理，而是通过 `$DSH_HOME/profiles/node_modules` 这个「每个安装内包一个符号链接」的扁平 fallback 目录，让任何 profile 都能用普通 Node 父目录向上查找解析到内置插件。

**实用含义**：你开发自己的 bundle，就 `dsh plugin --profile <name> add <你的包>`，让它进 profile 的 `node_modules`；它声明了 `dsh.bundle.patch`，就会被对账进 `bundles` 列表。

---

## 3.6 实战：创建并挂载自己的 bundle

目标：做一个最小 bundle `my-bundle`，里面只有一个插件（第 2 章的 clock/tick 可以复用，这里用一个更简单的「启动问候」插件），然后装进一个自定义 profile 并验证它被加载。

### 第 1 步：创建 bundle 包

```
my-bundle/
├── package.json
├── cordis.patch.yml
└── lib/
    ├── index.js        # 插件本体（name/inject/apply）
    └── index.d.ts      # 类型（可选）
```

```jsonc
// package.json
{
  "name": "@you/my-bundle",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./cordis.patch.yml": "./cordis.patch.yml"
  },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/schemastery": "*"
  }
}
```

```yaml
# cordis.patch.yml —— 声明一行插件
- insert:
    - id: my-greeter
      name: '@you/my-bundle'
      config:
        message: 'hello from my bundle'
```

```js
// lib/index.js —— 插件本体
import z from '@deepseek-ai/schemastery'

export const name = 'my-greeter'
export const Config = z.object({ message: z.string().default('hello') })

export function apply(ctx, config) {
  ctx.on('app/ready', () => {
    ctx.logger.info('[my-greeter] %s', config.message)
  })
}
```

### 第 2 步：初始化 profile 并安装 bundle

```sh
# 自定义 profile（非 web/headless 模板，用 dsh plugin 触发初始化）
dsh plugin --profile mypro add @you/my-bundle
```

这条命令会：

1. 若 `$DSH_HOME/profiles/mypro` 不存在，用 `DEFAULT_PROFILE_BUNDLES = ["@deepseek-ai/dsh-base"]` 初始化；
2. 把 cwd 切到 profile 目录，执行 `pnpm add @you/my-bundle`；
3. 执行 `reconcilePlugins`：发现 `@you/my-bundle` 声明了 `dsh.bundle.patch`，自动把它 append 到 `dsh.profile.bundles`。

之后 `package.json` 会变成：

```jsonc
{
  "dependencies": { "@you/my-bundle": "^0.1.0" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@you/my-bundle"] } }
}
```

### 第 3 步：验证配置树

```sh
dsh --profile mypro --dump-config
```

输出的是组合后的配置树——你应该能看到 `my-greeter` 这一行及其 config。`--dump-default-config` 则只打印 bundle 层（不含用户层与 `--patch`）。

### 第 4 步：覆盖它的配置

在 `$DSH_HOME/profiles/mypro/cordis.patch.yml` 写：

```yaml
- id: my-greeter
  config:
    message: 'overridden by my profile'
```

再 `dsh --profile mypro --dump-config`，`my-greeter` 的 `config.message` 就变成了覆盖值。

---

## 3.7 常见陷阱

1. **`config` 是整体替换**：想改某个 bundle 行里 config 的一个字段，必须完整重写该 config（参考该行的 schema 补全所有必填项），而不是只写要改的那个字段。
2. **bundle 名写在 `bundles` 里但包没声明 `dsh.bundle.patch`**：启动会报错 `declares no dsh.bundle`。别把普通库当成 bundle 写进列表。
3. **git 托管的插件需要 prepare 脚本构建**：`dsh plugin add git+https://...` 时，pnpm 默认会阻止依赖的构建脚本，报错时按提示把 pnpm 打印的 key 加到 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds`（第 12 章详述）。
4. **相对路径 spec 会被锚定到调用目录**：`dsh plugin add .` 或 `../plugin` 会被解析为「相对于你敲命令时的 cwd」，避免误把 profile 自己 link 进来。

---

## 3.8 本章小结

- **bundle** = 声明 `dsh.bundle.patch` 的 npm 包，其 `cordis.patch.yml` 用 `- insert:` 声明插件行。
- **profile** = `dsh.profile.bundles`（有序 bundle）+ 自己的 `cordis.patch.yml`。
- **patch 层叠加顺序**：bundles → profile 层 → home 层 → `--patch`。
- **行寻址**：`{id, name, config, disabled}`；config 整体替换；`!!js` 支持表达式；行顺序无加载语义。
- **`dsh plugin`** = pnpm 转发 + 按 `dsh.bundle.patch` 自动对账 bundles。
- **模块解析两锚点**：安装目录 → profile `node_modules`。

下一章深入「服务与依赖注入」——插件之间如何协作、作用域如何隔离。
