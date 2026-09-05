import type { Context } from '@deepseek-ai/cordis'
import { SkillManagerSection } from './SkillManagerSection.tsx'

export const inject = ['slots', 'locale']

export function apply(ctx: Context) {
  const isZh = () => {
    try {
      const loc = (ctx as any).locale?.get?.() || (ctx as any).locale?.current
      return !loc || String(loc).startsWith('zh')
    } catch {
      return true
    }
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
