/**
 * Skill Manager Section for DSH Settings:
 * Embedded in Settings to manage Global skills and Project skills,
 * with Global skills ordered on top and individual Project folders below.
 * Features collapsible accordion headers with directional chevrons (left when closed, down when open),
 * per-skill enable/disable toggling, project-level batch enable/disable, and skill deletion.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  skillManagerApi,
  type SkillItem,
  type ProjectSkillsGroup,
  type SkillsPayload,
} from './skill-manager-api.ts'
import styles from './SkillManagerSection.module.css'

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

function isOfficial(s: SkillItem): boolean {
  if (OFFICIAL_SKILL_NAMES.has(s.name.toLowerCase())) return true
  const p = (s.path || '').replace(/\\/g, '/').toLowerCase()
  return (
    p.includes('dsh-sources/deepseek-harness') ||
    p.includes('deepseek-harness/.agents/skills') ||
    p.includes('.pi/skills/dsh-official-skills') ||
    p.includes('.pi/skills/dsh-plugin-dev')
  )
}

export function SkillManagerSection() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [globalSkills, setGlobalSkills] = useState<SkillItem[]>([])
  const [projects, setProjects] = useState<ProjectSkillsGroup[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    global: true,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [operatingPath, setOperatingPath] = useState<string | null>(null)
  const [deleteModalSkill, setDeleteModalSkill] = useState<SkillItem | null>(null)

  const refreshData = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      setError(null)
      const data: SkillsPayload = await skillManagerApi.getSkills()
      setGlobalSkills(data.globalSkills || [])
      setProjects(data.projects || [])

      // Auto expand all newly loaded project folders
      setExpandedGroups((prev) => {
        const next = { ...prev }
        if (next['global'] === undefined) next['global'] = true
        for (const p of data.projects || []) {
          if (next[p.projectDir] === undefined) {
            next[p.projectDir] = true
          }
        }
        return next
      })
    } catch (err: any) {
      if (!silent) setError(err?.message || '加载技能列表失败')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // Hot refresh: initial fetch + periodic polling + window focus detection
  useEffect(() => {
    void refreshData(false)

    const interval = setInterval(() => {
      void refreshData(true)
    }, 2500)

    const onFocus = () => {
      void refreshData(true)
    }
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const toggleAccordion = (key: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  // Filter skills by search query and exclude official built-ins
  const filterList = (list: SkillItem[]) => {
    const userOnly = list.filter((s) => !isOfficial(s))
    if (!searchQuery.trim()) return userOnly
    const q = searchQuery.toLowerCase()
    return userOnly.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        s.path.toLowerCase().includes(q)
    )
  }

  const filteredGlobal = useMemo(() => filterList(globalSkills), [globalSkills, searchQuery])

  // Filtered projects: exclude official repository and projects with zero user skills
  const filteredProjects = useMemo(() => {
    return projects
      .filter((p) => p.projectName.toLowerCase() !== 'deepseek-harness')
      .map((p) => ({
        ...p,
        skills: filterList(p.skills),
      }))
      .filter((p) => p.skills.length > 0)
  }, [projects, searchQuery])

  // Single skill toggle enable / disable
  const handleToggleSkill = async (s: SkillItem) => {
    const nextEnable = s.disabled
    setOperatingPath(s.path)
    try {
      const res = await skillManagerApi.toggleSkill(s.path, nextEnable)
      const updateItem = (item: SkillItem) =>
        item.path === s.path
          ? { ...item, disabled: !nextEnable, path: res.newPath }
          : item

      if (s.scope === 'global') {
        setGlobalSkills((prev) => prev.map(updateItem))
      } else {
        setProjects((prev) =>
          prev.map((proj) => ({
            ...proj,
            skills: proj.skills.map(updateItem),
          }))
        )
      }
    } catch (err: any) {
      alert(`操作失败: ${err?.message || err}`)
      void refreshData()
    } finally {
      setOperatingPath(null)
    }
  }

  // Project batch enable / disable for a specific project folder
  const handleBatchToggleProject = async (projectDir: string, enable: boolean) => {
    setOperatingPath(`batch-${projectDir}`)
    try {
      await skillManagerApi.batchToggleProject(enable, projectDir)
      await refreshData()
    } catch (err: any) {
      alert(`一键${enable ? '开启' : '关闭'}失败: ${err?.message || err}`)
    } finally {
      setOperatingPath(null)
    }
  }

  // Delete skill
  const handleConfirmDelete = async () => {
    if (!deleteModalSkill) return
    const target = deleteModalSkill
    setOperatingPath(target.path)
    try {
      await skillManagerApi.deleteSkill(target.path)
      setDeleteModalSkill(null)
      // Immediate hot reload from backend
      await refreshData(true)
    } catch (err: any) {
      alert(`删除失败: ${err?.message || err}`)
    } finally {
      setOperatingPath(null)
    }
  }

  const renderSkillCard = (s: SkillItem) => {
    const isOperating = operatingPath === s.path

    return (
      <div
        key={s.path}
        className={`${styles.skillCard} ${s.disabled ? styles.skillCardDisabled : ''}`}
      >
        <div className={styles.skillLeft}>
          <div className={styles.skillInfo}>
            <div className={styles.skillTitleLine}>
              <span className={styles.skillNameText}>{s.name}</span>
              <span className={`${styles.statusPill} ${styles.statusScope}`}>
                {s.sourceLabel || (s.scope === 'global' ? '全局技能' : '项目技能')}
              </span>
              {s.disabled ? (
                <span className={`${styles.statusPill} ${styles.statusDisabled}`}>已停用</span>
              ) : (
                <span className={`${styles.statusPill} ${styles.statusActive}`}>已启用</span>
              )}
            </div>

            {s.description && (
              <div className={styles.skillDescText} title={s.description}>
                {s.description}
              </div>
            )}

            <div className={styles.skillPathText} title={s.path}>
              {s.path}
            </div>
          </div>
        </div>

        <div className={styles.skillRight}>
          {/* Toggle enable / disable */}
          <button
            className={`${styles.btn} ${styles.btnSmall}`}
            disabled={isOperating}
            onClick={() => void handleToggleSkill(s)}
            style={{
              color: s.disabled
                ? 'var(--dsw-alias-state-business-primary, #16a34a)'
                : 'var(--dsw-alias-state-error-primary, #ef4444)',
            }}
          >
            {s.disabled ? '启用技能' : '禁用技能'}
          </button>

          {/* Delete skill */}
          <button
            className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`}
            disabled={isOperating}
            onClick={() => setDeleteModalSkill(s)}
            title="删除技能"
          >
            删除
          </button>
        </div>
      </div>
    )
  }

  const globalActiveCount = useMemo(
    () => globalSkills.filter((s) => !s.disabled).length,
    [globalSkills]
  )

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h2 className={styles.title}>
              技能管理
            </h2>
            <p className={styles.subtitle}>
              分类管理全局技能与各项目工作区技能 · 支持单项启停、项目批量开关与彻底删除
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.btn} onClick={() => void refreshData(false)}>
              刷新
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="搜索技能名称、描述、所属项目或文件路径..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div style={{ color: '#ef4444', marginBottom: 16, fontSize: 13 }}>
          错误: {error}
        </div>
      )}

      {loading && globalSkills.length === 0 && projects.length === 0 ? (
        <div className={styles.emptyTip}>正在扫描并加载各项目与全局技能列表...</div>
      ) : (
        <div className={styles.groupList}>
          {/* 1. Global Skills Group (ALWAYS ORDERED ON TOP) */}
          <div className={styles.groupItem}>
            <div
              className={styles.groupHeader}
              onClick={() => toggleAccordion('global')}
            >
              <div className={styles.groupHeaderLeft}>
                {/* Synchronized Chevron with Plugin Manager: ▶ rotated to ▼ */}
                <span
                  className={`${styles.chevron} ${
                    expandedGroups['global'] ? styles.chevronExpanded : ''
                  }`}
                >
                  ▶
                </span>
                <span className={styles.groupName}>全局技能</span>
                <span className={styles.badge}>
                  {globalSkills.length} 个技能 · {globalActiveCount} 启用
                </span>
              </div>
            </div>

            {expandedGroups['global'] && (
              <div className={styles.groupContent}>
                {filteredGlobal.length === 0 ? (
                  <div className={styles.emptyTip}>
                    {searchQuery ? '没有找到匹配的全局技能' : '暂无全局技能（可在 ~/.dsh/skills 或 ~/.agents/skills 中添加）'}
                  </div>
                ) : (
                  filteredGlobal.map(renderSkillCard)
                )}
              </div>
            )}
          </div>

          {/* 2. Individual Project Folders (ORDERED BELOW GLOBAL) */}
          {filteredProjects.map((project) => {
            const isExpanded = expandedGroups[project.projectDir] ?? true
            const activeCount = project.skills.filter((s) => !s.disabled).length
            const isOperatingBatch = operatingPath === `batch-${project.projectDir}`

            return (
              <div key={project.projectDir} className={styles.groupItem}>
                <div
                  className={styles.groupHeader}
                  onClick={() => toggleAccordion(project.projectDir)}
                >
                  <div className={styles.groupHeaderLeft}>
                    {/* Synchronized Chevron with Plugin Manager: ▶ rotated to ▼ */}
                    <span
                      className={`${styles.chevron} ${
                        isExpanded ? styles.chevronExpanded : ''
                      }`}
                    >
                      ▶
                    </span>

                    {/* Displays actual Project Folder Name and full path */}
                    <div>
                      <div className={styles.groupName}>
                        项目文件夹：<strong>{project.projectName}</strong>
                        <span className={styles.badge}>
                          {project.skills.length} 个技能 · {activeCount} 启用
                        </span>
                      </div>
                      <div className={styles.projectPathSub} title={project.projectDir}>
                        {project.projectDir}
                      </div>
                    </div>
                  </div>

                  <div
                    className={styles.groupHeaderRight}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Batch toggle buttons for THIS project folder */}
                    {project.skills.length > 0 && (
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <button
                          className={`${styles.btn} ${styles.btnSuccess} ${styles.btnSmall}`}
                          disabled={isOperatingBatch}
                          onClick={() => void handleBatchToggleProject(project.projectDir, true)}
                          title={`一键开启项目 [${project.projectName}] 的所有技能`}
                        >
                          一键开启
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`}
                          disabled={isOperatingBatch}
                          onClick={() => void handleBatchToggleProject(project.projectDir, false)}
                          title={`一键关闭项目 [${project.projectName}] 的所有技能`}
                        >
                          一键关闭
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className={styles.groupContent}>
                    {project.skills.length === 0 ? (
                      <div className={styles.emptyTip}>
                        {searchQuery
                          ? '当前项目未找到匹配的技能'
                          : `项目文件夹 [${project.projectName}] 暂无技能（可在其 .dsh/skills, .agents/skills 或 .pi/skills 中添加）`}
                      </div>
                    ) : (
                      project.skills.map(renderSkillCard)
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalSkill && (
        <div className={styles.modalBackdrop} onClick={() => setDeleteModalSkill(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>确认删除技能</h3>
            <div className={styles.modalBody}>
              确定要删除技能「<strong>{deleteModalSkill.name}</strong>」吗？
              <br />
              <span style={{ fontSize: 12, color: '#888', marginTop: 6, display: 'inline-block' }}>
                所属项目: {deleteModalSkill.projectName || '全局'}
              </span>
              <br />
              <span style={{ fontSize: 12, color: '#888', display: 'inline-block' }}>
                路径: {deleteModalSkill.path}
              </span>
              <br />
              此操作将直接删除该技能文件或目录，操作后无法撤销。
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.btn}
                onClick={() => setDeleteModalSkill(null)}
              >
                取消
              </button>
              <button
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={() => void handleConfirmDelete()}
              >
                彻底删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
