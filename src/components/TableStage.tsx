import { CSSProperties, useMemo } from 'react'
import type { SeatView } from '../api'
import { CHAIR, ICON, chairFor, iconFor, seatLayout } from '../lib'
import { useI18n } from '../i18n'

type Props = {
  seatCount: number
  seats?: SeatView[]
  selectedSeat?: number | null
  onSeat?: (seat: number, view: SeatView) => void
  decor?: boolean
  reveal?: boolean
  mini: string
  title: string
  question: string
  facts?: string[]
  benefits?: string[]
  label?: string
  mineLabel?: string
}

const BENEFIT_ICONS = ['growth', 'users', 'lightbulb']
const DECOR_STATES = ['available', 'available', 'available', 'available', 'available', 'available', 'available', 'available'] as const

export function TableStage({ seatCount, seats, selectedSeat, onSeat, decor, reveal, mini, title, question, facts, benefits, label, mineLabel }: Props) {
  const { t } = useI18n()
  const pos = useMemo(() => seatLayout(seatCount), [seatCount])
  const view = (n: number): SeatView => seats?.find((s) => s.seat === n) ?? { seat: n, state: decor ? DECOR_STATES[(n - 1) % 8] : 'closed' }

  return (
    <div className={`stage${decor ? ' decor' : ''}${reveal ? ' is-reveal' : ''}`} role={decor ? 'img' : 'group'} aria-label={label ?? title} aria-hidden={decor || undefined}>
      <img className="marble" alt="" src="/assets/images/tabletop_marble.png" width={1600} height={1000} />
      <div className="lettering">
        <div className="mini">{mini}</div>
        <h3>{title}</h3>
        <div className="q">{question}</div>
        {facts && <div className="facts">{facts.map((f, i) => <span key={i}>{f}</span>)}</div>}
        {benefits && benefits.length > 0 && (
          <>
            <div className="rule" />
            <div className="expect">{t('benefit_label').toUpperCase()}</div>
            <div className="benefits">
              {benefits.slice(0, 3).map((b, i) => <span key={i}><img src={ICON(BENEFIT_ICONS[i])} alt="" />{b}</span>)}
            </div>
          </>
        )}
      </div>
      <div className="art">
        {pos.map((p, i) => {
          const v = view(p.seat)
          const sel = selectedSeat === p.seat
          const style = { left: `${p.x}%`, top: `${p.y}%`, '--sc': p.sc, '--dx': p.dx, '--dy': p.dy, '--i': i } as CSSProperties
          return (
            <div key={p.seat} className={`chair-art${sel ? ' is-selected' : ''}`} style={style}>
              <img src={CHAIR(chairFor(v.state, p.seat, sel))} alt="" style={{ transform: `rotate(${p.rot}deg)` }} />
            </div>
          )
        })}
      </div>
      <div className="controls">
        {pos.map((p, i) => {
          const v = view(p.seat)
          const sel = selectedSeat === p.seat
          const active = !decor && (v.state === 'available' || v.state === 'confirmed_public' || (sel && !mineLabel))
          const icon = iconFor(v.state, sel)
          const style = { left: `${p.x}%`, top: `${p.y}%`, '--sc': p.sc, '--dx': p.dx, '--dy': p.dy, '--i': i } as CSSProperties
          const stateLabel = sel ? (mineLabel ?? t('st_selected')) : v.state === 'available' ? t('st_available') : v.state === 'held' ? t('st_held') : v.state === 'pending' ? t('st_pending') : v.state === 'confirmed_private' ? t('st_private') : v.state === 'confirmed_public' ? `${v.profile?.nickname}, ${v.profile?.sector}` : t('st_closed')
          const tag = sel ? (mineLabel ?? t('st_selected')) : v.state === 'available' ? t('st_available') : v.state === 'confirmed_public' ? `${v.profile?.nickname} · ${v.profile?.sector}` : v.state === 'confirmed_private' ? t('st_private') : v.state === 'held' ? t('st_held') : v.state === 'pending' ? t('st_pending') : ''
          return (
            <button
              key={p.seat} type="button" className={`seat is-${sel ? 'selected' : v.state === 'confirmed_public' ? 'public' : v.state}`} style={style}
              aria-label={`${t('seat_n', { n: p.seat })}: ${stateLabel}`} aria-disabled={!active} tabIndex={decor ? -1 : undefined}
              onClick={() => active && onSeat?.(p.seat, v)}
            >
              {v.state === 'confirmed_public' && !sel ? (
                v.profile?.avatarUrl ? <img className="avatar" src={v.profile.avatarUrl} alt="" loading="lazy" /> : <span className="avatar" aria-hidden>{v.profile?.nickname?.[0]?.toUpperCase()}</span>
              ) : icon ? <img className="ico" src={ICON(`state_${icon}`)} alt="" /> : null}
              {tag && <span className="tag">{tag}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Legend() {
  const { t } = useI18n()
  return (
    <ul className="legend" aria-label="Legend">
      <li><i className="dot available" />{t('st_available')}</li>
      <li><i className="dot sel" />{t('st_selected')}</li>
      <li><i className="dot held" />{t('st_held')}</li>
      <li><i className="dot pending" />{t('st_pending')}</li>
      <li><i className="dot pub" />{t('st_public')}</li>
      <li><i className="dot priv" />{t('st_private')}</li>
    </ul>
  )
}
