// 生成《DeepSeek Harness 插件开发指南》网页阅读版 HTML（单文件）。
// 三栏分层：左=目录导航(滚动定位) / 中=正文 / 右=本章要点旁注；
// 重点标注：强调高亮、typed callout(说明/注意/提示/来源)、本章小结卡片。
// 用法：node build-web.mjs
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

const CHAPTERS = [
  { file: '01-体系总览.md', id: 'ch-01' },
  { file: '02-Cordis框架核心.md', id: 'ch-02' },
  { file: '03-Profile与Bundle.md', id: 'ch-03' },
  { file: '04-服务与依赖注入.md', id: 'ch-04' },
  { file: '05-工具开发.md', id: 'ch-05' },
  { file: '06-Skill开发.md', id: 'ch-06' },
  { file: '07-命令开发.md', id: 'ch-07' },
  { file: '08-系统提示词.md', id: 'ch-08' },
  { file: '09-AgentPreset.md', id: 'ch-09' },
  { file: '10-客户端插件.md', id: 'ch-10' },
  { file: '11-安全与沙箱.md', id: 'ch-11' },
  { file: '12-调试与发布.md', id: 'ch-12' },
  { file: '附录A-Cordis速查.md', id: 'ch-app-a' },
  { file: '附录B-服务目录.md', id: 'ch-app-b' },
]

function slugify(text) {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
}
function textContent(node) {
  if (!node) return ''
  if (node.type === 'text') return node.value
  if (node.type === 'inlineCode' || node.type === 'code') return node.value
  if (node.type === 'raw') return ''
  let out = ''
  if (Array.isArray(node.children)) for (const c of node.children) out += textContent(c)
  return out
}
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// blockquote → typed callout
const CALLOUT_RULES = [
  [/^(注意|警告|⚠|小心|陷阱|避免|别)/, { type: 'warning', label: '注意', ico: '⚠️' }],
  [/^(提示|技巧|小贴士|建议|实用技巧)/, { type: 'tip', label: '提示', ico: '✨' }],
  [/^(源自|真实|参考|参见|出处)/, { type: 'source', label: '来源', ico: '📎' }],
]
function classifyCallout(text) {
  const t = text.trim()
  for (const [re, meta] of CALLOUT_RULES) if (re.test(t)) return meta
  return { type: 'note', label: '说明', ico: '💡' }
}

// 遍历 hast：把 blockquote 转成 callout 卡片
function transformCallouts(node) {
  if (node.type === 'element' && node.tagName === 'blockquote') {
    const { type, label, ico } = classifyCallout(textContent(node))
    node.tagName = 'div'
    node.properties = node.properties || {}
    node.properties.className = ['callout', 'callout-' + type]
    const labelEl = {
      type: 'element', tagName: 'div', properties: { className: ['callout-label'] },
      children: [{ type: 'element', tagName: 'span', properties: { className: ['callout-ico'] }, children: [{ type: 'text', value: ico }] },
        { type: 'text', value: label }],
    }
    node.children = [labelEl, ...(node.children || [])]
  }
  if (Array.isArray(node.children)) for (const c of node.children) transformCallouts(c)
  return node
}

function isSummaryHeading(node) {
  if (node.type !== 'element' || !/^h[23]$/.test(node.tagName)) return false
  return /本章小结|^小结/.test(textContent(node).trim())
}

// 处理单个章节：callout + 小结卡片；返回 { body, title, sections, summary }
async function renderChapter(md) {
  const tree = fromMarkdown(md, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
  visit(tree, 'html', (node, index, parent) => {
    if (parent && index != null) parent.children[index] = { type: 'text', value: node.value }
  })

  const codeNodes = []
  visit(tree, 'code', (n) => codeNodes.push(n))
  const highlighted = await Promise.all(codeNodes.map((n) => codeToHast(n.value, { lang: n.lang || 'text', theme: THEME })))
  const codeMap = new Map()
  codeNodes.forEach((n, i) => codeMap.set(n, highlighted[i].children[0]))

  // 标题 id（h1/h2/h3 都加锚点）
  const used = new Map()
  visit(tree, 'heading', (node) => {
    const text = textContent(node)
    let id = slugify(text) || 'heading'
    const count = used.get(id) || 0
    used.set(id, count + 1)
    if (count > 0) id = id + '-' + (count + 1)
    node.data = node.data || {}
    node.data.hProperties = { id }
  })

  const hast = toHast(tree, {
    handlers: { code(state, node) { return codeMap.get(node) } },
  })

  // 提取章节标题（第一个 h1）
  let title = ''
  const sections = []
  const summary = []
  for (const child of hast.children) {
    if (child.type === 'element' && child.tagName === 'h1' && !title) title = textContent(child)
    if (child.type === 'element' && child.tagName === 'h2') {
      const t = textContent(child).trim()
      if (t && !/本章小结|^小结/.test(t)) sections.push(t)
    }
  }

  // 把「本章小结」标题 + 紧随的列表/表格 包成 .summary 卡片
  const isBlankText = (n) => n && n.type === 'text' && /^\s*$/.test(n.value)
  const newChildren = []
  for (let i = 0; i < hast.children.length; i++) {
    const c = hast.children[i]
    if (isSummaryHeading(c)) {
      let j = i + 1
      while (j < hast.children.length && isBlankText(hast.children[j])) j++
      const content = hast.children[j]
      if (content && ['ul', 'ol', 'table'].includes(content.tagName)) {
        // 提取要点
        if (content.tagName !== 'table') {
          const lis = content.children.filter((x) => x.type === 'element' && x.tagName === 'li')
          for (const li of lis) summary.push(textContent(li).trim())
        }
        c.properties = c.properties || {}
        c.properties.className = ['summary-title']
        newChildren.push({ type: 'element', tagName: 'div', properties: { className: ['summary'] }, children: [c, content] })
        i = j // 跳过空白文本 + content
        continue
      }
    }
    newChildren.push(c)
  }
  hast.children = newChildren

  transformCallouts(hast)
  const body = toHtml(hast)
  return { body, title, sections, summary }
}

function renderSidebar(meta) {
  const groups = []
  // 前言
  groups.push('<div class="toc-group">前言</div>')
  groups.push('<a class="toc-item toc-ch" href="#ch-preface">前言 · 导读</a>')
  // 正文
  groups.push('<div class="toc-group">正文</div>')
  let group = '正文'
  for (const m of meta) {
    const isApp = m.id.startsWith('ch-app')
    if (isApp && group !== '附录') { groups.push('<div class="toc-group">附录</div>'); group = '附录' }
    groups.push('<a class="toc-item toc-ch" href="#' + m.id + '">' + escapeHtml(m.title) + '</a>')
    for (const s of m.sections) {
      const id = slugify(s) || 'sec'
      groups.push('<a class="toc-item toc-sub" href="#' + id + '">' + escapeHtml(s) + '</a>')
    }
  }
  return groups.join('\n')
}

function renderNotes(meta) {
  const cards = []
  cards.push(noteCard('ch-preface', '前言 · 导读',
    ['为什么读这本书', '三层架构心智地图', '阅读路径', '真实案例来源']))
  for (const m of meta) {
    const points = m.summary.length ? m.summary : m.sections
    cards.push(noteCard(m.id, m.title, points))
  }
  return cards.join('\n')
}
function noteCard(id, title, points) {
  const items = points.map((p) => '<li>' + escapeHtml(p) + '</li>').join('')
  return '<div class="note-card" data-for="' + id + '"><h4>' + escapeHtml(title) + '</h4><ul>' + items + '</ul></div>'
}

const CSS = `
:root {
  --accent:#2563eb; --accent-soft:#eff4ff; --accent-strong:#1d4ed8;
  --ink:#1f2937; --muted:#6b7280; --faint:#9aa3af;
  --border:#e5e7eb; --bg:#ffffff; --bg-soft:#f8fafc;
  --code-bg:#f6f8fa;
  --warn-ink:#92400e; --warn-bg:#fffbeb; --warn-bd:#f59e0b;
  --tip-ink:#065f46; --tip-bg:#ecfdf5; --tip-bd:#10b981;
  --note-ink:#1e40af; --note-bg:#eff6ff; --note-bd:#3b82f6;
  --src-ink:#334155; --src-bg:#f1f5f9; --src-bd:#94a3b8;
  --header-h:60px;
}
* { box-sizing:border-box; }
html { scroll-behavior:smooth; }
body { margin:0; color:var(--ink); background:var(--bg);
  font-family:-apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif;
  font-size:17px; line-height:1.85; -webkit-font-smoothing:antialiased; }
a { color:var(--accent); text-decoration:none; }
a:hover { text-decoration:underline; }
::selection { background:#dbe7ff; }

/* 顶栏 + 进度条 */
.topbar { position:fixed; inset:0 0 auto 0; height:var(--header-h); z-index:50;
  display:flex; align-items:center; gap:12px; padding:0 18px;
  background:rgba(255,255,255,.9); backdrop-filter:saturate(1.4) blur(8px);
  border-bottom:1px solid var(--border); }
.topbar .brand { font-weight:700; color:var(--ink); font-size:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.topbar .brand:hover { text-decoration:none; color:var(--accent); }
.topbar .tag { font-size:11px; color:var(--accent); background:var(--accent-soft); border:1px solid #dbe7ff; border-radius:999px; padding:2px 9px; white-space:nowrap; }
.topbar .spacer { flex:1; }
#navToggle { display:none; border:1px solid var(--border); background:var(--bg); color:var(--ink); border-radius:8px; width:34px; height:34px; font-size:16px; cursor:pointer; }
.progress { position:fixed; top:var(--header-h); left:0; right:0; height:3px; z-index:49; background:transparent; }
.progress-bar { height:100%; width:0; background:linear-gradient(90deg,#3b82f6,#2563eb); transition:width .1s linear; }

/* 三栏布局 */
.layout { display:grid; grid-template-columns:250px minmax(0,1fr) 270px; gap:0; max-width:1360px; margin:0 auto; }
.main-col { padding:calc(var(--header-h) + 28px) 40px 120px; min-width:0; }

/* 左：目录 */
.sidebar { position:sticky; top:calc(var(--header-h) + 3px); height:calc(100vh - var(--header-h) - 3px);
  padding:22px 14px 40px 26px; overflow-y:auto; border-right:1px solid var(--border); }
.toc-group { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--faint); font-weight:700; margin:18px 0 6px; }
.toc-group:first-child { margin-top:0; }
.toc-item { display:block; padding:4px 10px; border-radius:7px; color:var(--muted); font-size:13.5px; line-height:1.5; }
.toc-item:hover { background:var(--bg-soft); color:var(--ink); text-decoration:none; }
.toc-item.toc-ch { font-weight:600; color:var(--ink); }
.toc-item.toc-sub { padding-left:24px; font-size:12.5px; }
.toc-item.active { background:var(--accent-soft); color:var(--accent-strong); font-weight:600; }

/* 右：要点旁注 */
.notes { position:sticky; top:calc(var(--header-h) + 3px); height:calc(100vh - var(--header-h) - 3px);
  padding:22px 26px 40px 14px; overflow-y:auto; }
.notes-title { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--faint); font-weight:700; margin:0 0 10px; }
.note-card { display:none; border:1px solid var(--border); border-left:3px solid var(--accent); border-radius:10px;
  background:var(--bg-soft); padding:14px 16px; margin-bottom:14px; }
.note-card.active { display:block; }
.note-card h4 { margin:0 0 8px; font-size:14px; color:var(--accent-strong); }
.note-card ul { margin:0; padding-left:18px; }
.note-card li { font-size:13px; color:var(--muted); line-height:1.65; margin:4px 0; }
.note-card li::marker { color:var(--accent); }

/* 正文排版 */
.chapter { padding-top:8px; }
.chapter > h1 { font-size:1.95em; line-height:1.3; margin:0 0 .6em; padding:0 0 .5em; border-bottom:2px solid var(--border); position:relative; scroll-margin-top:calc(var(--header-h) + 16px); }
.chapter > h1::before { content:""; position:absolute; left:0; bottom:-2px; width:72px; height:2px; background:var(--accent); }
h1,h2,h3,h4 { scroll-margin-top:calc(var(--header-h) + 16px); line-height:1.4; }
h2 { font-size:1.45em; margin:2em 0 .6em; padding-left:12px; border-left:4px solid var(--accent); }
h3 { font-size:1.18em; margin:1.6em 0 .5em; }
h4 { font-size:1.02em; margin:1.2em 0 .4em; }

/* 重点标注：强调 */
main strong, .chapter strong { color:var(--accent-strong); font-weight:700; }
main em { color:#0f766e; font-style:normal; }

/* 内联代码 */
code { font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace; }
:not(pre) > code { background:#eef2f6; color:#b91c1c; padding:.12em .42em; border-radius:5px; font-size:.88em; }

/* 代码块 */
pre.shiki { border:1px solid var(--border); border-radius:10px; padding:14px 16px; overflow-x:auto;
  background:var(--code-bg) !important; font-size:13.5px; line-height:1.7; margin:1.2em 0; }
pre.shiki code { font-size:inherit; background:transparent; }

/* 表格 */
table { border-collapse:collapse; width:100%; margin:1.3em 0; font-size:.93em; }
th,td { border:1px solid var(--border); padding:.5em .7em; text-align:left; vertical-align:top; }
th { background:var(--bg-soft); font-weight:700; color:var(--ink); }
tbody tr:nth-child(even) { background:#fafbfc; }
tbody tr:hover { background:var(--accent-soft); }

/* callout 卡片 */
.callout { border:1px solid var(--border); border-left:4px solid; border-radius:10px; padding:12px 16px; margin:1.2em 0; }
.callout .callout-label { display:flex; align-items:center; gap:6px; font-weight:700; font-size:.85em; margin-bottom:4px; }
.callout .callout-label .callout-ico { font-size:1em; }
.callout p { margin:.3em 0; }
.callout-note { border-left-color:var(--note-bd); background:var(--note-bg); }
.callout-note .callout-label { color:var(--note-ink); }
.callout-warning { border-left-color:var(--warn-bd); background:var(--warn-bg); }
.callout-warning .callout-label { color:var(--warn-ink); }
.callout-tip { border-left-color:var(--tip-bd); background:var(--tip-bg); }
.callout-tip .callout-label { color:var(--tip-ink); }
.callout-source { border-left-color:var(--src-bd); background:var(--src-bg); }
.callout-source .callout-label { color:var(--src-ink); }

/* 本章小结卡片 */
.summary { border:1px solid #c7dbff; background:linear-gradient(180deg,#f4f8ff,#eef4ff); border-radius:12px; padding:16px 20px; margin:2em 0; }
.summary .summary-title { margin:0 0 10px; font-size:1.1em; color:var(--accent-strong); border:none; padding:0; }
.summary .summary-title::before { display:none; }
.summary ul, .summary ol { margin:.3em 0; padding-left:22px; }
.summary li { margin:.35em 0; }
.summary table { background:#fff; }

ul,ol { padding-left:1.6em; }
hr { border:none; border-top:1px solid var(--border); margin:2em 0; }

/* 回到顶部 */
#toTop { position:fixed; right:22px; bottom:26px; width:42px; height:42px; border-radius:50%;
  border:1px solid var(--border); background:var(--bg); color:var(--muted); font-size:18px; cursor:pointer;
  opacity:0; pointer-events:none; transition:.2s; box-shadow:0 4px 14px rgba(0,0,0,.08); z-index:40; }
#toTop.show { opacity:1; pointer-events:auto; }
#toTop:hover { color:var(--accent); border-color:var(--accent); }

/* 响应式 */
@media (max-width:1180px) { .layout { grid-template-columns:230px minmax(0,1fr); } .notes { display:none; } }
@media (max-width:860px) {
  .layout { grid-template-columns:1fr; }
  .main-col { padding:calc(var(--header-h) + 20px) 20px 90px; }
  #navToggle { display:block; }
  .sidebar { position:fixed; top:var(--header-h); left:0; bottom:0; width:min(82vw,300px);
    background:var(--bg); border-right:1px solid var(--border); transform:translateX(-102%); transition:.25s; z-index:45; padding-top:16px; }
  .sidebar.open { transform:none; box-shadow:0 10px 40px rgba(0,0,0,.18); }
  #scrim { display:none; position:fixed; inset:var(--header-h) 0 0 0; background:rgba(15,23,42,.3); z-index:44; }
  #scrim.show { display:block; }
}
`

const JS = `
(function () {
  var chapters = document.querySelectorAll('section.chapter');
  var tocItems = document.querySelectorAll('.toc-item');
  var noteCards = document.querySelectorAll('.note-card');
  var progressBar = document.getElementById('progressBar');
  var toTop = document.getElementById('toTop');
  var sidebar = document.getElementById('sidebar');
  var scrim = document.getElementById('scrim');
  var navToggle = document.getElementById('navToggle');

  function activate(id) {
    tocItems.forEach(function (a) { a.classList.remove('active'); });
    tocItems.forEach(function (a) { if (a.getAttribute('href') === '#' + id) a.classList.add('active'); });
    noteCards.forEach(function (c) { c.classList.toggle('active', c.getAttribute('data-for') === id); });
  }
  function onScroll() {
    var h = document.documentElement;
    var p = h.scrollTop / (h.scrollHeight - h.clientHeight);
    progressBar.style.width = (p * 100).toFixed(2) + '%';
    toTop.classList.toggle('show', h.scrollTop > 600);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  navToggle.addEventListener('click', function () {
    sidebar.classList.toggle('open');
    scrim.classList.toggle('show');
  });
  scrim.addEventListener('click', function () {
    sidebar.classList.remove('open');
    scrim.classList.remove('show');
  });
  tocItems.forEach(function (a) {
    a.addEventListener('click', function () {
      sidebar.classList.remove('open');
      scrim.classList.remove('show');
    });
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) activate(e.target.id); });
    }, { rootMargin: '-15% 0px -75% 0px' });
    chapters.forEach(function (c) { io.observe(c); });
  }
})();
`

async function main() {
  const prefaceRaw = readFileSync(join(BOOK_DIR, 'README.md'), 'utf8')
  const prefaceMd = prefaceRaw.replace(/## 目录[\s\S]*?(?=## 阅读路径)/, '')
  const preface = await renderChapter(prefaceMd)

  const meta = []
  const bodies = []
  for (const ch of CHAPTERS) {
    const md = readFileSync(join(BOOK_DIR, ch.file), 'utf8')
    const r = await renderChapter(md)
    meta.push({ id: ch.id, title: r.title, sections: r.sections, summary: r.summary })
    bodies.push('<section class="chapter" id="' + ch.id + '">' + r.body + '</section>')
  }

  const html = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<title>' + TITLE + '</title>\n<style>' + CSS + '</style>\n</head>\n<body>\n'
    + '<header class="topbar">'
    + '<button id="navToggle" aria-label="目录">☰</button>'
    + '<a class="brand" href="#top">' + TITLE + '</a>'
    + '<span class="tag">网页阅读版</span>'
    + '<span class="spacer"></span>'
    + '<span class="tag">0.1.0-rc.6</span>'
    + '</header>\n'
    + '<div class="progress"><div class="progress-bar" id="progressBar"></div></div>\n'
    + '<div class="layout">\n'
    + '<aside class="sidebar" id="sidebar"><nav>' + renderSidebar(meta) + '</nav></aside>\n'
    + '<div id="scrim"></div>\n'
    + '<main class="main-col" id="top">\n'
    + '<section class="chapter" id="ch-preface">' + preface.body + '</section>\n'
    + bodies.join('\n') + '\n'
    + '</main>\n'
    + '<aside class="notes" id="notes"><div class="notes-title">本章要点</div>' + renderNotes(meta) + '</aside>\n'
    + '</div>\n'
    + '<button id="toTop" aria-label="回到顶部">↑</button>\n'
    + '<script>' + JS + '</script>\n'
    + '</body>\n</html>\n'

  const out = join(ROOT, 'DeepSeek-Harness插件开发指南.html')
  writeFileSync(out, html, 'utf8')
  console.log('WEB HTML written: ' + out + ' (' + Buffer.byteLength(html) + ' bytes)')
}

main().catch((e) => { console.error(e); process.exit(1) })
