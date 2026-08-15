// 冒烟验证：直接加载示例插件的 apply/Config，用真实的
// @deepseek-ai/cordis + @deepseek-ai/dsh-tools(defineTool) + @deepseek-ai/schemastery
// 验证工具与命令插件能正确执行。运行：node verify-examples.mjs
import { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

// 从示例包直接导入插件本体（裸导入经工作区 node_modules junction 解析）
import * as timeTool from './examples/my-harness-tools/lib/index.js'
import * as commandHello from './examples/my-harness-tools/lib/command-hello.js'

const results = []

// 1) 验证 Config schema 与 defineTool 输出
{
  // Config 校验：Schemastery 的 default 应让空对象归一化出 timezone
  const parsed = timeTool.Config['~standard'].validate({})
  if ('then' in parsed) throw new Error('async config validation not supported')
  if (parsed.issues) throw new Error('config validation failed: ' + JSON.stringify(parsed.issues))
  results.push(['Config default timezone', parsed.value.timezone])
}

// 2) 用一个最小 tools 注册表跑 apply，验证工具定义 + execute + render
{
  const collected = []
  const ctx = new Context()
  ctx.provide('tools', { register(def) { collected.push(def); return () => {} } })
  timeTool.apply(ctx, { timezone: 'Asia/Tokyo' })

  const def = collected[0]
  if (!def) throw new Error('time-tool did not register a tool')
  results.push(['tool name', def.name])
  results.push(['parameters schema type', def.parameters?.type])
  results.push(['output schema type', def.output?.schema?.type])

  const value = await def.execute({}, { signal: new AbortController().signal })
  results.push(['execute keys', Object.keys(value).join(',')])
  results.push(['render', def.output.render({}, value)[0].text])
}

// 3) 验证命令插件：注册 + handler 返回 CommandResult
{
  const collected = []
  const ctx = new Context()
  ctx.provide('commands', { register(def) { collected.push(def); return () => {} } })
  commandHello.apply(ctx, {})

  const def = collected[0]
  if (!def) throw new Error('command-hello did not register a command')
  results.push(['command name', def.name])
  const out = def.handler({ rawInput: '世界', agent: null, signal: new AbortController().signal, commandId: 'x' })
  results.push(['command result', JSON.stringify(out)])
}

for (const [k, v] of results) console.log(`\u2713 ${k}: ${v}`)
console.log('\nALL CHECKS PASSED')
