import { Link } from 'react-router-dom'
import type { EventPublic } from '../api'
import { FORMAT_KEY, ICON, fmtWhen } from '../lib'
import { useI18n } from '../i18n'

export function statusOf(e: EventPublic): { key: 'status_tba' | 'status_open' | 'status_full' | 'status_closed'; tone: string } {
  if (!e.startsAt) return { key: 'status_tba', tone: 'warn' }
  if (e.status === 'registration_closed') return { key: 'status_closed', tone: '' }
  if (e.seatsFree < 1) return { key: 'status_full', tone: 'ox' }
  return { key: 'status_open', tone: 'sage' }
}

export function EventCard({ e }: { e: EventPublic }) {
  const { t, locale, names } = useI18n()
  const st = statusOf(e)
  const when = fmtWhen(e, locale)
  return (
    <article className="ecard">
      <div>
        <div className="top">
          <span className="eyebrow">{t(FORMAT_KEY(e.format))}</span>
          <span className={`pill ${st.tone}`}>{t(st.key)}</span>
          {e.isDemo && <span className="pill demo">{t('demo_tag')}</span>}
        </div>
        <h3>{e.title}</h3>
        <p>{e.description}</p>
        {e.benefits[0] && <p className="benefit">{t('benefit_label')}: {e.benefits[0]}</p>}
      </div>
      <div className="meta">
        <div><img src={ICON('calendar')} alt="" />{when ?? t('date_tba_label')}</div>
        <div><img src={ICON('globe')} alt="" />{names(e.language)}</div>
        <div><img src={ICON('clock')} alt="" />{e.durationMin} {t('min')} · {t('online')}</div>
        <div><img src={ICON('users')} alt="" />{e.startsAt ? t('seats_count', { taken: e.seatsTaken, cap: e.capacity }) : `${e.capacity}`}</div>
      </div>
      <Link className={`btn ${e.startsAt ? 'btn-primary' : 'btn-ghost'}`} to={`/events/${e.slug}`}>
        {e.startsAt ? <>{t('view_table')} →</> : t('want_join')}
      </Link>
    </article>
  )
}
