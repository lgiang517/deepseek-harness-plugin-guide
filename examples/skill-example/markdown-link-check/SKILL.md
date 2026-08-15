---
name: markdown-link-check
description: 检查并修复 Markdown 文档中的死链与相对路径错误。
whenToUse: 当用户要求"检查链接""修复死链""check links"或审查 Markdown 文档时使用。
metadata:
  version: 1
  category: docs
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
