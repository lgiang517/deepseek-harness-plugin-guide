// 《DeepSeek Harness 插件开发指南》配套示例：hello 命令插件。
// 对应第 7 章（命令开发）。通过子路径导出，供 cordis.patch.yml 以
// '@book/my-harness-tools/command-hello' 引用。
export const name = 'command-hello'
export const inject = ['commands']

export function apply(ctx) {
  ctx.commands.register({
    name: 'hello',
    description: 'print a greeting',
    input: { hint: '[name]' },
    handler: (invocation) => {
      const who = invocation.rawInput.trim() || 'world'
      return { kind: 'success', text: `Hello, ${who}!` }
    },
  })
}
