import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError, type EventPublic, type SeatView } from '../api'
import { useI18n, type Key, type Lang } from '../i18n'
import { FORMATS, FORMAT_KEY, ICON, fmtDay, fmtWhen } from '../lib'
import { ProfileCard } from './EventPage'
import { FiltersPanel, NO_FILTERS, applyFilters, type Filters } from '../components/FiltersPanel'
import { TableStage } from '../components/TableStage'
import { EventCard } from '../components/EventCard'
import { EuropeMap } from '../components/EuropeMap'
import { InterestForm } from '../components/InterestForm'
import { Spinner } from '../components/Chrome'

const ILLUSTRATION_SEATS: SeatView[] = [
  { seat: 1, state: 'confirmed_public', profile: { nickname: 'Marta', sector: 'branding', avatarUrl: '/assets/avatars/avatar_marta.png' } },
  { seat: 2, state: 'confirmed_public', profile: { nickname: 'Nina', sector: 'e-commerce', avatarUrl: '/assets/avatars/avatar_nina.png' } },
  { seat: 3, state: 'confirmed_public', profile: { nickname: 'Alex', sector: 'SaaS', avatarUrl: '/assets/avatars/avatar_alex.png' } },
  { seat: 4, state: 'available' },
  { seat: 5, state: 'confirmed_public', profile: { nickname: 'Lena', sector: 'product', avatarUrl: '/assets/avatars/avatar_lena.png' } },
  { seat: 6, state: 'confirmed_private' },
  { seat: 7, state: 'confirmed_public', profile: { nickname: 'Dima', sector: 'marketing', avatarUrl: '/assets/avatars/avatar_dima.png' } },
  { seat: 8, state: 'available' },
]

function NextEventPanel({ next }: { next?: EventPublic }) {
  const { t, locale, names } = useI18n()
  if (!next)
    return (
      <div className="panel next-panel">
        <span className="eyebrow">{t('next_table_label')}</span>
        <p className="muted" style={{ margin: '12px 0 18px', fontSize: 14 }}>{t('panel_empty')}</p>
        <a className="btn btn-primary" style={{ width: '100%' }} href="#connect">{t('subscribe')} →</a>
      </div>
    )
  return (
    <div className="panel next-panel">
      <span className="eyebrow">{t('next_table_label')}</span>
      <div className="big-seats"><b>{next.capacity}</b><span>{t('seats_at_table', { n: '' }).trim()}</span></div>
      <ul className="facts">
        <li><img src={ICON('calendar')} alt="" /><span>{fmtWhen(next, locale)}</span></li>
        <li><img src={ICON('video')} alt="" /><span>{t('online')} · {next.durationMin} {t('min')}</span></li>
        <li><img src={ICON('globe')} alt="" /><span>{names(next.language)}</span></li>
        <li><img src={ICON('users')} alt="" /><span>{t('seats_count', { taken: next.seatsTaken, cap: next.capacity })}</span></li>
      </ul>
      <Link className="btn btn-primary" style={{ width: '100%' }} to={`/events/${next.slug}`}>{t('join_table')} →</Link>
    </div>
  )
}

/** Real table of the next meeting: live seat states from the server; choosing a free chair continues on the meeting page. */
function LiveStage({ event }: { event: EventPublic }) {
  const { t, locale, names } = useI18n()
  const nav = useNavigate()
  const [seats, setSeats] = useState<SeatView[] | null>(null)
  const [card, setCard] = useState<SeatView | null>(null)
  useEffect(() => {
    let stop = false
    const load = () => api<{ seats: SeatView[] }>('GET', `/events/${event.slug}`).then((d) => !stop && setSeats(d.seats)).catch(() => {})
    load()
    const id = setInterval(() => document.visibilityState === 'visible' && load(), 10_000)
    return () => { stop = true; clearInterval(id) }
  }, [event.slug])
  const benefits = event.benefits.length ? event.benefits : [t('c1t'), t('c2t'), t('c3t')]
  return (
    <>
      <TableStage
        reveal seatCount={event.capacity} seats={seats ?? undefined} mini="THE NEXT TABLE" title={t(FORMAT_KEY(event.format)).toUpperCase()} question={event.title}
        facts={[fmtWhen(event, locale) ?? '', names(event.language), `${event.durationMin} ${t('min')}`]} benefits={benefits}
        onSeat={(n, v) => (v.state === 'confirmed_public' ? setCard(v) : nav(`/events/${event.slug}?seat=${n}`))}
        label={`${event.title}. ${t('pick_hint')}`}
      />
      <div className="stage-caption"><span>{t('stage_live')}</span><span>THE NEXT TABLE / 01</span></div>
      {card && <ProfileCard seat={card} onClose={() => setCard(null)} />}
    </>
  )
}

function Hero({ f, setF, next }: { f: Filters; setF: (f: Filters) => void; next?: EventPublic }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  // Gentle parallax on the table; the composition is fully readable without it.
  const onMove = (e: React.PointerEvent) => {
    if (reduce || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5
    ref.current.style.transform = `perspective(1600px) rotateX(${(-y * 3).toFixed(2)}deg) rotateY(${(x * 4).toFixed(2)}deg)`
  }
  return (
    <section className="hero2" aria-labelledby="hero-title">
      <div className="wrap">
        <div className="hero2-head">
          <span className="eyebrow">{t('hero_info')}</span>
          <h1 id="hero-title"><span className="h1-a">{t('hero_t1')}</span><span className="h1-b">{t('hero_t2')}</span></h1>
          <p className="deck">{t('hero_deck1')}</p>
          <p className="hero-more"><a href="#formats">{t('hero_cta2')} ↓</a></p>
        </div>
        <div className="script-note" aria-hidden>
          {t('script_note').split('|').map((l, i) => <span key={i}>{l}</span>)}
          <svg viewBox="0 0 140 40" className="scribble"><path d="M4 30 C 40 6, 90 4, 136 10 M30 36 C 60 24, 100 22, 130 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
        </div>
        <div className="hero2-grid">
          <div className="hero-filters"><FiltersPanel f={f} setF={setF} id="hf" /></div>
          <div className="hero-stage" onPointerMove={onMove} onPointerLeave={() => ref.current && (ref.current.style.transform = '')}>
            <div ref={ref} style={{ transition: 'transform .4s ease-out' }}>
              {next ? <LiveStage event={next} /> : (
                <>
                  <TableStage decor reveal seatCount={8} seats={ILLUSTRATION_SEATS} selectedSeat={8} mineLabel={t('ill_selected')} mini="THE NEXT TABLE" title="DIFFERENT MINDS." question="One table."
                    benefits={[t('c1t'), t('c2t'), t('c3t')]} label={t('ill_note')} />
                  <div className="float-card" aria-hidden>
                    <div className="pc-top"><img className="avatar-lg" src="/assets/avatars/avatar_alex.png" alt="" /><div><b>Alex</b><span>SaaS</span><span className="loc"><img src={ICON('map-pin')} alt="" />{t('ill_city')}</span></div></div>
                    <p>{t('ill_bring')}</p>
                  </div>
                  <div className="stage-caption"><span>{t('ill_note')}</span><span>THE NEXT TABLE / 01</span></div>
                </>
              )}
            </div>
          </div>
          <NextEventPanel next={next} />
        </div>
      </div>
    </section>
  )
}

function OtherTables({ events }: { events: EventPublic[] }) {
  const { t, locale } = useI18n()
  const items = events.filter((e) => e.startsAt).slice(0, 4)
  const shown = items.length ? items : events.slice(0, 4)
  if (!shown.length) return null
  return (
    <section className="other-tables" aria-labelledby="other-t">
      <div className="wrap">
        <div className="section-head2"><h2 id="other-t">{t('other_tables')}</h2><a className="btn btn-text btn-sm" href="#events">{t('all_events_link')} →</a></div>
        <div className="strip">
          {shown.map((e) => (
            <Link key={e.id} to={`/events/${e.slug}`} className="strip-item">
              <span className="thumb"><MiniTable n={Math.min(e.capacity, 12)} /></span>
              <span className="body">
                <span className="tag">{t(FORMAT_KEY(e.format))}</span>
                <b>{e.title}</b>
                <small>{e.startsAt ? fmtDay(e.startsAt, locale, e.timezone) : t('date_tba_label')} · {e.startsAt ? t('seats_count', { taken: e.seatsTaken, cap: e.capacity }) : e.capacity}</small>
              </span>
              <span className="go" aria-hidden>›</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

function Idea() {
  const { t } = useI18n()
  return (
    <section className="section" id="idea" aria-labelledby="idea-t">
      <div className="wrap">
        <div className="section-head">
          <div><span className="eyebrow">{t('idea_eyebrow')}</span><h2 id="idea-t">{t('idea_title')}</h2></div>
          <p>{t('idea_p')}</p>
        </div>
        <div className="cards3">
          {(['c1', 'c2', 'c3'] as const).map((k, i) => (
            <div className="card" key={k}><span className="num">0{i + 1}</span><h3>{t(`${k}t`)}</h3><p>{t(`${k}d`)}</p></div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Catalog({ events, error, reload, f, setF }: { events: EventPublic[] | null; error: string; reload: () => void; f: Filters; setF: (f: Filters) => void }) {
  const { t } = useI18n()
  const list = useMemo(() => applyFilters(events ?? [], f), [events, f])
  return (
    <section className="section" id="events" aria-labelledby="find-t">
      <div className="wrap">
        <div className="section-head">
          <div><span className="eyebrow">{t('find_eyebrow')}</span><h2 id="find-t">{t('find_title')}</h2></div>
          <p>{t('find_sub')}</p>
        </div>
        <div className="catalog">
          <div className="catalog-filters"><FiltersPanel f={f} setF={setF} id="cf" /></div>
          <div aria-live="polite">
            {error ? (
              <div className="empty"><p className="err">{error}</p><button className="btn btn-ghost" onClick={reload}>↻</button></div>
            ) : !events ? <Spinner /> : events.length === 0 ? (
              <div className="empty"><h3>{t('no_events_title')}</h3><p className="muted">{t('no_events_text')}</p><div style={{ width: 'min(100%, 420px)', textAlign: 'left' }}><InterestForm compact /></div></div>
            ) : list.length === 0 ? (
              <div className="empty"><h3>{t('no_match_title')}</h3><p className="muted">{t('no_match_text')}</p><button className="btn btn-ghost" onClick={() => setF(NO_FILTERS)}>{t('f_reset')}</button></div>
            ) : (
              <div className="event-list">{list.map((e) => <EventCard key={e.id} e={e} />)}</div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

const PROGRAM: [string, string][] = [['00–08', 'Welcome & Introductions'], ['08–18', 'Business Pulse'], ['18–40', 'Hot Seat 1'], ['40–62', 'Hot Seat 2'], ['62–73', 'Breakout Connections'], ['73–80', 'One Next Move']]
const SEATS_DRAWN: Record<string, number> = { hot_seat: 7, growth_lab: 10, business_match: 14, digital_clinic: 10 }

function MiniTable({ n }: { n: number }) {
  return (
    <svg className="mini-table" viewBox="0 0 64 44" aria-hidden>
      <ellipse cx="32" cy="22" rx="20" ry="11" fill="#863f3b" />
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2
        return <rect key={i} x={32 + 27 * Math.cos(a) - 3} y={22 + 17 * Math.sin(a) - 2.5} width="6" height="5" rx="1.5" fill="#f2efe8" stroke="#262724" strokeWidth="1" transform={`rotate(${(a * 180) / Math.PI + 90} ${32 + 27 * Math.cos(a)} ${22 + 17 * Math.sin(a)})`} />
      })}
    </svg>
  )
}

function Experience() {
  const { t } = useI18n()
  return (
    <section className="section" id="formats" aria-labelledby="exp-t">
      <div className="wrap">
        <div className="section-head">
          <div><span className="eyebrow">{t('exp_eyebrow')}</span><h2 id="exp-t">{t('exp_title')}</h2></div>
          <p>{t('exp_sub')}</p>
        </div>
        <div className="formats">
          {FORMATS.map((x) => (
            <div className="format" key={x}>
              <MiniTable n={SEATS_DRAWN[x]} />
              <h3>{t(FORMAT_KEY(x))}</h3>
              <span className="size">{t(`size_${x}` as Key)}</span>
              <p>{t(`desc_${x}` as Key)}</p>
            </div>
          ))}
        </div>
        <div className="program">
          <div><h3>{t('program_title')}</h3><p className="muted">{t('program_note')}</p></div>
          <table>
            <thead><tr><th scope="col">{t('program_time')}</th><th scope="col">{t('program_stage')}</th></tr></thead>
            <tbody>{PROGRAM.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function Languages() {
  const { t } = useI18n()
  return (
    <section className="section" aria-labelledby="lang-t">
      <div className="wrap langs">
        <div>
          <span className="eyebrow">{t('lang_eyebrow')}</span>
          <h2 id="lang-t" style={{ fontSize: 'clamp(32px,4.4vw,60px)', margin: '12px 0 16px' }}>{t('lang_title')}</h2>
          <p className="muted" style={{ fontSize: 17 }}>{t('lang_p')}</p>
          <div className="lang-cards">
            {(['ru', 'en', 'pl'] as Lang[]).map((l) => <div className="lang-card" key={l} lang={l}><b>{t(`lang_${l}` as Key)}</b><span>{t('lang_hint')}</span></div>)}
          </div>
        </div>
        <EuropeMap />
      </div>
    </section>
  )
}

function Behind() {
  const { t } = useI18n()
  return (
    <section className="section" id="about" aria-labelledby="behind-t">
      <div className="wrap behind">
        <div>
          <span className="eyebrow">{t('behind_eyebrow')}</span>
          <h2 id="behind-t" style={{ fontSize: 'clamp(32px,4.4vw,60px)', margin: '12px 0 18px' }}>{t('behind_title')}</h2>
          <p style={{ fontSize: 17, color: '#4f4c46' }}>{t('behind_p')}</p>
          <blockquote>{t('behind_quote')}</blockquote>
        </div>
        <div>
          <ul className="skills">{(['sk1', 'sk2', 'sk3', 'sk4', 'sk5'] as const).map((k, i) => <li key={k}>{t(k)}<span>0{i + 1}</span></li>)}</ul>
          <p style={{ marginTop: 20 }}><a className="btn btn-ghost" href="mailto:elena@pixelexpertsteam.com">{t('behind_contact')} →</a></p>
        </div>
      </div>
    </section>
  )
}

function Connect() {
  const { t } = useI18n()
  return (
    <section className="section" id="connect" aria-labelledby="conn-t">
      <div className="wrap connect">
        <div>
          <span className="eyebrow">{t('connect_eyebrow')}</span>
          <h2 id="conn-t" style={{ fontSize: 'clamp(30px,4vw,54px)', margin: '12px 0 14px' }}>{t('connect_title')}</h2>
          <p className="muted" style={{ marginBottom: 22 }}>{t('connect_p')}</p>
          <InterestForm />
        </div>
        <div className="faq">
          <h3 style={{ fontSize: 28, marginBottom: 14 }}>{t('faq_title')}</h3>
          {([1, 2, 3, 4, 5] as const).map((n) => <details key={n}><summary>{t(`q${n}` as Key)}</summary><p>{t(`a${n}` as Key)}</p></details>)}
          <p style={{ marginTop: 18, fontSize: 14 }}><Link to="/privacy">{t('footer_privacy')}</Link> · <a href="mailto:elena@pixelexpertsteam.com">elena@pixelexpertsteam.com</a></p>
        </div>
      </div>
    </section>
  )
}

export default function Landing() {
  const { t } = useI18n()
  const [events, setEvents] = useState<EventPublic[] | null>(null)
  const [error, setError] = useState('')
  const [f, setF] = useState<Filters>(NO_FILTERS)
  const load = () => {
    setError('')
    api<EventPublic[]>('GET', '/events').then(setEvents).catch((e) => setError(e instanceof ApiError && e.status === 0 ? t('err_network') : t('err_generic')))
  }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps
  const next = events?.find((e) => e.startsAt && e.registrationOpen)
  return (<><Hero f={f} setF={setF} next={next} /><OtherTables events={events ?? []} /><Idea /><Catalog events={events} error={error} reload={load} f={f} setF={setF} /><Experience /><Languages /><Behind /><Connect /></>)
}
