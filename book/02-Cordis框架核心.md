# 第 2 章 Cordis 框架核心

DSH 的一切插件都是 Cordis 插件。这一章把 Cordis 的核心概念讲透：`Context`、`Service`、插件形态、`inject`、`provide`、effect、事件、生命周期、配置校验。读完你能写出一个**真正可运行**的最小插件。

> Cordis 是 DSH 从 `cordis` 项目（作者 Shigma）引入并维护在 `vendor/cordis` 的插件框架，发布为 `@deepseek-ai/cordis`。它是 ESM-first 的 TypeScript 框架。

---

## 2.1 Context：一切的起点

`Context` 是 Cordis 的**根依赖容器**。它同时是：

- 一个**服务解析器**：`ctx.<serviceName>` 读取已提供的服务；
- 一个**插件注册入口**：`ctx.plugin(...)`、`ctx.inject(...)`；
- 一个**作用域**：`ctx.extend()` / `ctx.isolate()` / `ctx.intercept()` 派生子作用域；
- 一个**事件总线**：`ctx.on/emit/parallel/serial/bail/waterfall`。

真实代码（`@deepseek-ai/cordis` 的 README Quick Start，也是全框架最简示例）：

```ts
import { Context, Service } from '@deepseek-ai/cordis'

// 1) 声明模块扩充：告诉类型系统 ctx 上多了哪些服务、事件
declare module '@deepseek-ai/cordis' {
  interface Context {
    counter: Counter
  }
  interface Events {
    'app/ready'(message: string): void
  }
}

// 2) 定义一个服务
class Counter extends Service {
  value = 0
  constructor(ctx: Context) {
    super(ctx, 'counter')   // 立即注册为 ctx.counter，随 fiber 自动卸载
  }
  next() {
    return ++this.value
  }
}

// 3) 一个函数形态的插件，声明依赖 'counter'
const greeter = Object.assign((ctx: Context) => {
  ctx.on('app/ready', (message) => {
    ctx.logger.info('%s #%d', message, ctx.counter.next())
  })
}, {
  inject: ['counter'],
})

// 4) 装配
const root = new Context()
await root.plugin(Counter)      // 先提供 counter 服务
await root.plugin(greeter)      // 再启动依赖它的插件

root.emit('app/ready', 'started')   // 打印 "started #1"
await root.fiber.dispose()          // 逆序回收所有资源
```

这段代码展示了四个关键事实：

1. `new Context()` 创建根容器；
2. `ctx.plugin()` 启动插件并返回一个 `Fiber`（`await` 它可等启动完成、抛错时得到启动错误）；
3. `inject` 告诉 Cordis 该插件需要哪些服务，服务先于消费者可用；
4. effects、事件监听器、服务，都会在所属 fiber 被 dispose 时移除。

---

## 2.2 插件的三种写法

Cordis 的 `registry.resolve(plugin)` 接受三种形态，最终都解析到一个「回调函数」作为插件的身份标识：

### 2.2.1 函数插件（DSH 最常用的形态）

DSH 插件标准导出是**具名导出**，由 loader 读取：

```ts
// packages/extensions/tool-todo/src/index.ts（节选，真实代码）
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-todo'
export const inject = ['tools']            // 依赖 ctx.tools
export const Config = z.object({
  allowParallelInProgress: z.boolean().required(),
})

export function apply(ctx: Context, config: z.infer<typeof Config>) {
  // config 已通过标准 schema 校验
  ctx.tools.register(defineTool({ ... }))
}
```

要点：

- `name`：插件名（loader 用它做诊断/日志）。
- `inject`：字符串数组，声明依赖的服务名。Cordis 会**等到这些服务可用**才执行 `apply`。
- `Config`：Schemastery 的配置 schema，启动前校验配置，失败即 `ValidationError`。
- `apply(ctx, config)`：插件主体，`config` 是**已校验并归一化**后的配置对象。

### 2.2.2 类插件

类如果 `isConstructor` 成立（有 prototype、非生成器函数），会被 `new` 构造：

```ts
class MyPlugin {
  static inject = ['logger']
  constructor(ctx: Context, config: Config) {
    ctx.on('something', () => { /* ... */ })
  }
}
```

`Service` 就是类插件的典型基类：它在 `super(ctx, name)` 时立刻 `ctx.provide(name, this)`。

### 2.2.3 对象插件

```ts
const plugin = {
  name: 'my-plugin',
  inject: ['tools'],
  Config: z.object({ /* ... */ }),
  apply(ctx: Context, config) { /* ... */ },
}
```

`registry.resolve` 会取对象的 `.apply` 作为身份回调。

> 统一结论：**无论哪种写法，`inject`（依赖）与 `Config`（配置 schema）都挂在插件身份（函数/类/对象）上，`apply`（或类构造）是执行体。**

---

## 2.3 服务：provide / inject / Service

### 2.3.1 提供与消费

```ts
// 提供：把一个值注册为命名服务，随当前 fiber 自动注销
const dispose = ctx.provide('myService', someValue)

// 消费：声明依赖后，在 apply 里直接读
export const inject = ['myService']
export function apply(ctx) {
  ctx.myService.doSomething()
}
```

Cordis 的服务解析是**惰性 + 依赖驱动**的：

- 一个插件 `inject` 了某服务，但该服务尚未提供 → 插件保持 `inactive`（未激活）状态，**不执行 `apply`**。
- 服务被提供 → Cordis `notify` 所有依赖它的 fiber，重新评估，满足即激活。
- 服务被注销 → 依赖它的插件先卸载，等新服务实例出现再重启。

这就是 DSH `cordis.patch.yml` 注释里反复强调的「**激活是服务可用性驱动，行顺序不承载加载语义**」。

### 2.3.2 Service 基类

```ts
class MyService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myService')   // 等价于 ctx.provide('myService', this)
  }
}
```

`Service` 的构造器里调用 `ctx.reflect.provide(name, this, this[Service.check])`，因此：

- 实例随所属 fiber 自动注册与注销；
- 可定义 `static provide = 'xxx'` 或 `static check`（可用性谓词）。

### 2.3.3 惰性读取：`ctx.get`

```ts
const fs = ctx.get('fs')   // 返回 undefined，若未提供；不抛错
```

DSH 里很多可选依赖都用 `ctx.get('approval')` 这种「**无静态注入**」方式消费：有没有审批服务都能跑，有就走审批，没有就退化（fail-closed）。这是它与 `inject`（硬依赖，没有就不启动）的关键区别。

---

## 2.4 effect：资源所有权与清理

Cordis 的**生命周期铁律**：插件在 `apply` 里创建的任何需要回收的资源，都要交给 `ctx.effect()` 登记。插件被卸载时，effects 按**逆序**执行清理。

`ctx.effect(execute, label)` 的 `execute` 可以是：

1. **同步函数**，返回一个 disposer：

   ```ts
   ctx.effect(() => {
     const timer = setInterval(tick, 1000)
     return () => clearInterval(timer)   // 卸载时调用
   }, 'my-timer')
   ```

2. **async 函数**，返回一个 async disposer：

   ```ts
   ctx.effect(async () => {
     const client = await connect()
     return async () => await client.close()
   })
   ```

3. **生成器函数**，用 `yield` 依次登记多个 disposer（真实代码常用形态）：

   ```ts
   // 源自 dsh-skill-filesystem/src/index.ts
   ctx.effect(function* () {
     yield async () => { await provider.dispose() }
   }, 'skill-filesystem watcher')
   ```

   生成器里每个 `yield` 的值都是一个 disposer；卸载时逆序调用。

4. **直接返回一个 disposer 函数**。

DSH 全库几乎把「资源生命周期」全部建立在 effect 上：定时器、事件监听、watcher、服务注册、子进程……**只要你把清理闭包交给 effect，框架就替你保证不会泄漏**。

---

## 2.5 事件总线

Cordis 内置了六种事件分发方式，覆盖了 DSH 里绝大多数「扩展点」：

| 方法 | 语义 | 典型用途 |
|---|---|---|
| `ctx.on(name, listener)` | 注册监听器（随 fiber 自动注销） | 订阅生命周期/通知 |
| `ctx.once(name, listener)` | 只触发一次 | 一次性初始化 |
| `ctx.emit(...args)` | 同步并发分发，不等待 Promise | 通知 |
| `ctx.parallel(...args)` | 并发分发并等待全部，收集 rejection | 广播 + 汇总错误 |
| `ctx.serial(...args)` | 顺序 await，直到某个返回值「bail」 | 链式查找 |
| `ctx.bail(...args)` | 同步顺序，直到某个返回值「bail」 | 同步短路 |
| `ctx.waterfall(...args)` | 顺序执行，最后一个参数是 `next`；监听器可拦截/改写 | **变换/拦截扩展点** |

「bail」的定义：返回值不是 `null`/`false`/`undefined` 即视为「命中并停止」。

**waterfall 是 DSH 扩展点的主力机制**。比如 `tools/execute`、`tools/pre-execute`、`tools/post-execute`、`system-prompt/assemble`、`internal/config`、`internal/update` 都是 waterfall：中间件按顺序包裹，可改写参数、可提前 veto、可替换结果。

---

## 2.6 生命周期：Fiber 的状态机

每个插件实例都对应一个 `Fiber`。它的状态（`state` 字段）：

| state | 常量 | 含义 |
|---|---|---|
| 0 | inactive | 未激活（依赖未满足，或已卸载） |
| 1 | loading | 正在加载（`_reload` 执行中） |
| 2 | active | 活跃（`apply` 已完成） |
| 3 | error | 启动失败（`_error` 记录了原因） |
| 4 | disposed | 已 dispose |
| 5 | unloading | 正在卸载 |

关键方法：

- `fiber.await()`：等待当前生命周期工作结束；若有启动错误则抛出。
- `fiber.dispose()`：卸载插件（逆序清理 effects）。
- `fiber.restart()`：用当前配置卸载并重载。
- `fiber.update(config)`：校验新配置，走 `internal/update` waterfall（HMR 可 veto），然后 restart。
- `fiber.getEffects()`：诊断用，返回当前 effect 树。

理解这些状态对调试至关重要：你看到的「插件没生效」，多半是它停在 `inactive`（依赖没满足）或 `error`（启动抛错）状态。第 12 章会讲如何诊断。

---

## 2.7 配置校验：Schemastery + 标准 Schema

DSH 用 `@deepseek-ai/schemastery` 定义配置 schema。`Config` 通过 **standard-schema** 接口暴露 `["~standard"].validate`，Cordis 在启动前调用它，失败抛 `ValidationError`（聚合所有 issue）。

```ts
import z from '@deepseek-ai/schemastery'

export const Config = z.object({
  providerName: z.string().min(1).default('filesystem'),
  includeDefaultRoots: z.boolean().default(true),
  customSkillDirs: z.array(z.string()).default([]),
  watch: z.boolean().default(true),
})
```

要点：

- `.default(x)` 意味着该字段可缺省，归一化后 `config` 上一定有个值。
- `.required()` 意味着缺省即校验失败。
- 校验是**同步**的（`"then" in result` 会抛 `TypeError("Async config validation is not supported")`）。

因此插件作者**可以假设 `apply` 拿到的 `config` 一定是良构的**，不必再手工判空。

---

## 2.8 作用域：extend / isolate / intercept

Context 可以派生子作用域，且**不修改父作用域**：

```ts
ctx.extend(meta)          // 子上下文，meta 的 own 属性覆盖继承属性
ctx.isolate(name, label)  // 为某个服务名开辟独立服务作用域（同 label 会 join）
ctx.intercept(name, config) // 为某个服务附加 intercept 配置（Service.resolveConfig 会合并）
```

作用域的威力在第 9 章（Agent Preset）体现：`agent.cordis.yml` 里的 `isolate: { planMode: true }` 就是为 `planMode` 服务开辟**每预设一份实例**的隔离域，避免多个预设共享同一实例。这里先记住概念即可。

---

## 2.9 第一个可运行插件：把它们串起来

下面是一个**完整可运行**的最小插件，它演示了 `name`/`inject`/`Config`/`apply`/effect/事件/服务全链路。它做的事：提供一个 `clock` 服务，每秒 `emit` 一个 `tick` 事件；另一个插件消费该事件并打印。

```ts
// clock-plugin.ts
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

declare module '@deepseek-ai/cordis' {
  interface Context { clock: Clock }
  interface Events { 'clock/tick'(at: string): void }
}

class Clock extends Service {
  constructor(ctx: Context) { super(ctx, 'clock') }
  now() { return new Date().toISOString() }
}

export const name = 'clock-provider'
export const Config = z.object({ intervalMs: z.number().default(1000) })

export function apply(ctx: Context, config: z.infer<typeof Config>) {
  ctx.plugin(Clock)                       // 提供服务
  ctx.effect(() => {
    const timer = setInterval(() => ctx.emit('clock/tick', ctx.clock.now()), config.intervalMs)
    return () => clearInterval(timer)      // 卸载时清定时器
  }, 'clock ticker')
}
```

```ts
// tick-consumer.ts
export const name = 'tick-consumer'
export const inject = ['clock']            // 等 clock 服务就绪才启动

export function apply(ctx: Context) {
  ctx.on('clock/tick', (at) => ctx.logger.info('tick at %s', at))
}
```

```ts
// main.ts
import { Context } from '@deepseek-ai/cordis'
import * as clockProvider from './clock-plugin.js'
import * as tickConsumer from './tick-consumer.js'

const root = new Context()
await root.plugin(clockProvider)
await root.plugin(tickConsumer)

// 进程会持续每秒打印 tick；按 Ctrl+C 退出。
```

在 DSH 里，你不会手动 `root.plugin(...)`，而是把插件名写进 `cordis.patch.yml`（下一章）。但**这个手动装配模型，正是 DSH 加载器的底层**。

---

## 2.10 本章小结

| 概念 | 一句话 |
|---|---|
| Context | 依赖容器 + 服务解析器 + 作用域 + 事件总线 |
| 插件形态 | 函数 / 类 / `{apply}`，都带 `inject` + `Config` |
| Service | `super(ctx, name)` 即注册，随 fiber 注销 |
| inject | 硬依赖：没有就不启动；`ctx.get` 是软依赖 |
| effect | 资源所有权：登记清理闭包，逆序回收 |
| 事件 | on/once/emit/parallel/serial/bail/waterfall 六种分发 |
| Fiber | 插件运行期：状态机 + 启动/卸载/重载 |
| Config | Schemastery 同步校验，`apply` 拿到良构配置 |

下一章讲 profile、bundle、patch 层——即「如何把这棵插件树**组合**并**配置**起来」。
