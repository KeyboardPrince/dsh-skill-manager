// dsh-skill-manager — Host half (cordis 插件入口)
//
// 本文件是合法的 cordis bundle 插件入口：dsh 把它装进 profile 的 bundles
// 数组后会以 apply(ctx) 形式加载。使用运行时提供的 webServer 服务
// 注册标准 Node HTTP 路由，实现技能的 CRUD 操作。
//
// 数据存储（与 DSH 真实 skill 目录结构对齐）：
//   - 全局技能：~/.dsh/skills/<skill-name>/SKILL.md
//   - 项目技能：<workspace.path>/.dsh/skills/<skill-name>/SKILL.md
//
// 技能元数据：每个 skill 是一个目录，核心元数据在 SKILL.md 的 YAML frontmatter：
//   ---
//   name: <skill-name>
//   description: <描述>
//   ---
//
// 额外字段（本插件扩展，可选）：
//   icon: <emoji>
//   tags: [<tag1>, <tag2>]

import { readFile, writeFile, mkdir, rm, readdir, stat, rename } from 'node:fs/promises'
import { dirname, join, resolve, isAbsolute, basename } from 'node:path'
import { homedir } from 'node:os'

const GLOBAL_SKILLS_DIR = join(homedir(), '.dsh', 'skills')
const WORKSPACE_CONFIG = join(homedir(), '.dsh', 'storages', 'workspace.json')

// 信任栅栏：仅允许本机回环请求
function isLoopback(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
}
function fence(req) {
  const host = (req.headers.host || '').split(':')[0]
  return isLoopback(host)
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

// ===== YAML frontmatter 解析（轻量，兼容 DSH 格式） =====
// 解析形如：
//   ---
//   name: xxx
//   description: yyy
//   ---
//   <正文 markdown>
function parseFrontmatter(raw) {
  // 统一换行符（Windows CRLF → LF），否则 $ 锚点无法匹配行尾
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const m = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!m) return { data: {}, content: raw }
  const fmText = m[1]
  const content = m[2] || ''
  const data = {}
  // 逐行解析 key: value（兼容简单标量，不处理嵌套/多行）
  const lines = fmText.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const mm = line.match(/^([A-Za-z0-9_.\-]+)\s*:\s*(.*)$/)
    if (mm) {
      const key = mm[1]
      let val = mm[2].trim()
      // 处理行内数组 [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        const inner = val.slice(1, -1).trim()
        data[key] = inner.length
          ? inner.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
          : []
      } else {
        // 去除包围引号
        data[key] = val.replace(/^['"]|['"]$/g, '')
      }
    }
    i++
  }
  return { data, content }
}

// 序列化 frontmatter + 正文
function serializeFrontmatter(data, content) {
  const lines = ['---']
  for (const key of Object.keys(data)) {
    const val = data[key]
    if (Array.isArray(val)) {
      lines.push(`${key}: [${val.map((v) => (v.includes(',') || v.includes(' ') ? `"${v}"` : v)).join(', ')}]`)
    } else {
      const needsQuote = /[:#\[\]{}&*!|>'"%@`,]/.test(val) || val === ''
      lines.push(`${key}: ${needsQuote ? `"${val.replace(/"/g, '\\"')}"` : val}`)
    }
  }
  lines.push('---')
  lines.push('')
  lines.push(content || '')
  return lines.join('\n')
}

// 安全路径校验（防止目录穿越）
function safePath(ws) {
  if (typeof ws !== 'string' || ws.length === 0) return null
  let abs
  try {
    abs = resolve(ws)
  } catch {
    return null
  }
  if (!isAbsolute(abs)) return null
  return abs
}

// 读取某个 skills 目录下所有 skill 的元数据
async function readSkillsFromDir(skillsDir) {
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true })
    const dirs = entries.filter((e) => e.isDirectory())
    const result = []
    for (const d of dirs) {
      const skillName = d.name
      const disabled = skillName.endsWith('.disabled')
      const baseName = disabled ? skillName.slice(0, -'.disabled'.length) : skillName
      const skillMdPath = join(skillsDir, skillName, 'SKILL.md')
      try {
        const raw = await readFile(skillMdPath, 'utf8')
        const { data, content } = parseFrontmatter(raw)
        result.push({
          id: skillName, // 用目录名作为稳定 id（含 .disabled 后缀）
          name: data.name || baseName,
          description: data.description || '',
          icon: data.icon || '📦',
          tags: Array.isArray(data.tags) ? data.tags : [],
          dirName: skillName,
          disabled,
          hasBody: content.trim().length > 0
        })
      } catch {
        // 没有 SKILL.md 的目录，仅以目录名呈现
        result.push({
          id: skillName,
          name: baseName,
          description: '(无 SKILL.md)',
          icon: '📦',
          tags: [],
          dirName: skillName,
          disabled,
          hasBody: false
        })
      }
    }
    return result
  } catch {
    return []
  }
}

// 读取 SKILL.md 完整内容（frontmatter + 正文），用于编辑回写
async function readSkillMd(skillDir) {
  try {
    return await readFile(join(skillDir, 'SKILL.md'), 'utf8')
  } catch {
    return null
  }
}

export const name = 'dsh-skill-manager'
export const inject = ['webServer']

export function apply(ctx) {
  const handler = async (req, res) => {
    if (!fence(req)) {
      sendJson(res, 403, { success: false, error: 'forbidden' })
      return
    }
    const url = new URL(req.url ?? '/', 'http://dsh.internal')
    const path = url.pathname

    // GET /skill/api/workspaces → 返回 DSH 已配置的全部工作区 [{id,path,title}]
    if (req.method === 'GET' && path === '/skill/api/workspaces') {
      try {
        let raw = {}
        try { raw = JSON.parse(await readFile(WORKSPACE_CONFIG, 'utf8')) } catch {}
        const tbl = (raw && raw.tables && raw.tables.workspaces) ? raw.tables.workspaces : {}
        const workspaces = Object.keys(tbl).map((id) => ({
          id,
          path: tbl[id].path || '',
          title: tbl[id].title || (tbl[id].path ? basename(tbl[id].path) : id)
        })).filter((w) => w.path)
        sendJson(res, 200, { success: true, workspaces })
      } catch (error) {
        sendJson(res, 500, { success: false, error: error.message })
      }
      return
    }

    // 解析 scope + ws → 得到 skills 目录绝对路径
    function resolveSkillsDir() {
      const scope = url.searchParams.get('scope') || 'global'
      const ws = url.searchParams.get('ws') || ''
      if (scope === 'project') {
        const abs = safePath(ws)
        if (!abs) return null
        return join(abs, '.dsh', 'skills')
      }
      return GLOBAL_SKILLS_DIR
    }

    // GET /skill/api/list?scope=global|project&ws=<path>
    if (req.method === 'GET' && path === '/skill/api/list') {
      try {
        const skillsDir = resolveSkillsDir()
        if (!skillsDir) { sendJson(res, 400, { success: false, error: 'invalid workspace path' }); return }
        const skills = await readSkillsFromDir(skillsDir)
        sendJson(res, 200, { success: true, skills })
      } catch (error) {
        sendJson(res, 500, { success: false, error: error.message })
      }
      return
    }

    async function readBody() {
      let raw = ''
      for await (const chunk of req) raw += chunk
      try { return JSON.parse(raw) } catch { return null }
    }

    // POST /skill/api/add
    // body: { scope, ws?, name, description, icon?, tags? }
    if (req.method === 'POST' && path === '/skill/api/add') {
      const body = await readBody()
      if (!body || !body.name || !body.description) {
        sendJson(res, 400, { success: false, error: 'name and description are required' })
        return
      }
      // skill 目录名：取 name 的小写连字符形式，去除非法字符
      const dirName = String(body.name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '') || ('skill-' + Date.now())
      try {
        const skillsDir = (body.scope === 'project')
          ? (() => { const a = safePath(body.ws || ''); return a ? join(a, '.dsh', 'skills') : null })()
          : GLOBAL_SKILLS_DIR
        if (!skillsDir) { sendJson(res, 400, { success: false, error: 'invalid workspace path' }); return }

        const skillDir = join(skillsDir, dirName)
        // 防冲突
        let finalDir = skillDir
        let n = 1
        while (true) {
          try { await stat(finalDir); finalDir = skillDir + '-' + n; n++ } catch { break }
        }

        await mkdir(finalDir, { recursive: true })
        const fmData = {
          name: String(body.name).trim(),
          description: String(body.description).trim()
        }
        if (body.icon) fmData.icon = body.icon
        if (Array.isArray(body.tags) && body.tags.length) fmData.tags = body.tags
        const md = serializeFrontmatter(fmData, `# ${body.name}\n\n${body.description}\n`)
        await writeFile(join(finalDir, 'SKILL.md'), md, 'utf8')
        const skill = {
          id: basename(finalDir),
          name: fmData.name,
          description: fmData.description,
          icon: fmData.icon || '📦',
          tags: fmData.tags || [],
          dirName: basename(finalDir),
          hasBody: true
        }
        sendJson(res, 200, { success: true, skill })
      } catch (error) {
        sendJson(res, 500, { success: false, error: error.message })
      }
      return
    }

    // POST /skill/api/update
    // body: { scope, ws?, id(dirName), name?, description?, icon?, tags?, content? }
    //   若传 content 则直接写回完整 SKILL.md 原文；否则只更新 frontmatter 字段
    if (req.method === 'POST' && path === '/skill/api/update') {
      const body = await readBody()
      if (!body || !body.id) {
        sendJson(res, 400, { success: false, error: 'id is required' })
        return
      }
      try {
        const skillsDir = (body.scope === 'project')
          ? (() => { const a = safePath(body.ws || ''); return a ? join(a, '.dsh', 'skills') : null })()
          : GLOBAL_SKILLS_DIR
        if (!skillsDir) { sendJson(res, 400, { success: false, error: 'invalid workspace path' }); return }

        const skillDir = join(skillsDir, body.id)
        const md = await readSkillMd(skillDir)
        if (md === null) { sendJson(res, 404, { success: false, error: 'skill not found' }); return }

        // 如果传了完整 content，直接写回
        if (body.content !== undefined && typeof body.content === 'string') {
          await writeFile(join(skillDir, 'SKILL.md'), body.content, 'utf8')
          const { data } = parseFrontmatter(body.content)
          sendJson(res, 200, {
            success: true,
            skill: {
              id: body.id,
              name: data.name || body.id,
              description: data.description || '',
              icon: data.icon || '\uD83D\uDCE6',
              tags: Array.isArray(data.tags) ? data.tags : [],
              dirName: body.id,
              hasBody: true
            }
          })
          return
        }

        // 否则只更新 frontmatter 字段（原有逻辑）
        const { data, content } = parseFrontmatter(md)
        if (body.name !== undefined) data.name = String(body.name).trim()
        if (body.description !== undefined) data.description = String(body.description).trim()
        if (body.icon !== undefined) data.icon = body.icon
        if (body.tags !== undefined) data.tags = Array.isArray(body.tags) ? body.tags : []
        const newMd = serializeFrontmatter(data, content)
        await writeFile(join(skillDir, 'SKILL.md'), newMd, 'utf8')
        const skill = {
          id: body.id,
          name: data.name || body.id,
          description: data.description || '',
          icon: data.icon || '📦',
          tags: Array.isArray(data.tags) ? data.tags : [],
          dirName: body.id,
          hasBody: (content || '').trim().length > 0
        }
        sendJson(res, 200, { success: true, skill })
      } catch (error) {
        sendJson(res, 500, { success: false, error: error.message })
      }
      return
    }

    // POST /skill/api/toggle
    // body: { scope, ws?, id(dirName) } — 切换启用/禁用（目录加/去 .disabled 后缀）
    if (req.method === 'POST' && path === '/skill/api/toggle') {
      const body = await readBody()
      if (!body || !body.id) {
        sendJson(res, 400, { success: false, error: 'id is required' })
        return
      }
      try {
        const skillsDir = (body.scope === 'project')
          ? (() => { const a = safePath(body.ws || ''); return a ? join(a, '.dsh', 'skills') : null })()
          : GLOBAL_SKILLS_DIR
        if (!skillsDir) { sendJson(res, 400, { success: false, error: 'invalid workspace path' }); return }

        const rawId = String(body.id)
        const isDisabled = rawId.endsWith('.disabled')
        const baseName = isDisabled ? rawId.slice(0, -'.disabled'.length) : rawId
        const fromDir = join(skillsDir, rawId)
        const toDir = join(skillsDir, isDisabled ? baseName : rawId + '.disabled')

        // 验证源目录存在
        try { await stat(fromDir) } catch {
          sendJson(res, 404, { success: false, error: 'skill not found: ' + rawId + ' (looked in: ' + fromDir + ', skillsDir: ' + skillsDir + ')' })
          return
        }

        // 若目标已存在，先删除（Windows rename 不允许覆盖已有目录）
        try { await stat(toDir); await rm(toDir, { recursive: true, force: true }) } catch { /* 不存在则忽略 */ }

        await rename(fromDir, toDir)
        const newId = isDisabled ? baseName : rawId + '.disabled'
        // 读取更新后的元数据
        const mdRaw = await readFile(join(toDir, 'SKILL.md'), 'utf8').catch(() => '')
        const { data } = parseFrontmatter(mdRaw)
        sendJson(res, 200, {
          success: true,
          skill: {
            id: newId,
            name: data.name || newId,
            description: data.description || '',
            dirName: newId,
            disabled: !isDisabled,
            hasBody: true
          }
        })
      } catch (error) {
        sendJson(res, 500, { success: false, error: 'toggle failed: ' + error.message })
      }
      return
    }

    // POST /skill/api/delete
    // body: { scope, ws?, id(dirName) }
    if (req.method === 'POST' && path === '/skill/api/delete') {
      const body = await readBody()
      if (!body || !body.id) {
        sendJson(res, 400, { success: false, error: 'id is required' })
        return
      }
      try {
        const skillsDir = (body.scope === 'project')
          ? (() => { const a = safePath(body.ws || ''); return a ? join(a, '.dsh', 'skills') : null })()
          : GLOBAL_SKILLS_DIR
        if (!skillsDir) { sendJson(res, 400, { success: false, error: 'invalid workspace path' }); return }

        const skillDir = join(skillsDir, body.id)
        try { await stat(skillDir) } catch { sendJson(res, 404, { success: false, error: 'skill not found: ' + body.id }); return }
        await rm(skillDir, { recursive: true, force: true })
        sendJson(res, 200, { success: true })
      } catch (error) {
        sendJson(res, 500, { success: false, error: error.message })
      }
      return
    }

    // POST /skill/api/import
    // 从源目录导入技能到目标 skills 目录
    // body (JSON): { scope, ws?, sourcePath } — 源目录的绝对路径
    //   或 multipart: sourcePath 字段 + 可选的 files（备用）
    if (req.method === 'POST' && path === '/skill/api/import') {
      const ct = (req.headers['content-type'] || '')
      try {
        let sourcePath = ''
        let targetScope = 'global'
        let targetWs = ''

        if (ct.includes('multipart/form-data')) {
          // 解析 multipart：提取 sourcePath 字段
          const boundary = ct.match(/boundary=(?:"([^"]+)"|([^;\s]+))/)
          if (!boundary) { sendJson(res, 400, { success: false, error: 'missing boundary' }); return }
          const buf = []
          for await (const chunk of req) buf.push(chunk)
          const body = Buffer.concat(buf).toString('binary')
          const parts = body.split('--' + (boundary[1] || boundary[2]))
          for (const part of parts) {
            if (!part || part.trim() === '--') continue
            const headEnd = part.indexOf('\r\n\r\n')
            if (headEnd < 0) continue
            const header = part.slice(0, headEnd)
            const partBody = part.slice(headEnd + 4)
            const nameMatch = header.match(/name="([^"]+)"/)
            if (!nameMatch) continue
            if (nameMatch[1] === 'scope') targetScope = partBody.toString().trim()
            else if (nameMatch[1] === 'ws') targetWs = partBody.toString().trim()
            else if (nameMatch[1] === 'sourcePath') sourcePath = partBody.toString().trim()
          }
        } else {
          // JSON body
          let raw = ''
          for await (const chunk of req) raw += chunk
          const body = JSON.parse(raw)
          sourcePath = (body && body.sourcePath) || ''
          targetScope = (body && body.scope) || 'global'
          targetWs = (body && body.ws) || ''

          // 如果直接传了文件列表（File System Access API 模式），完整写入整个目录树
          if (body && Array.isArray(body.files) && body.files.length > 0) {
            if (!sourcePath) { sendJson(res, 400, { success: false, error: 'sourcePath (dir name) is required' }); return }

            const skillsDir = (targetScope === 'project')
              ? (() => { const a = safePath(targetWs); return a ? join(a, '.dsh', 'skills') : null })()
              : GLOBAL_SKILLS_DIR
            if (!skillsDir) { sendJson(res, 400, { success: false, error: 'invalid workspace path' }); return }

            // 清理目录名（去非法字符）
            const dirName = String(sourcePath).trim().replace(/[^a-zA-Z0-9_\-]/g, '') || ('skill-' + Date.now())
            const destDir = join(skillsDir, dirName)

            // 防冲突
            let finalDest = destDir
            let n = 1
            while (true) {
              try { await stat(finalDest); finalDest = destDir + '-' + n; n++ } catch { break }
            }

            await mkdir(finalDest, { recursive: true })
            // 完整写入所有文件（含子目录）
            for (const f of body.files) {
              const safeRel = String(f.path || '').replace(/\\/g, '/')
              if (safeRel.includes('..')) continue  // 防止路径穿越
              const target = join(finalDest, safeRel)
              const parent = dirname(target)
              await mkdir(parent, { recursive: true })
              await writeFile(target, String(f.content || ''), 'utf8')
            }

            const skillMd = body.files.find((f) => f.path === 'SKILL.md')
            const { data } = parseFrontmatter(skillMd ? skillMd.content : '')
            sendJson(res, 200, {
              success: true,
              skill: {
                id: basename(finalDest),
                name: data.name || basename(finalDest),
                description: data.description || '',
                icon: data.icon || '📦',
                tags: Array.isArray(data.tags) ? data.tags : [],
                dirName: basename(finalDest),
                hasBody: true,
                fileCount: body.files.length
              }
            })
            return
          }
        }

        if (!sourcePath) { sendJson(res, 400, { success: false, error: 'sourcePath is required' }); return }

        // 解析源路径：如果是纯文件夹名（非绝对路径），在已知目录中搜索
        let srcAbs = safePath(sourcePath)
        if (!srcAbs) {
          // 纯文件夹名：按优先级搜索已知 skill 源目录
          const searchPaths = [
            join(homedir(), '.dsh', 'skills'),           // DSH 全局 skills
            join(homedir(), '.skills-manager', 'skills'), // skills-manager 目录
          ]
          let found = false
          for (const base of searchPaths) {
            const candidate = join(base, sourcePath)
            try {
              await stat(join(candidate, 'SKILL.md'))
              srcAbs = candidate
              found = true
              break
            } catch { /* continue */ }
          }
          if (!found) {
            sendJson(res, 404, { success: false, error: '未找到名为 "' + sourcePath + '" 的技能文件夹（需包含 SKILL.md）' })
            return
          }
        }
        // 验证源目录存在且含 SKILL.md
        try { await stat(join(srcAbs, 'SKILL.md')) } catch {
          sendJson(res, 400, { success: false, error: 'source directory must contain SKILL.md' })
          return
        }

        // 确定目标目录
        const skillsDir = (targetScope === 'project')
          ? (() => { const a = safePath(targetWs); return a ? join(a, '.dsh', 'skills') : null })()
          : GLOBAL_SKILLS_DIR
        if (!skillsDir) { sendJson(res, 400, { success: false, error: 'invalid workspace path' }); return }

        const dirName = basename(srcAbs)
        const destDir = join(skillsDir, dirName)

        // 防冲突
        let finalDest = destDir
        let n = 1
        while (true) {
          try { await stat(finalDest); finalDest = destDir + '-' + n; n++ } catch { break }
        }

        // 复制整个目录（递归）
        await copyDir(srcAbs, finalDest)

        // 读取元数据返回
        const mdRaw = await readFile(join(finalDest, 'SKILL.md'), 'utf8')
        const { data } = parseFrontmatter(mdRaw)
        sendJson(res, 200, {
          success: true,
          skill: {
            id: basename(finalDest),
            name: data.name || basename(finalDest),
            description: data.description || '',
            icon: data.icon || '📦',
            tags: Array.isArray(data.tags) ? data.tags : [],
            dirName: basename(finalDest),
            hasBody: true
          }
        })
      } catch (error) {
        sendJson(res, 500, { success: false, error: error.message })
      }
      return
    }

    // GET /skill/api/detail?scope=global|project&ws=<path>&id=<dirName>
    // 返回技能的完整 SKILL.md 内容
    if (req.method === 'GET' && path === '/skill/api/detail') {
      const scope = url.searchParams.get('scope') || 'global'
      const ws = url.searchParams.get('ws') || ''
      const id = url.searchParams.get('id')
      if (!id) { sendJson(res, 400, { success: false, error: 'id is required' }); return }
      try {
        const skillsDir = (scope === 'project')
          ? (() => { const a = safePath(ws); return a ? join(a, '.dsh', 'skills') : null })()
          : GLOBAL_SKILLS_DIR
        if (!skillsDir) { sendJson(res, 400, { success: false, error: 'invalid workspace path' }); return }

        const skillDir = join(skillsDir, id)
        const mdRaw = await readFile(join(skillDir, 'SKILL.md'), 'utf8')
        const { data, content } = parseFrontmatter(mdRaw)
        sendJson(res, 200, {
          success: true,
          detail: {
            id,
            name: data.name || id,
            description: data.description || '',
            content: mdRaw, // 完整原始内容（frontmatter + 正文）
            bodyOnly: content
          }
        })
      } catch (error) {
        sendJson(res, 500, { success: false, error: error.message })
      }
      return
    }

    sendJson(res, 404, { success: false, error: 'not found' })
  }

  // ===== 递归复制目录 =====
  async function copyDir(src, dest) {
    await mkdir(dest, { recursive: true })
    const entries = await readdir(src, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = join(src, entry.name)
      const destPath = join(dest, entry.name)
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath)
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        await writeFile(destPath, await readFile(srcPath))
      }
    }
  }

  ctx.webServer.register({ kind: 'prefix', path: '/skill/api', handler })
}
