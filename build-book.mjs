// 把《DeepSeek Harness 插件开发指南》构建为打印版 HTML（封面、目录、A4 打印样式），用于导出 PDF。
// 离线运行：micromark + GFM 解析，Shiki（codeToHast）代码高亮，mdast-util-to-hast 转 HTML。
// 网页阅读版见 build-web.mjs；本脚本输出 -print.html。
// 用法：node build-book.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfm } from 'micromark-extension-gfm'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { toHast } from 'mdast-util-to-hast'
import { toHtml } from 'hast-util-to-html'
import { codeToHast } from 'shiki'
import { visit } from 'unist-util-visit'

const ROOT = 'D:\\lgiang程序\\DS对话'
const BOOK_DIR = join(ROOT, 'DeepSeek-Harness插件开发指南')
const THEME = 'github-light'
const TITLE = 'DeepSeek Harness 插件开发指南'

// 章节顺序（README 作为前言，正文 + 附录）
const CHAPTERS = [
  '01-体系总览.md',
  '02-Cordis框架核心.md',
  '03-Profile与Bundle.md',
  '04-服务与依赖注入.md',
  '05-工具开发.md',
  '06-Skill开发.md',
  '07-命令开发.md',
  '08-系统提示词.md',
  '09-AgentPreset.md',
  '10-客户端插件.md',
  '11-安全与沙箱.md',
  '12-调试与发布.md',
  '附录A-Cordis速查.md',
  '附录B-服务目录.md',
]

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function nodeText(node) {
  let out = ''
  visit(node, (n) => {
    if (n.type === 'text' || n.type === 'inlineCode') out += n.value
  })
  return out
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function renderMarkdown(md) {
  const tree = fromMarkdown(md, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })

  // 1) 无意的内联 HTML（如 <name> 占位符）→ 文本，避免被当作标签
  visit(tree, 'html', (node, index, parent) => {
    if (parent && index != null) {
      parent.children[index] = { type: 'text', value: node.value }
    }
  })

  // 2) 收集代码块，用 Shiki 生成 hast 元素（pre）
  const codeNodes = []
  visit(tree, 'code', (node) => codeNodes.push(node))
  const highlighted = await Promise.all(
    codeNodes.map((n) => codeToHast(n.value, { lang: n.lang || 'text', theme: THEME })),
  )
  const codeMap = new Map()
  codeNodes.forEach((n, i) => {
    const root = highlighted[i]
    const pre = root.children[0] // codeToHast 返回 { type:'root', children:[pre] }
    codeMap.set(n, pre || { type: 'element', tagName: 'pre', properties: {}, children: [] })
  })

  // 3) 标题 id + TOC 收集
  const toc = []
  const used = new Map()
  visit(tree, 'heading', (node) => {
    const text = nodeText(node)
    let id = slugify(text) || 'heading'
    const count = used.get(id) || 0
    used.set(id, count + 1)
    if (count > 0) id = `${id}-${count + 1}`
    node.data = node.data || {}
    node.data.hProperties = { id }
    if (node.depth <= 2) toc.push({ depth: node.depth, text, id })
  })

  const handlers = {
    code(state, node) {
      return codeMap.get(node)
    },
  }

  const hast = toHast(tree, { handlers })
  const body = toHtml(hast)
  return { body, toc }
}

function renderToc(toc) {
  const items = toc
    .map((t) => {
      const indent = t.depth === 2 ? ' class="d2"' : ''
      return `<li${indent}><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`
    })
    .join('\n')
  return `<ul>${items}</ul>`
}

const CSS = `
:root { --ink:#1a1d21; --muted:#57606a; --border:#e3e6ea; --accent:#2456d6; --code-bg:#f6f8fa; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin:0; color:var(--ink); font-family:-apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif; line-height:1.75; }
main { max-width:52em; margin:0 auto; padding:0 1.5em 6em; }

h1,h2,h3,h4 { line-height:1.35; }
.chapter > h1 { border-bottom:2px solid var(--border); padding-bottom:.35em; margin-top:0; font-size:1.9em; }
h2 { margin-top:1.6em; }
h3 { margin-top:1.3em; }

a { color:var(--accent); text-decoration:none; }
a:hover { text-decoration:underline; }

code { font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace; }
:not(pre) > code { background:#eff1f3; padding:.15em .4em; border-radius:4px; font-size:.9em; }
pre.shiki { border:1px solid var(--border); border-radius:8px; padding:1em 1.2em; overflow-x:auto; background:var(--code-bg) !important; font-size:.85em; line-height:1.6; margin:1.2em 0; }
pre.shiki code { font-size:inherit; background:transparent; }

table { border-collapse:collapse; width:100%; margin:1.2em 0; font-size:.95em; }
th,td { border:1px solid var(--border); padding:.45em .7em; text-align:left; vertical-align:top; }
th { background:#f6f8fa; font-weight:600; }

blockquote { border-left:3px solid var(--accent); margin:1em 0; padding:.2em 1em; color:var(--muted); background:#f6f8fa; border-radius:0 6px 6px 0; }
hr { border:none; border-top:1px solid var(--border); margin:2em 0; }
ul,ol { padding-left:1.6em; }

/* 封面 */
.cover { min-height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:2em; }
.cover .brand { color:var(--accent); font-weight:700; letter-spacing:.06em; text-transform:uppercase; font-size:.85em; margin-bottom:1.2em; }
.cover h1 { font-size:3em; margin:.2em 0; line-height:1.2; }
.cover .sub { color:var(--muted); max-width:30em; margin:1.2em auto 0; }
.cover .meta { color:var(--muted); font-size:.85em; margin-top:3em; }

/* 目录 */
.toc { padding:2em 1.5em; }
.toc h1 { font-size:1.9em; border-bottom:2px solid var(--border); padding-bottom:.35em; }
.toc ul { list-style:none; padding-left:0; }
.toc li { margin:.18em 0; }
.toc li.d2 { padding-left:1.6em; font-size:.92em; color:var(--muted); }
.toc a { color:inherit; }
.toc a:hover { color:var(--accent); }

/* 打印 */
@page { size:A4; margin:20mm 16mm 18mm;
  @bottom-center { content: counter(page); font-size:9pt; color:#9aa0a6; }
  @top-center { content: "${TITLE}"; font-size:8pt; color:#9aa0a6; } }
@media print {
  .cover { page-break-after:always; }
  .toc { page-break-after:always; }
  .chapter { page-break-before:always; }
  pre.shiki, table, blockquote { page-break-inside:avoid; }
  a { color:inherit; }
}
`

async function main() {
  const prefaceRaw = readFileSync(join(BOOK_DIR, 'README.md'), 'utf8')
  const prefaceMd = prefaceRaw.replace(/## 目录[\s\S]*?(?=## 阅读路径)/, '')
  const preface = await renderMarkdown(prefaceMd)

  const chapters = []
  for (const f of CHAPTERS) {
    const md = readFileSync(join(BOOK_DIR, f), 'utf8')
    chapters.push(await renderMarkdown(md))
  }

  const allToc = [...preface.toc, ...chapters.flatMap((c) => c.toc)]

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITLE}</title>
<style>${CSS}</style>
</head>
<body>
<main>
  <section class="cover">
    <div class="brand">DeepSeek Harness</div>
    <h1>DeepSeek Harness<br>插件开发指南</h1>
    <p class="sub">从 Cordis 插件框架到 Profile、Bundle、工具、Skill、命令、系统提示词、Agent Preset 与客户端插件的完整开发路径，全部案例源自 @deepseek-ai/dsh 真实代码库。</p>
    <p class="meta">版本 0.1.0-rc.6 · @deepseek-ai/cordis 4.0.1</p>
  </section>

  <section class="toc">
    <h1>目录</h1>
    ${renderToc(allToc)}
  </section>

  <section class="chapter" id="preface">
    ${preface.body}
  </section>

  ${chapters.map((c) => `<section class="chapter">${c.body}</section>`).join('\n')}
</main>
</body>
</html>`

  const outHtml = join(ROOT, 'DeepSeek-Harness插件开发指南-print.html')
  writeFileSync(outHtml, html, 'utf8')
  console.log(`HTML written: ${outHtml} (${Buffer.byteLength(html)} bytes)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
