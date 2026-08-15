# DeepSeek Harness 插件开发指南

一本面向工程师的实战手册：从 Cordis 插件框架到 Profile、Bundle、工具、Skill、命令、系统提示词、Agent Preset 与客户端插件的完整开发路径，**全部案例源自 `@deepseek-ai/dsh` 真实代码库**（`0.1.0-rc.6`，核心框架 `@deepseek-ai/cordis@4.0.1`）。

## 📖 在线阅读

- 🌐 **网页版**：<https://lgiang517.github.io/deepseek-harness-plugin-guide/>
- 📄 **PDF 下载**：<https://lgiang517.github.io/deepseek-harness-plugin-guide/DeepSeek-Harness插件开发指南.pdf>（99 页 A4）

## 📚 目录

| 章节 | 主题 |
|---|---|
| 第 1 章 | 体系总览：Harness 分层架构、插件种类、数据流 |
| 第 2 章 | Cordis 框架核心：Context / Service / inject / effect / 生命周期 |
| 第 3 章 | Profile、Bundle 与 patch 层 |
| 第 4 章 | 服务与依赖注入 |
| 第 5 章 | 工具开发（`defineTool` / ToolRuntime / 执行流水线） |
| 第 6 章 | Skill 开发 |
| 第 7 章 | 命令开发 |
| 第 8 章 | 系统提示词 |
| 第 9 章 | Agent Preset 与作用域组合 |
| 第 10 章 | 客户端插件 |
| 第 11 章 | 安全、沙箱与审批 |
| 第 12 章 | 调试、热更新与发布 |
| 附录 A / B | Cordis API 速查 / DSH 服务目录 |

## 🗂 仓库结构

```
.
├── index.html                         # 网页阅读版（单文件，三栏分层 + 代码高亮）
├── DeepSeek-Harness插件开发指南.pdf    # 打印版（99 页 A4）
├── book/                              # 分章 Markdown 源码（15 篇）
├── examples/                          # 可运行示例：bundle + 工具 + 命令 + skill
├── build-web.mjs                      # 生成网页版 HTML
├── build-book.mjs                     # 生成打印版 HTML（用于导出 PDF）
└── verify-examples.mjs                # 示例插件冒烟验证
```

## 🧪 关于示例

`examples/my-harness-tools/` 是一个最小 bundle，含「时间工具」与「hello 命令」两个插件，可直接通过 `dsh plugin` 安装验证：

```sh
dsh plugin --profile demo add ./examples/my-harness-tools
dsh --profile demo --dump-config
```

## ⚠️ 说明

- 本书由 DeepSeek Harness 代码库逆向梳理而成，面向教学；API 以你实际安装版本为准（`dsh --version`）。
- 示例代码严格遵循 `@deepseek-ai/dsh` 的真实约定，来源包括 `dsh-tool-todo`、`dsh-command-goal`、`dsh-skill-filesystem`、`dsh-base/cordis.patch.yml`、`config/agent-presets/standard` 等。
- 本地构建脚本使用绝对路径，如需复现请按本机路径调整。

## 📄 许可

[MIT](LICENSE)
