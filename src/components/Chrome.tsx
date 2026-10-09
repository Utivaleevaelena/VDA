import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LANGS, useI18n } from '../i18n'
import { ICON } from '../lib'

export function LangSwitch() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className="lang" role="group" aria-label={t('language')}>
      {LANGS.map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} lang={l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  )
}

export function Brand() {
  const { t } = useI18n()
  return (
    <Link to="/" className="brand" aria-label={`THE NEXT TABLE ${t('by')}`}>
      <b>THE NEXT TABLE</b>
      <span>{t('by')}</span>
    </Link>
  )
}

export function Header() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname, loc.hash])
  const links: [string, string][] = [['/#idea', t('nav_idea')], ['/#events', t('nav_events')], ['/#formats', t('nav_formats')], ['/#about', t('nav_about')], ['/#connect', t('nav_connect')]]
  return (
    <header className="site-header">
      <div className="wrap">
        <Brand />
        <nav className="nav" aria-label="Main">
          {links.map(([to, label]) => <a key={to} href={to}>{label}</a>)}
        </nav>
        <div className="head-actions">
          <LangSwitch />
          <a className="btn btn-primary btn-sm" href="/#events">{t('cta_find')} →</a>
          <button className="burger" type="button" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? t('close') : t('menu')} onClick={() => setOpen(!open)}>
            <img src={ICON(open ? 'close' : 'menu')} alt="" />
          </button>
        </div>
      </div>
      {open && (
        <nav className="mobile-menu" id="mobile-menu" aria-label="Mobile">
          {links.map(([to, label]) => <a key={to} href={to}>{label}</a>)}
          <a className="btn btn-primary" href="/#events">{t('cta_find')} →</a>
        </nav>
      )}
    </header>
  )
}

export function Footer() {
  const { t } = useI18n()
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div>
          <Brand />
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>{t('footer_note')}</p>
        </div>
        <div className="links">
          <Link to="/privacy">{t('footer_privacy')}</Link>
          <a href="mailto:elena@pixelexpertsteam.com">{t('contacts')}</a>
        </div>
        <div className="tag">{t('tagline')}</div>
      </div>
    </footer>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    addEventListener('online', on); addEventListener('offline', off)
    return () => { removeEventListener('online', on); removeEventListener('offline', off) }
  }, [])
  return (
    <>
      <a className="skip" href="#main">{t('skip')}</a>
      {!online && <div className="offline" role="alert">{t('offline')}</div>}
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </>
  )
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  useEffect(() => { if (msg) { const id = setTimeout(() => setMsg(null), 4500); return () => clearTimeout(id) } }, [msg])
  const node = msg ? <div className={`toast${msg.error ? ' error' : ''}`} role="status" aria-live="polite">{msg.text}</div> : null
  return { show: (text: string, error = false) => setMsg({ text, error }), node }
}

export function Modal({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  const { t } = useI18n()
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', key)
    return () => { document.body.style.overflow = prev; removeEventListener('keydown', key) }
  }, [onClose])
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label}>
        <button className="x" type="button" onClick={onClose} aria-label={t('close')}>×</button>
        {children}
      </div>
    </div>
  )
}

export const Spinner = () => <div className="loading" role="status"><span className="spinner" /></div>
