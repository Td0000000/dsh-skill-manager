import type { Context } from '@deepseek-ai/cordis'
import { SkillManagerSection } from './SkillManagerSection.tsx'

export const inject = ['slots', 'locale']

/**
 * Read the active locale id across DSH generations.
 *
 * DSH 0.2.x exposes `locale.getLocale()` returning
 * `{ active, locales, revision }`; the 0.1.x line exposed `locale.get()` /
 * `locale.current`. Probing both keeps the section label in step with the UI
 * language instead of falling back to Chinese forever.
 */
function activeLocaleId(ctx: Context): string {
  try {
    const locale = (ctx as any).locale
    const snapshot = locale?.getLocale?.() ?? locale?.get?.() ?? locale?.current
    const id = typeof snapshot === 'string' ? snapshot : snapshot?.active
    return typeof id === 'string' ? id : ''
  } catch {
    return ''
  }
}

export function apply(ctx: Context) {
  const isZh = () => {
    const id = activeLocaleId(ctx)
    return id === '' ? true : id.toLowerCase().startsWith('zh')
  }

  // settings.section is declared by @deepseek-ai/dsh-client-ui-settings.
  // Must use ctx.slots.inject to defer registration until the slot exists,
  // preventing undeclared target throws during browser boot.
  (ctx as any).slots.inject('settings.section', () => {
    const off = (ctx as any).slots.register({
      name: 'settings.section',
      id: 'skills-manager',
      order: 104,
      label: () => (isZh() ? '技能管理' : 'Skill Manager'),
    }, SkillManagerSection)

    return () => {
      if (typeof off === 'function') off()
    }
  })
}
