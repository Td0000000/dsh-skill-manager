/**
 * Typed client API wrapper for td-integration Skill Manager
 */

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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    let errText = res.statusText
    try {
      const errJson = await res.json()
      if (errJson?.error?.message) errText = errJson.error.message
      else if (errJson?.error) errText = String(errJson.error)
    } catch {
      // ignore
    }
    throw new Error(errText || `HTTP ${res.status}`)
  }
  const json = await res.json()
  if (json.ok && json.value !== undefined) return json.value as T
  return json as T
}

export const skillManagerApi = {
  async getSkills(cwd?: string): Promise<SkillsPayload> {
    const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''
    return request<SkillsPayload>(`/td-skills/api${query}`)
  },

  async toggleSkill(path: string, enable: boolean): Promise<{ ok: boolean; newPath: string }> {
    return request<{ ok: boolean; newPath: string }>('/td-skills/api/toggle', {
      method: 'POST',
      body: JSON.stringify({ path, enable }),
    })
  },

  async batchToggleProject(enable: boolean, projectDir?: string): Promise<{ ok: boolean; count: number }> {
    return request<{ ok: boolean; count: number }>('/td-skills/api/batch-project', {
      method: 'POST',
      body: JSON.stringify({ enable, projectDir }),
    })
  },

  async deleteSkill(path: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/td-skills/api/delete', {
      method: 'POST',
      body: JSON.stringify({ path }),
    })
  },
}
