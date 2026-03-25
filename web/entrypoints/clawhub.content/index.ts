/**
 * Content script for clawhub.ai pages embedded in ocbot.
 *
 * - Injects CSS directly via <style> element for reliable injection.
 * - Intercepts install button clicks and routes them
 *   through postMessage to the parent frame (home page with gateway).
 */

import cssText from './style.css?raw'

type MarketplaceTheme = {
  mode?: 'light' | 'dark'
  accent?: string
  accentForeground?: string
  accentSubtle?: string
  bg?: string
  bgHover?: string
  bgElevated?: string
  card?: string
  text?: string
  textStrong?: string
  muted?: string
  border?: string
  borderStrong?: string
  radius?: string
  radiusMd?: string
  fontBody?: string
  shadow?: string
}

export default defineContentScript({
  matches: ['*://clawhub.ai/*'],
  allFrames: true,
  runAt: 'document_start',

  main() {
    const root = document.documentElement
    root.setAttribute('data-ocbot-embed', 'true')

    const ensureStyle = () => {
      if (document.getElementById('ocbot-clawhub-style')) return
      const style = document.createElement('style')
      style.id = 'ocbot-clawhub-style'
      style.textContent = cssText
      ;(document.head || document.documentElement).appendChild(style)
    }

    const applyTheme = (theme: MarketplaceTheme | undefined) => {
      if (!theme) return
      if (theme.mode) {
        root.setAttribute('data-ocbot-theme', theme.mode)
      }
      const entries: Array<[string, string | undefined]> = [
        ['--ocbot-accent', theme.accent],
        ['--ocbot-accent-foreground', theme.accentForeground],
        ['--ocbot-accent-subtle', theme.accentSubtle],
        ['--ocbot-bg', theme.bg],
        ['--ocbot-bg-hover', theme.bgHover],
        ['--ocbot-bg-elevated', theme.bgElevated],
        ['--ocbot-card', theme.card],
        ['--ocbot-text', theme.text],
        ['--ocbot-text-strong', theme.textStrong],
        ['--ocbot-muted', theme.muted],
        ['--ocbot-border', theme.border],
        ['--ocbot-border-strong', theme.borderStrong],
        ['--ocbot-radius', theme.radius],
        ['--ocbot-radius-md', theme.radiusMd],
        ['--ocbot-font-body', theme.fontBody],
        ['--ocbot-shadow', theme.shadow],
      ]
      for (const [name, value] of entries) {
        if (value) root.style.setProperty(name, value)
      }
    }

    const postReady = () => {
      window.parent.postMessage({ type: 'ocbot:clawhub:ready' }, '*')
    }

    const isSkillLink = (el: HTMLElement) => {
      if (el.tagName !== 'A') return false
      if (el.closest('nav, header, footer')) return false
      const href = (el as HTMLAnchorElement).getAttribute('href') ?? ''
      return /\/(?:skills|packages)\/[^/]+/.test(href)
    }

    const isInstallButton = (el: HTMLElement) => {
      const text = el.textContent?.trim().toLowerCase() ?? ''
      return (
        (el.tagName === 'BUTTON' || el.tagName === 'A') &&
        (text === 'install' ||
         text === 'add' ||
         text === 'add skill' ||
         text === 'install skill' ||
         text.startsWith('install ') ||
         text.startsWith('add '))
      )
    }

    const getSkillSlug = (el: HTMLElement): string | null => {
      const pathMatch = window.location.pathname.match(/\/(?:skills|packages)\/([^/]+)/)
      if (pathMatch) return pathMatch[1]

      const card = el.closest('a[href*="/skills/"], a[href*="/packages/"]')
      if (card) {
        const href = card.getAttribute('href') ?? ''
        const match = href.match(/\/(?:skills|packages)\/([^/]+)/)
        if (match) return match[1]
      }

      return el.closest('[data-slug]')?.getAttribute('data-slug')
        ?? el.closest('[data-name]')?.getAttribute('data-name')
        ?? el.closest('[data-package]')?.getAttribute('data-package')
        ?? null
    }

    const annotateElements = () => {
      document.querySelectorAll<HTMLElement>('a[href], button, [role="button"]').forEach(el => {
        if (isSkillLink(el)) {
          el.setAttribute('data-ocbot-skill-link', 'true')
        }
        if (isInstallButton(el)) {
          el.setAttribute('data-ocbot-install', 'true')
        }
      })
    }

    const handleInstallClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const btn = target.closest('button, a') as HTMLElement | null
      if (!btn || !isInstallButton(btn)) return

      const slug = getSkillSlug(btn)
      if (!slug) return

      e.preventDefault()
      e.stopPropagation()

      const originalText = btn.textContent
      const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
      btn.textContent = 'Installing...'
      btn.setAttribute('disabled', 'true')
      btn.setAttribute('aria-busy', 'true')
      ;(btn as HTMLButtonElement).style.opacity = '0.6'

      window.parent.postMessage(
        { type: 'ocbot:clawhub:install', slug, requestId },
        '*'
      )

      const handler = (event: MessageEvent) => {
        if (event.source !== window.parent) return
        if (event.data?.type !== 'ocbot:clawhub:install:result') return
        if (event.data.requestId && event.data.requestId !== requestId) return
        if (!event.data.requestId && event.data.slug !== slug) return
        window.removeEventListener('message', handler)

        if (event.data.ok) {
          btn.textContent = 'Installed ✓'
        } else {
          btn.textContent = originalText
          btn.removeAttribute('disabled')
        }
        btn.removeAttribute('aria-busy')
        ;(btn as HTMLButtonElement).style.opacity = '1'
      }

      window.addEventListener('message', handler)

      setTimeout(() => {
        window.removeEventListener('message', handler)
        if (btn.textContent === 'Installing...') {
          btn.textContent = originalText
          btn.removeAttribute('disabled')
          btn.removeAttribute('aria-busy')
          ;(btn as HTMLButtonElement).style.opacity = '1'
        }
      }, 30_000)
    }

    ensureStyle()
    annotateElements()
    postReady()
    window.addEventListener('message', event => {
      if (event.source !== window.parent) return
      if (event.data?.type !== 'ocbot:theme-sync') return
      applyTheme(event.data.theme as MarketplaceTheme | undefined)
    })
    document.addEventListener('click', handleInstallClick, true)
    window.addEventListener('pageshow', postReady)
    document.addEventListener('readystatechange', ensureStyle)
    const observer = new MutationObserver(() => annotateElements())
    observer.observe(document.documentElement, { childList: true, subtree: true })
  },
})
