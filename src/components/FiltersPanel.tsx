import { useState } from 'react'
import { useI18n, type Key, type Lang } from '../i18n'
import { FORMATS, FORMAT_KEY, TOPICS } from '../lib'

export type Filters = { lang: 'all' | Lang; format: 'all' | (typeof FORMATS)[number]; date: 'any' | 'week' | 'month' | 'tba'; topics: string[]; free: boolean }
export const NO_FILTERS: Filters = { lang: 'all', format: 'all', date: 'any', topics: [], free: false }

export function FiltersPanel({ f, setF, id }: { f: Filters; setF: (f: Filters) => void; id: string }) {
  const { t, names } = useI18n()
  const [open, setOpen] = useState(false)
  const chip = (label: string, active: boolean, on: () => void) => <button key={label} type="button" className="chip" aria-pressed={active} onClick={on}>{label}</button>
  return (
    <aside className={`filters${open ? ' open' : ''}`} aria-label={t('f_title')}>
      <div className="fhead">
        <h3>{t('f_title')}</h3>
        <span>
          <button type="button" className="btn btn-text btn-sm more" aria-expanded={open} aria-controls={`${id}-g`} onClick={() => setOpen(!open)}>{t('f_show')} {open ? '–' : '+'}</button>
          <button type="button" className="btn btn-text btn-sm" onClick={() => setF(NO_FILTERS)}>{t('f_reset')}</button>
        </span>
      </div>
      <div className="fgroups" id={`${id}-g`}>
        <fieldset className="fgroup"><legend>{t('f_lang')}</legend><div className="chips">
          {chip(t('all'), f.lang === 'all', () => setF({ ...f, lang: 'all' }))}
          {(['ru', 'en', 'pl'] as Lang[]).map((l) => chip(names(l), f.lang === l, () => setF({ ...f, lang: l })))}
        </div></fieldset>
        <fieldset className="fgroup"><legend>{t('f_format')}</legend><div className="chips">
          {chip(t('all'), f.format === 'all', () => setF({ ...f, format: 'all' }))}
          {FORMATS.map((x) => chip(t(FORMAT_KEY(x)), f.format === x, () => setF({ ...f, format: x })))}
        </div></fieldset>
        <fieldset className="fgroup"><legend>{t('f_date')}</legend><div className="chips">
          {(['any', 'week', 'month', 'tba'] as const).map((d) => chip(t(`date_${d}` as Key), f.date === d, () => setF({ ...f, date: d })))}
        </div></fieldset>
        <fieldset className="fgroup topics"><legend>{t('f_topic')}</legend>
          {TOPICS.map((x) => (
            <label className="check" key={x}>
              <input type="checkbox" checked={f.topics.includes(x)} onChange={(e) => setF({ ...f, topics: e.target.checked ? [...f.topics, x] : f.topics.filter((y) => y !== x) })} />
              {t(`topic_${x}` as Key)}
            </label>
          ))}
        </fieldset>
        <fieldset className="fgroup"><legend>{t('f_avail')}</legend>
          <label className="check"><input type="checkbox" checked={f.free} onChange={(e) => setF({ ...f, free: e.target.checked })} />{t('avail_only')}</label>
        </fieldset>
      </div>
    </aside>
  )
}

export function applyFilters<T extends { language: string; format: string; topic: string; startsAt: string | null; registrationOpen: boolean; seatsFree: number }>(events: T[], f: Filters) {
  const now = Date.now()
  return events.filter((e) => {
    if (f.lang !== 'all' && e.language !== f.lang) return false
    if (f.format !== 'all' && e.format !== f.format) return false
    if (f.topics.length && !f.topics.includes(e.topic)) return false
    if (f.free && !(e.startsAt && e.registrationOpen && e.seatsFree > 0)) return false
    if (f.date === 'tba' && e.startsAt) return false
    if ((f.date === 'week' || f.date === 'month') && (!e.startsAt || new Date(e.startsAt).getTime() > now + (f.date === 'week' ? 7 : 30) * 86_400_000)) return false
    return true
  })
}
