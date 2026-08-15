# 附录 A　Cordis API 速查

> 本节是 `@deepseek-ai/cordis@4.0.1` 的常用 API 速查，供开发时随手翻阅。完整契约以源码类型定义为准。

---

## A.1 Context

```ts
import { Context, Service, Inject } from '@deepseek-ai/cordis'

const root = new Context()          // 根容器
root.plugin(plugin, config?)        // 启动插件，返回 Fiber（await 等待启动完成）
root.inject(inject, callback)       // 以依赖 + 回调形式启动插件
root.provide(name, value, check?)   // 提供服务，返回 disposer
root.get(name)                      // 软读取服务（未提供返回 undefined）
root.effect(execute, label?)        // 登记 effect（资源所有权），返回 disposer
root.extend(meta)                   // 派生子作用域（不修改父）
root.isolate(name, label?)          // 为服务名开辟独立作用域
root.intercept(name, config)        // 为服务附加 intercept 配置
```

## A.2 插件形态

```ts
// 函数插件
export const name = 'x'
export const inject = ['a', 'b']            // 或 { a: config, b: null }
export const Config = z.object({ ... })     // Schemastery schema
export function apply(ctx, config) { ... }

// 类插件
class P { static inject = [...]; constructor(ctx, config) { ... } }

// 对象插件
const p = { name, inject, Config, apply(ctx, config) { ... } }

// 装饰器
@Inject('logger') class S extends Service { ... }   // 类依赖
```

## A.3 Service

```ts
class MyService extends Service {
  static provide = 'myService'        // 可选：默认服务名
  constructor(ctx) { super(ctx, 'myService') }   // 立即 ctx.provide
}
```

`Service` 关键静态符号：`init`（构造后运行的方法）、`check`（可用性谓词）、`invoke`（可调用服务）、`extend`、`resolveConfig`。

## A.4 事件

```ts
ctx.on(name, listener)        // 注册（随 fiber 注销）；返回 disposer
ctx.once(name, listener)      // 一次
ctx.emit(...args)             // 同步并发，不等 Promise
ctx.parallel(...args)         // 并发并等待全部（收集 rejection 为 AggregateError）
ctx.serial(...args)           // 顺序 await，直到 bail 值
ctx.bail(...args)             // 同步顺序，直到 bail 值
ctx.waterfall(...args)        // 顺序执行，末参数为 next；可拦截/改写/veto
```

「bail」判定：返回值不是 `null`/`false`/`undefined` 即命中停止。

## A.5 生命周期状态（Fiber）

| state | 含义 |
|---|---|
| 0 inactive | 依赖未满足 / 已卸载 |
| 1 loading | `_reload` 执行中 |
| 2 active | `apply` 已完成 |
| 3 error | 启动失败 |
| 4 disposed | 已 dispose |
| 5 unloading | 正在卸载 |

```ts
await fiber.await()     // 等生命周期稳定；有启动错误则抛
await fiber.dispose()   // 卸载（逆序清理 effects）
await fiber.restart()   // 卸载后按当前配置重载
await fiber.update(cfg) // 校验新配置 → internal/update waterfall → restart
fiber.getEffects()      // 当前 effect 树（诊断）
```

## A.6 错误

| 错误/类 | 含义 |
|---|---|
| `ValidationError` | 配置 schema 校验失败（`invalid config:` + 每条 issue 路径） |
| `CordisError('INACTIVE_EFFECT')` | 在已 dispose 的 fiber 上创建 effect |
| `service "x" has been registered at <fiber>` | 同名服务重复提供 |
| `cannot get required service "x" in inactive context` | 访问未注入/不可用服务 |

## A.7 作用域符号

```ts
Context.is(value)       // 判断是否为 Cordis context（跨 realm 安全）
Context.filter          // 事件监听作用域过滤（Symbol）
Context.isolate         // 隔离映射（Symbol）
Context.intercept       // intercept 配置（Symbol）
Context.effect          // effect 诊断元数据（Symbol）
```
