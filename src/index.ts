/**
 * Host backend for DSH Skill Manager:
 * Discovers and manages global and project skills across project workspaces.
 * Distinguishes Global skills (on top) and individual Project folders (below).
 * Supports toggle enable/disable, project-specific batch toggle, and skill deletion.
 */

import { existsSync, readFileSync, readdirSync, rmSync, renameSync, statSync } from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { parse as parseYaml } from 'yaml'

export interface Context {
  webServer: {
    register: (opts: {
      kind: 'prefix' | 'exact'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
    }) => () => void
  }
  webRuntime?: {
    trustedHosts?: string[]
  }
  workspaces?: {
    get: (id: string) => any
    list?: () => any[]
  }
  skills?: any
  effect: (fn: () => void | (() => void), name?: string) => void
  logger?: {
    info: (...args: any[]) => void
    warn: (...args: any[]) => void
    error: (...args: any[]) => void
  }
}

export interface SkillItem {
  id: string
  name: string
  description: string
  scope: 'global' | 'project'
  kind: 'directory' | 'file'
  path: string
  skillDir: string
  disabled: boolean
  sourceRoot: string
  sourceLabel: string
  projectDir?: string
  projectName?: string
}

export interface ProjectSkillsGroup {
  projectDir: string
  projectName: string
  skills: SkillItem[]
}

export interface SkillsPayload {
  globalSkills: SkillItem[]
  projects: ProjectSkillsGroup[]
  projectSkills: SkillItem[]
}

const OFFICIAL_SKILL_NAMES = new Set([
  'dsh-code-review',
  'dsh-pre-push-checks',
  'dsh-ci-test-reliability',
  'dsh-doc',
  'dsh-translate-docs',
  'dsh-prose-standard',
  'dsh-trim-cot-leakage',
  'dsh-find-simplifications',
  'dsh-archive-agent-notes',
  'dsh-merging-stacked-prs',
  'record-browser-gif',
  'dsh-badge',
  'dsh-plugin-dev',
  'dsh-official-skills',
])

export function isOfficialSkill(name: string, filePath: string): boolean {
  if (OFFICIAL_SKILL_NAMES.has(name.toLowerCase())) return true
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  if (
    normalized.includes('dsh-sources/deepseek-harness') ||
    normalized.includes('deepseek-harness/.agents/skills') ||
    normalized.includes('.pi/skills/dsh-official-skills') ||
    normalized.includes('.pi/skills/dsh-plugin-dev')
  ) {
    return true
  }
  return false
}

function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  try {
    const yamlStr = match[1]
    const parsed = parseYaml(yamlStr)
    if (parsed && typeof parsed === 'object') {
      return {
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        description: typeof parsed.description === 'string' ? parsed.description : undefined,
      }
    }
  } catch {}
  return {}
}

function normalizeCrossPlatformPath(p: string): string {
  if (!p) return ''
  let cleaned = p.replace(/^"|"$/g, '').trim()
  if (cleaned.startsWith('/mnt/') && cleaned.length >= 7 && cleaned[6] === '/') {
    const drive = cleaned[5].toUpperCase()
    const rest = cleaned.substring(6).replace(/\//g, '\\')
    return `${drive}:${rest}`
  }
  if (/^[A-Za-z]:[\\/]/.test(cleaned)) {
    const drive = cleaned[0].toLowerCase()
    const rest = cleaned.substring(2).replace(/\\/g, '/')
    return `/mnt/${drive}${rest}`
  }
  return cleaned
}

function scanSkillRoot(
  rootDir: string,
  scope: 'global' | 'project',
  sourceLabel: string,
  projectDir?: string,
  projectName?: string
): SkillItem[] {
  const results: SkillItem[] = []
  if (!existsSync(rootDir)) return results

  let entries: string[] = []
  try {
    entries = readdirSync(rootDir)
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = join(rootDir, entry)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      const activeSkillMd = join(fullPath, 'SKILL.md')
      const disabledSkillMd = join(fullPath, 'SKILL.md.disabled')

      let skillFile = ''
      let isDisabled = false

      if (existsSync(activeSkillMd)) {
        skillFile = activeSkillMd
        isDisabled = false
      } else if (existsSync(disabledSkillMd)) {
        skillFile = disabledSkillMd
        isDisabled = true
      }

      if (skillFile) {
        let name = entry
        let description = ''
        try {
          const content = readFileSync(skillFile, 'utf-8')
          const fm = parseFrontmatter(content)
          if (fm.name) name = fm.name
          if (fm.description) description = fm.description
        } catch {}

        if (isOfficialSkill(name, skillFile)) continue

        results.push({
          id: `${scope}:${entry}`,
          name,
          description,
          scope,
          kind: 'directory',
          path: skillFile,
          skillDir: fullPath,
          disabled: isDisabled,
          sourceRoot: rootDir,
          sourceLabel,
          projectDir,
          projectName,
        })
      }
    } else if (stat.isFile()) {
      const isMd = entry.endsWith('.md')
      const isDisabledMd = entry.endsWith('.md.disabled')

      if (isMd || isDisabledMd) {
        let name = entry.replace(/\.md(\.disabled)?$/, '')
        let description = ''
        try {
          const content = readFileSync(fullPath, 'utf-8')
          const fm = parseFrontmatter(content)
          if (fm.name) name = fm.name
          if (fm.description) description = fm.description
        } catch {}

        if (isOfficialSkill(name, fullPath)) continue

        results.push({
          id: `${scope}:${entry}`,
          name,
          description,
          scope,
          kind: 'file',
          path: fullPath,
          skillDir: rootDir,
          disabled: isDisabledMd,
          sourceRoot: rootDir,
          sourceLabel,
          projectDir,
          projectName,
        })
      }
    }
  }

  return results
}

export function scanAllSkills(ctx: Context, activeProjectDir?: string): SkillsPayload {
  const globalSkillsMap = new Map<string, SkillItem>()
  const projectsMap = new Map<string, ProjectSkillsGroup>()

  const userHome = homedir()
  const dshHome = process.env.DSH_HOME || join(userHome, '.dsh')

  const globalRoots = [
    { path: join(dshHome, 'skills'), label: 'DSH Global (~/.dsh/skills)' },
    { path: join(userHome, '.pi', 'skills'), label: 'Pi Global (~/.pi/skills)' },
    { path: join(userHome, '.pi', 'agent', 'skills'), label: 'Pi Agent (~/.pi/agent/skills)' },
    { path: join(userHome, '.agents', 'skills'), label: 'Agents Global (~/.agents/skills)' },
  ]

  const wslMatch = userHome.match(/^\/home\/([^/]+)/)
  if (wslMatch) {
    const winUser = wslMatch[1]
    const winRoots = [
      { path: `/mnt/c/Users/${winUser}/.dsh/skills`, label: 'DSH Windows (%USERPROFILE%\\.dsh\\skills)' },
      { path: `/mnt/c/Users/${winUser}/.pi/skills`, label: 'Pi Windows (%USERPROFILE%\\.pi\\skills)' },
      { path: `/mnt/c/Users/${winUser}/.agents/skills`, label: 'Agents Windows (%USERPROFILE%\\.agents\\skills)' },
    ]
    globalRoots.push(...winRoots)
  }

  for (const r of globalRoots) {
    if (existsSync(r.path)) {
      const list = scanSkillRoot(r.path, 'global', r.label)
      for (const s of list) {
        if (!globalSkillsMap.has(s.name)) {
          globalSkillsMap.set(s.name, s)
        }
      }
    }
  }

  const projectCandidates = new Set<string>()

  if (activeProjectDir) {
    projectCandidates.add(resolve(activeProjectDir))
    const cross = normalizeCrossPlatformPath(activeProjectDir)
    if (cross && existsSync(cross)) projectCandidates.add(resolve(cross))
  }

  try {
    const list = ctx.workspaces?.list?.()
    if (Array.isArray(list)) {
      for (const ws of list) {
        const root = ws?.rootPath || ws?.path || ws?.projectRoot
        if (root && typeof root === 'string') {
          projectCandidates.add(resolve(root))
          const cross = normalizeCrossPlatformPath(root)
          if (cross && existsSync(cross)) projectCandidates.add(resolve(cross))
        }
      }
    }
  } catch {}

  const currentWd = process.cwd()
  projectCandidates.add(resolve(currentWd))
  const crossWd = normalizeCrossPlatformPath(currentWd)
  if (crossWd && existsSync(crossWd)) projectCandidates.add(resolve(crossWd))

  for (const projDir of projectCandidates) {
    if (!existsSync(projDir)) continue
    const projName = basename(projDir) || projDir

    const candidateSkillDirs = [
      join(projDir, '.pi', 'skills'),
      join(projDir, '.agents', 'skills'),
      join(projDir, '.skills'),
      join(projDir, 'skills'),
    ]

    const groupSkills: SkillItem[] = []
    for (const sDir of candidateSkillDirs) {
      if (existsSync(sDir)) {
        const list = scanSkillRoot(sDir, 'project', `Project (${basename(sDir)})`, projDir, projName)
        for (const sk of list) {
          if (!groupSkills.some((existing) => existing.name === sk.name)) {
            groupSkills.push(sk)
          }
        }
      }
    }

    if (groupSkills.length > 0 || projDir === resolve(activeProjectDir || currentWd)) {
      projectsMap.set(projDir, {
        projectDir: projDir,
        projectName: projName,
        skills: groupSkills,
      })
    }
  }

  const globalSkills = Array.from(globalSkillsMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  const projects = Array.from(projectsMap.values()).sort((a, b) => a.projectName.localeCompare(b.projectName))
  const projectSkills = projects.flatMap((p) => p.skills)

  return { globalSkills, projects, projectSkills }
}

export function toggleSkill(targetPath: string, enable: boolean): { ok: boolean; newPath: string } {
  const normalizedPath = normalizeCrossPlatformPath(targetPath)
  if (!existsSync(normalizedPath)) {
    throw new Error(`Skill file not found: ${targetPath}`)
  }

  const dir = dirname(normalizedPath)
  const file = basename(normalizedPath)

  let newName = file
  if (enable) {
    if (file.endsWith('.disabled')) {
      newName = file.replace(/\.disabled$/, '')
    }
  } else {
    if (!file.endsWith('.disabled')) {
      newName = `${file}.disabled`
    }
  }

  const newPath = join(dir, newName)
  if (newPath !== normalizedPath) {
    renameSync(normalizedPath, newPath)
  }

  return { ok: true, newPath }
}

export function batchToggleProjectSkills(projectDir: string | undefined, enable: boolean): { ok: boolean; count: number } {
  let count = 0
  const candidateDirs = new Set<string>()

  if (projectDir) {
    candidateDirs.add(resolve(projectDir))
    const cross = normalizeCrossPlatformPath(projectDir)
    if (cross && existsSync(cross)) candidateDirs.add(resolve(cross))
  } else {
    candidateDirs.add(resolve(process.cwd()))
  }

  const projectRoots: string[] = []
  for (const p of candidateDirs) {
    projectRoots.push(
      join(p, '.pi', 'skills'),
      join(p, '.agents', 'skills'),
      join(p, '.skills'),
      join(p, 'skills')
    )
  }

  for (const root of projectRoots) {
    if (!existsSync(root)) continue
    const skills = scanSkillRoot(root, 'project', 'project')
    for (const s of skills) {
      if (enable && s.disabled) {
        try {
          toggleSkill(s.path, true)
          count++
        } catch (e) {
          console.error(`Failed to enable skill ${s.name}:`, e)
        }
      } else if (!enable && !s.disabled) {
        try {
          toggleSkill(s.path, false)
          count++
        } catch (e) {
          console.error(`Failed to disable skill ${s.name}:`, e)
        }
      }
    }
  }

  return { ok: true, count }
}

export function deleteSkill(targetPath: string): { ok: boolean } {
  const normalizedPath = normalizeCrossPlatformPath(targetPath)
  if (!existsSync(normalizedPath)) {
    throw new Error(`Skill file not found: ${targetPath}`)
  }

  const stat = statSync(normalizedPath)
  const dir = dirname(normalizedPath)
  const file = basename(normalizedPath)

  if (file === 'SKILL.md' || file === 'SKILL.md.disabled') {
    rmSync(dir, { recursive: true, force: true })
  } else if (stat.isDirectory()) {
    rmSync(normalizedPath, { recursive: true, force: true })
  } else {
    rmSync(normalizedPath, { force: true })
  }

  return { ok: true }
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function writeJson(res: ServerResponse, status: number, data: any) {
  const str = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(str),
  })
  res.end(str)
}

export const name = 'dsh-skill-manager'
export const inject = ['webServer']

export function apply(ctx: Context) {
  ctx.effect(() => {
    return ctx.webServer.register({
      kind: 'prefix',
      path: '/td-skills/api',
      handler: async (req, res) => {
        const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
        const subpath = pathname.replace(/^\/td-skills\/api\/?/, '')

        try {
          if (subpath === '' || subpath === 'list') {
            let projectDir: string | undefined
            if (req.method === 'POST') {
              const body = (await readJsonBody(req)) as any
              projectDir = body?.projectDir || body?.cwd
            } else {
              const url = new URL(req.url ?? '/', 'http://dsh.internal')
              projectDir = url.searchParams.get('cwd') || undefined
            }

            const result = scanAllSkills(ctx, projectDir)
            writeJson(res, 200, { ok: true, value: result })
            return
          }

          if (req.method !== 'POST') {
            writeJson(res, 405, { ok: false, error: { message: 'Method Not Allowed' } })
            return
          }

          const body = (await readJsonBody(req)) as any

          if (subpath === 'toggle') {
            const { path, enable } = body || {}
            if (!path || typeof enable !== 'boolean') {
              writeJson(res, 400, { ok: false, error: { message: 'Missing path or enable boolean' } })
              return
            }
            const result = toggleSkill(path, enable)
            writeJson(res, 200, { ok: true, value: result })
            return
          }

          if (subpath === 'batch-project') {
            const { projectDir, enable } = body || {}
            if (typeof enable !== 'boolean') {
              writeJson(res, 400, { ok: false, error: { message: 'Missing enable boolean' } })
              return
            }
            const result = batchToggleProjectSkills(projectDir, enable)
            writeJson(res, 200, { ok: true, value: result })
            return
          }

          if (subpath === 'delete') {
            const { path } = body || {}
            if (!path) {
              writeJson(res, 400, { ok: false, error: { message: 'Missing path' } })
              return
            }
            const result = deleteSkill(path)
            writeJson(res, 200, { ok: true, value: result })
            return
          }

          writeJson(res, 404, { ok: false, error: { message: `Unknown endpoint: ${subpath}` } })
        } catch (err: any) {
          writeJson(res, 500, { ok: false, error: { message: err?.message || String(err) } })
        }
      },
    })
  }, 'dsh-skill-manager: HTTP routes')
}
