import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import ru from './ru'
import en from './en'
import pl from './pl'

export type Lang = 'ru' | 'en' | 'pl'
export type Key = keyof typeof ru
const dicts: Record<Lang, Record<Key, string>> = { ru, en, pl }
export const LANGS: Lang[] = ['ru', 'en', 'pl']
const LOCALE: Record<Lang, string> = { ru: 'ru-RU', en: 'en-GB', pl: 'pl-PL' }

const SEO: Record<Lang, { title: string; description: string }> = {
  ru: { title: 'THE NEXT TABLE — Новые возможности начинаются с разговора', description: 'Международное онлайн-сообщество предпринимателей. Небольшие интерактивные встречи до 80 минут на русском, английском и польском.' },
  en: { title: 'THE NEXT TABLE — New possibilities begin with a conversation', description: 'An international online community of entrepreneurs. Small interactive meetings of up to 80 minutes in Russian, English and Polish.' },
  pl: { title: 'THE NEXT TABLE — Nowe możliwości zaczynają się od rozmowy', description: 'Międzynarodowa społeczność przedsiębiorców online. Małe, interaktywne spotkania do 80 minut po rosyjsku, angielsku i polsku.' },
}

type Ctx = {
  lang: Lang
  setLang: (l: Lang) => void
  t: (k: Key, vars?: Record<string, string | number>) => string
  locale: string
  names: (l: Lang) => string
}
const I18n = createContext<Ctx>(null!)
export const useI18n = () => useContext(I18n)

function initial(): Lang {
  try {
    const q = new URLSearchParams(location.search).get('lang')
    if (q && q in dicts) return q as Lang
    const s = localStorage.getItem('nt_lang')
    if (s && s in dicts) return s as Lang
  } catch { /* storage may be blocked */ }
  return 'ru'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial)
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem('nt_lang', l) } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    document.documentElement.lang = lang
    const meta = document.querySelector('meta[name="description"]')
    meta?.setAttribute('content', SEO[lang].description)
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', SEO[lang].description)
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', SEO[lang].title)
    if (!/^\/(my|verify|admin|events)/.test(location.pathname)) document.title = SEO[lang].title
  }, [lang])
  const value = useMemo<Ctx>(() => ({
    lang, setLang, locale: LOCALE[lang],
    t: (k, vars) => {
      let s = dicts[lang][k] ?? k
      if (vars) for (const [a, b] of Object.entries(vars)) s = s.replaceAll(`{${a}}`, String(b))
      return s
    },
    names: (l) => dicts[lang][`lang_${l}` as Key] ?? l,
  }), [lang, setLang])
  return <I18n.Provider value={value}>{children}</I18n.Provider>
}
