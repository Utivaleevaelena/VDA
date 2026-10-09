import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError, type EventPublic, type SeatView } from '../api'
import { useI18n, type Key } from '../i18n'
import { FORMAT_KEY, ICON, fmtWhen } from '../lib'
import { Legend, TableStage } from '../components/TableStage'
import { BookingModal, type Hold } from '../components/BookingModal'
import { InterestForm } from '../components/InterestForm'
import { Spinner, useToast } from '../components/Chrome'
import { statusOf } from '../components/EventCard'

type Payload = { event: EventPublic; seats: SeatView[]; holdMinutes: number }

function SeatList({ seats, selected, onPick, onProfile }: { seats: SeatView[]; selected: number | null; onPick: (n: number) => void; onProfile: (s: SeatView) => void }) {
  const { t } = useI18n()
  return (
    <ul className="seat-list">
      {seats.map((s) => {
        const sel = selected === s.seat
        const text = sel ? t('st_selected') : s.state === 'available' ? t('st_available') : s.state === 'held' ? t('st_held') : s.state === 'pending' ? t('st_pending') : s.state === 'confirmed_private' ? t('st_private') : s.state === 'confirmed_public' ? `${s.profile?.nickname} · ${s.profile?.sector}` : t('st_closed')
        const actionable = s.state === 'available' || s.state === 'confirmed_public' || sel
        return (
          <li key={s.seat}>
            <button type="button" disabled={!actionable} aria-label={`${t('seat_n', { n: s.seat })}: ${text}`} onClick={() => (s.state === 'confirmed_public' ? onProfile(s) : onPick(s.seat))}>
              <span className="no">{String(s.seat).padStart(2, '0')}</span><span className="nm">{text}</span>{actionable && <span className="go" aria-hidden>→</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function ProfileCard({ seat, onClose }: { seat: SeatView; onClose: () => void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [onClose])
  const p = seat.profile!
  return (
    <div className="pcard" role="dialog" aria-label={p.nickname} ref={ref} tabIndex={-1}>
      <button className="x" type="button" onClick={onClose} aria-label={t('card_close')}>×</button>
      <div className="pc-top">
        {p.avatarUrl ? <img className="avatar-lg" src={p.avatarUrl} alt="" /> : <span className="avatar-lg" aria-hidden>{p.nickname[0]?.toUpperCase()}</span>}
        <div><b>{p.nickname}</b><span>{p.sector}</span></div>
      </div>
      <hr />
      <p className="lock"><img src={ICON('lock')} alt="" />{t('card_bring_locked')}</p>
    </div>
  )
}

function Waitlist({ slug }: { slug: string }) {
  const { t, lang } = useI18n()
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [ok, setOk] = useState(false); const [consent, setConsent] = useState(false); const [err, setErr] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('')
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email)) return setErr(t('err_email'))
    if (!consent) return setErr(t('err_consent'))
    try { await api('POST', `/events/${slug}/waitlist`, { name, email, locale: lang, consent: true }); setOk(true) }
    catch (x) { setErr(x instanceof ApiError && x.code === 'already_waiting' ? t('waitlist_dup') : x instanceof ApiError && x.status === 0 ? t('err_network') : t('err_generic')) }
  }
  if (ok) return <p className="notice ok" role="status">{t('waitlist_done')}</p>
  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="w-name">{t('f_name')}</label><input id="w-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
      <div className="field"><label htmlFor="w-mail">{t('f_email')}</label><input id="w-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
      <label className="consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>{t('c_waitlist')}</span></label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn btn-primary">{t('waitlist_btn')}</button>
    </form>
  )
}

export default function EventPage() {
  const { slug = '' } = useParams()
  const { t, locale, names } = useI18n()
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<'' | 'notfound' | 'other'>('')
  const [hold, setHold] = useState<Hold | null>(null)
  const [card, setCard] = useState<SeatView | null>(null)
  const [list, setList] = useState(false)
  const [local, setLocal] = useState(false)
  const holdRef = useRef<Hold | null>(null)
  const toast = useToast()
  const [search, setSearch] = useSearchParams()
  const autoPicked = useRef(false)

  const load = useCallback(async () => {
    try { setData(await api<Payload>('GET', `/events/${slug}`)); setError('') }
    catch (e) { if (e instanceof ApiError && e.status === 404) setError('notfound'); else if (!data) setError('other') }
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, 8000)
    return () => clearInterval(id)
  }, [load])
  useEffect(() => { if (data) document.title = `${data.event.title} — THE NEXT TABLE` }, [data])
  useEffect(() => { holdRef.current = hold }, [hold])
  // Release the hold if the visitor leaves the page.
  useEffect(() => () => { const h = holdRef.current; if (h) navigator.sendBeacon?.(`/api/events/${slug}/holds/release`, new Blob([JSON.stringify({ token: h.token })], { type: 'application/json' })) }, [slug])

  async function pick(seat: number) {
    setCard(null)
    try {
      const h = await api<Hold>('POST', `/events/${slug}/holds`, { seat, previousToken: hold?.token })
      setHold(h)
      load()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'seat_taken') toast.show(t('seat_taken_msg'), true)
      else if (e instanceof ApiError && e.code === 'registration_closed') toast.show(t('err_closed'), true)
      else toast.show(e instanceof ApiError && e.status === 0 ? t('err_network') : e instanceof ApiError && e.status === 429 ? t('err_rate') : t('err_generic'), true)
      load()
    }
  }
  async function closeModal() {
    const h = hold
    setHold(null)
    if (h) await api('POST', `/events/${slug}/holds/release`, { token: h.token }).catch(() => {})
    load()
  }

  // Arrived from the home-page table: take the clicked seat once the event is loaded.
  useEffect(() => {
    const n = Number(search.get('seat'))
    if (!data || autoPicked.current || !n) return
    autoPicked.current = true
    setSearch({}, { replace: true })
    if (data.event.registrationOpen) pick(n)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (error === 'notfound') return <div className="narrow"><h1>{t('event_not_found')}</h1><p className="muted">{t('event_not_found_t')}</p><p style={{ marginTop: 20 }}><Link className="btn btn-ghost" to="/#events">← {t('all_events')}</Link></p></div>
  if (error === 'other' && !data) return <div className="narrow"><p className="notice error">{t('err_generic')}</p><button className="btn btn-ghost" onClick={load}>↻</button></div>
  if (!data) return <Spinner />

  const { event: e, seats } = data
  const st = statusOf(e)
  const when = fmtWhen(e, locale, local)
  const freeSeat = seats.find((s) => s.state === 'available')
  const full = e.startsAt && e.registrationOpen && !freeSeat
  const mine = hold?.seat ?? null
  const reg = e.registrationOpen
  const facts = [e.startsAt ? when! : t('date_tba_label'), names(e.language), `${e.durationMin} ${t('min')}`]

  return (
    <>
      {e.isDemo && <div className="banner" role="note">{t('demo_banner')}</div>}
      <div className="wrap event-top">
        <Link className="crumb" to="/#events">← {t('all_events')}</Link>
        <div className="event-head">
          <div>
            <div className="status-line"><span className="eyebrow">{t(FORMAT_KEY(e.format))}</span><span className={`pill ${st.tone}`}>{t(st.key)}</span>{e.isDemo && <span className="pill demo">{t('demo_tag')}</span>}</div>
            <h1>{e.title}</h1>
          </div>
        </div>
      </div>
      <div className="wrap event-grid">
        <div className="stage-wrap">
          <TableStage
            seatCount={e.capacity} seats={seats} selectedSeat={mine} reveal
            onSeat={(n, v) => (v.state === 'confirmed_public' ? setCard(v) : pick(n))}
            mini="THE NEXT TABLE" title={t(FORMAT_KEY(e.format)).toUpperCase()} question={e.title} facts={facts} benefits={e.benefits}
            label={`${e.title}. ${t('pick_hint')}`}
          />
          <div className="stage-caption"><span>{e.isDemo ? t('stage_demo') : t('stage_live')} · {t('poll_note')}</span><span>THE NEXT TABLE / 01</span></div>
          <Legend />
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-text list-toggle" aria-expanded={list} onClick={() => setList(!list)}>{list ? t('seat_list_hide') : t('seat_list')}</button>
          </div>
          {/* Phones: the list is always visible because small chairs are hard to hit. Elsewhere it is a toggle (also useful for keyboard / screen-reader users). */}
          <div className={`alt-list${list ? ' open' : ''}`}><SeatList seats={seats} selected={mine} onPick={pick} onProfile={setCard} /></div>
        </div>

        <aside className="side" aria-label={t('info_title')}>
          <div className="panel">
            <h2>{t('info_title')}</h2>
            <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>{e.description}</p>
            <ul className="facts">
              <li><img src={ICON('calendar')} alt="" /><span><b>{t('fact_date')}</b><br />{when ?? t('date_tba_label')}</span></li>
              <li><img src={ICON('globe')} alt="" /><span><b>{t('fact_lang')}</b><br />{names(e.language)}</span></li>
              <li><img src={ICON('clock')} alt="" /><span><b>{t('fact_duration')}</b><br />{e.durationMin} {t('min')} · {t('online')}</span></li>
              <li><img src={ICON('users')} alt="" /><span><b>{t('fact_seats')}</b><br />{e.startsAt ? t('seats_count', { taken: e.seatsTaken, cap: e.capacity }) : e.capacity}</span></li>
              {e.host && <li><img src={ICON('sparkles')} alt="" /><span><b>{t('fact_host')}</b><br />{e.host}</span></li>}
            </ul>
            {e.startsAt && <button type="button" className="btn btn-text tz-toggle" onClick={() => setLocal(!local)}>{local ? t('tz_event') : t('tz_mine')}</button>}

            {reg && freeSeat && <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => pick(freeSeat.seat)}>{t('join')} →</button>}
            {reg && freeSeat && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{t('pick_hint')}</p>}
          </div>

          {full && <div className="panel"><h2 style={{ fontSize: 22 }}>{t('full_title')}</h2><p className="muted" style={{ fontSize: 14, margin: '6px 0 14px' }}>{t('full_text')}</p><Waitlist slug={e.slug} /></div>}
          {!e.startsAt && <div className="panel"><h2 style={{ fontSize: 22 }}>{t('tba_title')}</h2><p className="muted" style={{ fontSize: 14, margin: '6px 0 14px' }}>{t('tba_text')}</p><InterestForm eventSlug={e.slug} compact /></div>}
          {e.startsAt && !reg && <div className="panel"><h2 style={{ fontSize: 22 }}>{t('closed_title')}</h2><p className="muted" style={{ fontSize: 14, marginTop: 6 }}>{t('closed_text')}</p></div>}
          <p className="notice">{t('legend_note')}</p>
        </aside>
      </div>

      {card && <ProfileCard seat={card} onClose={() => setCard(null)} />}
      {hold && <BookingModal event={e} hold={hold} onClose={closeModal} onTaken={() => { setHold(null); load() }} />}
      {toast.node}
    </>
  )
}
