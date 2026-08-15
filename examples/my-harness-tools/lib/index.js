// 《DeepSeek Harness 插件开发指南》配套示例：时间工具插件。
// 对应第 5 章（工具开发）与第 12 章（收尾案例）。
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'time-tool'
export const inject = ['tools']
export const Config = z.object({ timezone: z.string().default('Asia/Shanghai') })

export function apply(ctx, config) {
  ctx.tools.register(defineTool({
    name: 'current_time',
    description: 'Return the current time in the configured timezone.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          iso: { type: 'string', required: true },     // UTC 基准
          tz: { type: 'string', required: true },
          local: { type: 'string', required: true },   // 配置时区的本地时间
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Now (${value.tz}): ${value.local} (UTC ${value.iso})`,
      }],
    },
    execute() {
      const now = new Date()
      const local = new Intl.DateTimeFormat('en-CA', {
        timeZone: config.timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(now)
      return { iso: now.toISOString(), tz: config.timezone, local }
    },
  }))
}
