import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type EventPublic, type Member, type SeatView } from '../api'
import { useI18n, type Key } from '../i18n'
import { FORMAT_KEY, ICON, fileToDataUrl, fmtWhen } from '../lib'
import { Spinner, useToast } from '../components/Chrome'
import { TableStage } from '../components/TableStage'
import { InterestForm } from '../components/InterestForm'

/** Personal pages are never indexed. */
function useNoIndex(title: string) {
  useEffect(() => {
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex, nofollow'; document.head.append(m)
    document.title = `${title} — THE NEXT TABLE`
    return () => m.remove()
  }, [title])
}

type Me = {
  application: { status: string; seat: number; fullName: string; email: string; locale: string; marketing: boolean }
  event: EventPublic; meetingUrl: string | null
  profile: { nickname: string; sector: string; city: string | null; whatIBring: string | null; hasAvatar: boolean; visible: boolean; hiddenByAdmin: boolean; id: number } | null
  canViewTable: boolean; completed: boolean
}

function useMe(token: string) {
  const [me, setMe] = useState<Me | null>(null)
  const [bad, setBad] = useState(false)
  const load = useCallback(() => api<Me>('GET', `/my/${token}`).then((m) => { setMe(m); setBad(false) }).catch((e) => e instanceof ApiError && e.status === 404 && setBad(true)), [token])
  useEffect(() => { load() }, [load])
  return { me, bad, reload: load }
}

export function MyPage() {
  const { token = '' } = useParams()
  const { t, locale } = useI18n()
  const { me, bad, reload } = useMe(token)
  const toast = useToast()
  useNoIndex(t('my_title'))
  const [form, setForm] = useState({ visible: false, nickname: '', sector: '', city: '', bring: '', avatar: '' })
  useEffect(() => { if (me) setForm({ visible: me.profile?.visible ?? false, nickname: me.profile?.nickname ?? '', sector: me.profile?.sector ?? '', city: me.profile?.city ?? '', bring: me.profile?.whatIBring ?? '', avatar: '' }) }, [me])

  if (bad) return <div className="narrow"><h1>{t('my_invalid')}</h1></div>
  if (!me) return <Spinner />
  const { application: a, event: e, profile: p } = me
  const active = ['pending_email', 'pending_approval', 'approved'].includes(a.status)
  const tone = a.status === 'approved' ? 'sage' : a.status === 'pending_approval' || a.status === 'pending_email' ? 'warn' : 'ox'

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try { await fn(); toast.show(okMsg); reload() } catch (x) { toast.show(x instanceof ApiError && x.status === 0 ? t('err_network') : x instanceof ApiError && x.code === 'profile_required' ? t('err_profile') : t('err_generic'), true) }
  }
  const saveProfile = (ev: FormEvent) => {
    ev.preventDefault()
    if (form.visible && (!form.nickname.trim() || !form.sector.trim())) return toast.show(t('err_profile'), true)
    act(() => api('PUT', `/my/${token}/profile`, { visible: form.visible, nickname: form.nickname, sector: form.sector, city: form.city, whatIBring: form.bring, avatar: form.avatar || undefined }), t('saved'))
  }

  return (
    <div className="narrow stack">
      <div>
        <span className="eyebrow">{t('my_eyebrow')}</span>
        <h1>{t('my_title')}</h1>
        <div className="status-line"><span className={`pill ${tone}`}>{t(`s_${a.status}` as Key)}</span></div>
      </div>
      <dl className="summary">
        <div><dt>{t('my_event')}</dt><dd>{e.title}</dd></div>
        <div><dt>{t('fact_date')}</dt><dd>{fmtWhen(e, locale) ?? t('date_tba_label')}</dd></div>
        <div><dt>{t('my_seat')}</dt><dd>№ {a.seat}</dd></div>
        <div><dt>{t('f_email')}</dt><dd>{a.email}</dd></div>
      </dl>

      {a.status === 'approved' && (
        <div className="panel">
          <h2 style={{ fontSize: 24 }}>{t('my_meet')}</h2>
          {me.meetingUrl ? <p style={{ margin: '8px 0' }}><a href={me.meetingUrl} target="_blank" rel="noopener noreferrer">{me.meetingUrl}</a></p> : <p className="muted" style={{ margin: '8px 0' }}>{t('my_meet_none')}</p>}
          <div className="inline" style={{ marginTop: 12 }}>
            {me.canViewTable && <Link className="btn btn-primary" to={`/my/${token}/table`}>{t('meet_table')} →</Link>}
            {me.completed && <Link className="btn btn-ghost" to={`/my/${token}/next`}>{t('next_eyebrow')} →</Link>}
          </div>
        </div>
      )}

      {active && (
        <form className="panel form" onSubmit={saveProfile}>
          <h2 style={{ fontSize: 24 }}>{t('my_profile')}</h2>
          {!p && <p className="muted" style={{ fontSize: 14 }}>{t('my_profile_none')}</p>}
          {p?.hiddenByAdmin && <p className="notice warn">{t('hidden_by_admin')}</p>}
          <label className="switch"><input type="checkbox" role="switch" checked={form.visible} onChange={(x) => setForm({ ...form, visible: x.target.checked })} /><span className="track" /><span>{t('show_profile')}</span></label>
          {form.visible && (
            <>
              <div className="two">
                <div className="field"><label htmlFor="m-nick">{t('f_nick')}</label><input id="m-nick" maxLength={30} value={form.nickname} onChange={(x) => setForm({ ...form, nickname: x.target.value })} /></div>
                <div className="field"><label htmlFor="m-sec">{t('f_sector')}</label><input id="m-sec" maxLength={60} value={form.sector} onChange={(x) => setForm({ ...form, sector: x.target.value })} /></div>
              </div>
              <div className="field"><label htmlFor="m-city">{t('f_city')}</label><input id="m-city" maxLength={80} value={form.city} onChange={(x) => setForm({ ...form, city: x.target.value })} /></div>
              <div className="field"><label htmlFor="m-bring">{t('bring_title')}</label><textarea id="m-bring" maxLength={160} value={form.bring} onChange={(x) => setForm({ ...form, bring: x.target.value })} /><div className="counter">{form.bring.length} / 160</div></div>
              <div className="field"><label htmlFor="m-av">{t('f_avatar')}</label>
                <div className="avatar-pick">
                  {form.avatar ? <img className="preview" src={form.avatar} alt="" /> : p?.hasAvatar ? <img className="preview" src={`/api/avatars/${p.id}`} alt="" /> : <span className="preview" aria-hidden>·</span>}
                  <input id="m-av" type="file" accept="image/png,image/jpeg,image/webp" onChange={async (x) => { const f = x.target.files?.[0]; if (f && f.size <= 2 * 1024 * 1024) setForm({ ...form, avatar: await fileToDataUrl(f) }); else if (f) toast.show(t('err_avatar'), true) }} />
                </div>
              </div>
            </>
          )}
          <div className="inline"><button className="btn btn-primary">{t('save')}</button>
            {p && <button type="button" className="btn btn-danger" onClick={() => act(() => api('DELETE', `/my/${token}/profile`), t('saved'))}>{t('profile_delete')}</button>}</div>
          {p && <p className="muted" style={{ fontSize: 12.5 }}>{t('profile_delete_note')}</p>}
        </form>
      )}

      <div className="panel stack">
        <label className="switch"><input type="checkbox" role="switch" checked={a.marketing} onChange={(x) => act(() => api('PUT', `/my/${token}/marketing`, { granted: x.target.checked }), t('saved'))} /><span className="track" /><span>{t('marketing_label')}</span></label>
        {active && <div><button className="btn btn-danger" onClick={() => confirm(t('cancel_confirm')) && act(() => api('POST', `/my/${token}/cancel`), t('cancelled_ok'))}>{t('cancel_participation')}</button></div>}
      </div>

      {a.status !== 'cancelled' || a.fullName !== '[deleted]' ? (
        <div className="panel">
          <h2 style={{ fontSize: 22 }}>{t('erase_title')}</h2>
          <p className="muted" style={{ fontSize: 14, margin: '6px 0 12px' }}>{t('erase_text')}</p>
          <button className="btn btn-danger" onClick={() => confirm(t('erase_confirm')) && act(() => api('POST', `/my/${token}/erase`), t('erased_ok'))}>{t('erase_btn')}</button>
        </div>
      ) : null}
      {toast.node}
    </div>
  )
}

export function MyTable() {
  const { token = '' } = useParams()
  const { t } = useI18n()
  const [d, setD] = useState<{ event: EventPublic; seat: number; seats: SeatView[]; members: Member[] } | null>(null)
  const [err, setErr] = useState(false)
  useNoIndex(t('table_eyebrow'))
  useEffect(() => { api('GET', `/my/${token}/table`).then(setD).catch(() => setErr(true)) }, [token])
  if (err) return <div className="narrow"><h1>{t('my_invalid')}</h1></div>
  if (!d) return <Spinner />
  return (
    <div className="wrap" style={{ paddingBlock: '40px 90px' }}>
      <Link className="crumb" to={`/my/${token}`}>← {t('table_back')}</Link>
      <span className="eyebrow" style={{ display: 'block', marginTop: 18 }}>{t('table_eyebrow')}</span>
      <h1 style={{ fontSize: 'clamp(34px,5vw,60px)', margin: '10px 0 8px' }}>{d.event.title}</h1>
      <p className="muted" style={{ maxWidth: 620 }}>{t('table_note')}</p>
      <div className="tablerow" style={{ maxWidth: 980, marginInline: 'auto' }}>
        <TableStage seatCount={d.event.capacity} seats={d.seats} selectedSeat={d.seat} mineLabel={t('your_seat')} reveal mini="THE NEXT TABLE" title={t(FORMAT_KEY(d.event.format)).toUpperCase()} question={d.event.title} />
      </div>
      <h2 style={{ fontSize: 34, marginTop: 28 }}>{t('about_to_meet')}</h2>
      {d.members.length === 0 ? <p className="notice" style={{ marginTop: 14 }}>{t('table_none')}</p> : (
        <div className="members">
          {d.members.map((m, i) => (
            <article className="member" key={m.seat} style={{ ['--i' as any]: i }}>
              <div className="row">
                {m.avatarUrl ? <img className="avatar-lg" src={m.avatarUrl} alt="" /> : <span className="avatar-lg" aria-hidden>{m.nickname[0]?.toUpperCase()}</span>}
                <div><b>{m.nickname}</b><small>{m.sector}</small>{m.city && <small>{m.city}</small>}</div>
              </div>
              {m.whatIBring && <div><span className="eyebrow" style={{ fontSize: 10 }}>What I bring to the table</span><q>{m.whatIBring}</q></div>}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

export function NextSeat() {
  const { token = '' } = useParams()
  const { t, locale } = useI18n()
  const [recs, setRecs] = useState<EventPublic[] | null>(null)
  const [err, setErr] = useState(false)
  useNoIndex(t('next_eyebrow'))
  useEffect(() => { api<{ recommendations: EventPublic[] }>('GET', `/my/${token}/next-seat`).then((r) => setRecs(r.recommendations)).catch(() => setErr(true)) }, [token])
  if (err) return <div className="narrow"><h1>{t('my_invalid')}</h1></div>
  if (!recs) return <Spinner />
  return (
    <div className="narrow">
      <div className="thanks-mark"><img src={ICON('check')} alt="" /></div>
      <span className="eyebrow">{t('next_eyebrow')}</span>
      <h1>{t('next_title')}</h1>
      <p className="muted" style={{ fontSize: 18, marginBottom: 28 }}>{t('next_p')}</p>
      {recs.length === 0 ? (
        <div className="empty"><p className="muted">{t('next_none')}</p><div style={{ width: 'min(100%,420px)', textAlign: 'left' }}><InterestForm compact /></div></div>
      ) : (
        <div className="event-list">
          {recs.map((e) => (
            <article className="ecard" key={e.id} style={{ gridTemplateColumns: '1fr auto' }}>
              <div>
                <span className="eyebrow">{t(FORMAT_KEY(e.format))}</span>
                <h3 style={{ margin: '8px 0' }}>{e.title}</h3>
                <p className="muted" style={{ fontSize: 14 }}>{fmtWhen(e, locale)} · {t(`lang_${e.language}` as Key)} · {t('next_free', { n: e.seatsFree })}</p>
              </div>
              <Link className="btn btn-primary" to={`/events/${e.slug}`}>{t('next_cta')} →</Link>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

export function Verify() {
  const { token = '' } = useParams()
  const { t } = useI18n()
  const nav = useNavigate()
  const [s, setS] = useState<'wait' | 'ok' | 'bad' | 'expired'>('wait')
  useNoIndex(t('verify_title'))
  useEffect(() => {
    api('POST', '/verify', { token }).then(() => setS('ok')).catch((e) => setS(e instanceof ApiError && e.status === 410 ? 'expired' : 'bad'))
  }, [token])
  return (
    <div className="narrow">
      <span className="eyebrow">{t('verify_title')}</span>
      {s === 'wait' ? <Spinner /> : (
        <>
          <h1>{s === 'ok' ? '✓' : '—'}</h1>
          <p className={`notice ${s === 'ok' ? 'ok' : 'error'}`} role="status">{s === 'ok' ? t('verify_ok') : s === 'expired' ? t('verify_expired') : t('verify_bad')}</p>
          <p style={{ marginTop: 20 }}><button className="btn btn-ghost" onClick={() => nav('/#events')}>{t('verify_go')} →</button></p>
        </>
      )}
    </div>
  )
}

export function Privacy() {
  const { t } = useI18n()
  useEffect(() => { document.title = `${t('privacy_title')} — THE NEXT TABLE` }, [t])
  return (
    <div className="narrow prose">
      <span className="eyebrow">THE NEXT TABLE</span>
      <h1>{t('privacy_title')}</h1>
      <p className="notice warn">{t('privacy_draft')}</p>
      {([1, 2, 3, 4, 5, 6] as const).map((n) => <section key={n}><h2>{t(`p_h${n}` as Key)}</h2><p>{t(`p_t${n}` as Key)}</p></section>)}
    </div>
  )
}
