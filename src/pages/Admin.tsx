import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../api'
import { useI18n, LANGS, type Key } from '../i18n'
import { FORMATS, FORMAT_KEY, TOPICS, fmtWhen, utcToZoned, zonedToUtc } from '../lib'
import { LangSwitch, Modal, Spinner, useToast } from '../components/Chrome'

type Ev = { id: number; slug: string; title: string; format: string; language: 'ru' | 'en' | 'pl'; topic: string; description: string; benefits: string[]; host: string | null; startsAt: string | null; durationMin: number; timezone: string; capacity: number; meetingUrl: string | null; status: string; isDemo: boolean; seatsTaken: number; seatsFree: number; pending?: number }
type App = { id: number; seat: number; status: string; fullName: string; email: string; company: string; location: string; contact: string | null; goal: string | null; createdAt: string; attended: boolean | null; consent: { publicProfile: boolean; marketing: boolean }; profile: { nickname: string; sector: string; city: string | null; whatIBring: string | null; visible: boolean; hiddenByAdmin: boolean } | null }
type Tab = 'dashboard' | 'events' | 'applications' | 'waitlist' | 'interests' | 'notifications'

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => { fn().then(setData).catch(() => setData(null)) }, [...deps, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  return [data, () => setTick((x) => x + 1)] as const
}

function Login({ onIn }: { onIn: () => void }) {
  const { t } = useI18n()
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState('')
  async function go(e: FormEvent) {
    e.preventDefault(); setErr('')
    try { await api('POST', '/admin/login', { email, password: pw }); onIn() }
    catch (x) { setErr(x instanceof ApiError && x.status === 401 ? t('a_bad') : x instanceof ApiError && x.status === 429 ? t('err_rate') : t('err_generic')) }
  }
  return (
    <form className="admin-login form" onSubmit={go}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="eyebrow">THE NEXT TABLE</span><LangSwitch /></div>
      <h1>{t('a_login')}</h1>
      <div className="field"><label htmlFor="a-e">{t('a_email')}</label><input id="a-e" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="field"><label htmlFor="a-p">{t('a_password')}</label><input id="a-p" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn btn-primary">{t('a_signin')}</button>
    </form>
  )
}

export default function Admin() {
  const { t } = useI18n()
  const [me, setMe] = useState<'loading' | 'out' | { email: string }>('loading')
  const [tab, setTab] = useState<Tab>('dashboard')
  const [evId, setEvId] = useState<number | null>(null)
  const check = useCallback(() => api<{ email: string }>('GET', '/admin/me').then(setMe).catch(() => setMe('out')), [])
  useEffect(() => {
    check()
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex, nofollow'; document.head.append(m)
    document.title = 'Admin — THE NEXT TABLE'
    return () => m.remove()
  }, [check])
  if (me === 'loading') return <Spinner />
  if (me === 'out') return <Login onIn={check} />

  const tabs: [Tab, Key][] = [['dashboard', 'a_dashboard'], ['events', 'a_events'], ['applications', 'a_applications'], ['waitlist', 'a_waitlist'], ['interests', 'a_interests'], ['notifications', 'a_notifications']]
  const open = (id: number, to: Tab) => { setEvId(id); setTab(to) }
  return (
    <div className="admin">
      <aside>
        <div className="brand"><b>THE NEXT TABLE</b><span>Admin</span></div>
        <nav aria-label="Admin">{tabs.map(([k, label]) => <button key={k} className="nv" aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{t(label)}</button>)}</nav>
        <div style={{ marginTop: 'auto', display: 'grid', gap: 10 }}>
          <LangSwitch />
          <span style={{ fontSize: 12, color: '#aaa398', wordBreak: 'break-all' }}>{me.email}</span>
          <button className="btn btn-ghost btn-sm" style={{ color: '#fff', borderColor: '#fff6' }} onClick={() => api('POST', '/admin/logout').then(() => setMe('out'))}>{t('a_signout')}</button>
        </div>
      </aside>
      <main>
        {tab === 'dashboard' && <Dashboard open={open} />}
        {tab === 'events' && <Events open={open} />}
        {tab === 'applications' && <Applications evId={evId} setEvId={setEvId} />}
        {tab === 'waitlist' && <Waitlist evId={evId} setEvId={setEvId} />}
        {tab === 'interests' && <Interests />}
        {tab === 'notifications' && <Notifications />}
      </main>
    </div>
  )
}

function Dashboard({ open }: { open: (id: number, t: Tab) => void }) {
  const { t, locale } = useI18n()
  const [d] = useAsync(() => api<{ totals: Record<string, number>; events: Ev[] }>('GET', '/admin/dashboard'), [])
  if (!d) return <Spinner />
  const s = d.totals
  const stats: [Key, number][] = [['a_stat_apps', s.applications], ['a_stat_pending', s.pendingApproval], ['a_stat_confirmed', s.confirmed], ['a_stat_waiting', s.waiting], ['a_stat_interest', s.interests], ['a_stat_done', s.completedEvents]]
  return (
    <>
      <h1>{t('a_dashboard')}</h1>
      <div className="stats">{stats.map(([k, v]) => <div className="stat" key={k}><b>{v}</b><span>{t(k)}</span></div>)}</div>
      <h2 style={{ fontSize: 26, marginBottom: 12 }}>{t('a_upcoming')}</h2>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>{t('a_title')}</th><th>{t('a_status')}</th><th>{t('fact_date')}</th><th>{t('fact_seats')}</th><th>{t('a_stat_pending')}</th><th /></tr></thead>
        <tbody>{d.events.map((e) => (
          <tr key={e.id}><td><b>{e.title}</b> {e.isDemo && <span className="pill demo">DEMO</span>}</td><td>{t(`st_${e.status}` as Key)}</td><td>{fmtWhen(e, locale) ?? t('date_tba_label')}</td><td>{e.seatsTaken} / {e.capacity}</td><td>{e.pending ?? 0}</td>
            <td><button className="btn btn-ghost btn-sm" onClick={() => open(e.id, 'applications')}>{t('a_applications')}</button></td></tr>
        ))}</tbody>
      </table></div>
    </>
  )
}

function EventForm({ ev, onClose, onSaved }: { ev: Ev | null; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useI18n()
  const [f, setF] = useState({
    title: ev?.title ?? '', format: ev?.format ?? 'growth_lab', language: ev?.language ?? lang, topic: ev?.topic ?? 'growth', description: ev?.description ?? '',
    benefits: (ev?.benefits ?? []).join('\n'), host: ev?.host ?? '', timezone: ev?.timezone ?? 'Europe/Warsaw', durationMin: ev?.durationMin ?? 80, capacity: ev?.capacity ?? 8,
    meetingUrl: ev?.meetingUrl ?? '', starts: ev?.startsAt ? utcToZoned(ev.startsAt, ev.timezone) : '',
  })
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f, v: string | number) => setF({ ...f, [k]: v })
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('')
    try {
      const body = { title: f.title, format: f.format, language: f.language, topic: f.topic, description: f.description, benefits: f.benefits.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 3), host: f.host || null, startsAt: f.starts ? zonedToUtc(f.starts, f.timezone) : null, durationMin: Number(f.durationMin), timezone: f.timezone, capacity: Number(f.capacity), meetingUrl: f.meetingUrl || null }
      await (ev ? api('PATCH', `/admin/events/${ev.id}`, body) : api('POST', '/admin/events', body))
      onSaved(); onClose()
    } catch (x) { setErr(x instanceof ApiError ? (x.code === 'capacity_below_occupied' ? 'capacity < occupied seats' : x.issues?.map((i) => `${i.path}: ${i.message}`).join('; ') || x.code) : t('err_generic')) }
  }
  return (
    <Modal onClose={onClose} label={t('a_events')}>
      <h2>{ev ? t('a_edit') : t('a_new_event')}</h2>
      <form className="form" onSubmit={save}>
        <div className="field"><label htmlFor="e-t">{t('a_title')}</label><input id="e-t" value={f.title} onChange={(e) => set('title', e.target.value)} required minLength={3} /></div>
        <div className="two">
          <div className="field"><label htmlFor="e-f">{t('a_format')}</label><select id="e-f" value={f.format} onChange={(e) => set('format', e.target.value)}>{FORMATS.map((x) => <option key={x} value={x}>{t(FORMAT_KEY(x))}</option>)}</select></div>
          <div className="field"><label htmlFor="e-l">{t('a_language')}</label><select id="e-l" value={f.language} onChange={(e) => set('language', e.target.value)}>{LANGS.map((x) => <option key={x} value={x}>{t(`lang_${x}` as Key)}</option>)}</select></div>
        </div>
        <div className="field"><label htmlFor="e-tp">{t('a_topic')}</label><select id="e-tp" value={f.topic} onChange={(e) => set('topic', e.target.value)}>{TOPICS.map((x) => <option key={x} value={x}>{t(`topic_${x}` as Key)}</option>)}</select></div>
        <div className="field"><label htmlFor="e-d">{t('a_desc')}</label><textarea id="e-d" value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={1200} /></div>
        <div className="field"><label htmlFor="e-b">{t('a_benefits')}</label><textarea id="e-b" value={f.benefits} onChange={(e) => set('benefits', e.target.value)} /></div>
        <div className="two">
          <div className="field"><label htmlFor="e-s">{t('a_starts')}</label><input id="e-s" type="datetime-local" value={f.starts} onChange={(e) => set('starts', e.target.value)} /></div>
          <div className="field"><label htmlFor="e-z">{t('a_tz')}</label><input id="e-z" value={f.timezone} onChange={(e) => set('timezone', e.target.value)} /></div>
        </div>
        <div className="two">
          <div className="field"><label htmlFor="e-du">{t('a_duration')}</label><input id="e-du" type="number" min={15} max={240} value={f.durationMin} onChange={(e) => set('durationMin', e.target.value)} /></div>
          <div className="field"><label htmlFor="e-c">{t('a_capacity')}</label><input id="e-c" type="number" min={6} max={18} value={f.capacity} onChange={(e) => set('capacity', e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="e-h">{t('a_host')}</label><input id="e-h" value={f.host} onChange={(e) => set('host', e.target.value)} /></div>
        <div className="field"><label htmlFor="e-m">{t('a_meeting')}</label><input id="e-m" type="url" value={f.meetingUrl} onChange={(e) => set('meetingUrl', e.target.value)} placeholder="https://" /></div>
        {err && <p className="notice error" role="alert">{err}</p>}
        <div className="inline" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-ghost" onClick={onClose}>{t('a_cancel')}</button><button className="btn btn-primary">{t('a_save')}</button></div>
      </form>
    </Modal>
  )
}

function Events({ open }: { open: (id: number, t: Tab) => void }) {
  const { t, locale } = useI18n()
  const [list, reload] = useAsync(() => api<Ev[]>('GET', '/admin/events'), [])
  const [edit, setEdit] = useState<Ev | null | 'new'>(null)
  const toast = useToast()
  if (!list) return <Spinner />
  const setStatus = async (e: Ev, status: string, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return
    try { await api('POST', `/admin/events/${e.id}/status`, { status }); reload(); toast.show(t('a_done')) } catch { toast.show(t('a_error'), true) }
  }
  const del = async (e: Ev) => { if (!confirm(t('a_confirm'))) return; try { await api('DELETE', `/admin/events/${e.id}`); reload() } catch { toast.show(t('a_error'), true) } }
  return (
    <>
      <h1>{t('a_events')}</h1>
      <div className="row-actions"><button className="btn btn-primary" onClick={() => setEdit('new')}>+ {t('a_new_event')}</button></div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>{t('a_title')}</th><th>{t('a_status')}</th><th>{t('fact_date')}</th><th>{t('fact_seats')}</th><th>{t('a_actions')}</th></tr></thead>
        <tbody>{list.map((e) => (
          <tr key={e.id}>
            <td><b>{e.title}</b><br /><span className="muted">{t(FORMAT_KEY(e.format as never))} · {e.language.toUpperCase()} {e.isDemo && '· DEMO'}</span></td>
            <td>{t(`st_${e.status}` as Key)}</td><td>{fmtWhen(e, locale) ?? t('date_tba_label')}</td><td>{e.seatsTaken} / {e.capacity}</td>
            <td><div className="acts">
              <button className="btn btn-ghost btn-sm" onClick={() => setEdit(e)}>{t('a_edit')}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => open(e.id, 'applications')}>{t('a_applications')}</button>
              {e.status === 'draft' && <button className="btn btn-primary btn-sm" onClick={() => setStatus(e, 'published')}>{t('a_publish')}</button>}
              {e.status === 'published' && <><button className="btn btn-ghost btn-sm" onClick={() => setStatus(e, 'registration_closed')}>{t('a_close_reg')}</button><button className="btn btn-ghost btn-sm" onClick={() => setStatus(e, 'draft')}>{t('a_hide')}</button></>}
              {e.status === 'registration_closed' && <button className="btn btn-ghost btn-sm" onClick={() => setStatus(e, 'published')}>{t('a_reopen')}</button>}
              {['published', 'registration_closed'].includes(e.status) && <><button className="btn btn-ghost btn-sm" onClick={() => setStatus(e, 'completed', t('a_confirm'))}>{t('a_complete')}</button><button className="btn btn-danger btn-sm" onClick={() => setStatus(e, 'cancelled', t('a_confirm'))}>{t('a_cancel_event')}</button></>}
              {e.status === 'draft' && <button className="btn btn-danger btn-sm" onClick={() => del(e)}>{t('a_delete')}</button>}
            </div></td>
          </tr>
        ))}</tbody>
      </table></div>
      {edit && <EventForm ev={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={reload} />}
      {toast.node}
    </>
  )
}

function EventPicker({ evId, setEvId }: { evId: number | null; setEvId: (n: number) => void }) {
  const { t } = useI18n()
  const [list] = useAsync(() => api<Ev[]>('GET', '/admin/events'), [])
  useEffect(() => { if (list?.length && evId === null) setEvId(list[0].id) }, [list, evId, setEvId])
  return (
    <div className="field" style={{ maxWidth: 480, marginBottom: 14 }}>
      <label htmlFor="pick-ev">{t('a_pick_event')}</label>
      <select id="pick-ev" value={evId ?? ''} onChange={(e) => setEvId(Number(e.target.value))}>{list?.map((e) => <option key={e.id} value={e.id}>{e.title} ({t(`st_${e.status}` as Key)})</option>)}</select>
    </div>
  )
}

function Applications({ evId, setEvId }: { evId: number | null; setEvId: (n: number) => void }) {
  const { t, locale } = useI18n()
  const [apps, reload] = useAsync(() => (evId ? api<App[]>('GET', `/admin/events/${evId}/applications`) : Promise.resolve([] as App[])), [evId])
  const toast = useToast()
  const post = async (path: string, body?: unknown, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return
    try { await api('POST', `/admin/applications/${path}`, body ?? {}); reload(); toast.show(t('a_done')) }
    catch (x) { toast.show(x instanceof ApiError ? x.code : t('a_error'), true) }
  }
  return (
    <>
      <h1>{t('a_applications')}</h1>
      <EventPicker evId={evId} setEvId={setEvId} />
      {evId && <div className="row-actions"><a className="btn btn-ghost btn-sm" href={`/api/admin/events/${evId}/applications.csv`}>{t('a_csv')}</a></div>}
      {!apps ? <Spinner /> : apps.length === 0 ? <p className="muted">{t('a_none')}</p> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>{t('a_seat')}</th><th>{t('a_name')}</th><th>{t('a_company')}</th><th>{t('a_status')}</th><th>{t('a_consent')}</th><th>{t('a_actions')}</th></tr></thead>
          <tbody>{apps.map((a) => (
            <tr key={a.id}>
              <td>{a.seat}</td>
              <td><b>{a.fullName}</b><br />{a.email}<br /><span className="muted">{a.location}{a.contact ? ` · ${a.contact}` : ''}</span>{a.goal && <><br /><em>{a.goal}</em></>}<br /><span className="muted" style={{ fontSize: 11 }}>{new Date(a.createdAt).toLocaleString(locale)}</span></td>
              <td>{a.company}</td>
              <td><span className="pill">{t(`s_${a.status}` as Key)}</span></td>
              <td>{a.profile ? <>{a.profile.visible ? t('a_yes') : t('a_no')}{a.profile.hiddenByAdmin && ' (hidden)'}<br /><b>{a.profile.nickname}</b> · {a.profile.sector}{a.profile.whatIBring && <><br /><em>“{a.profile.whatIBring}”</em></>}</> : t('a_no')}<br /><span className="muted">{t('a_marketing')}: {a.consent.marketing ? t('a_yes') : t('a_no')}</span></td>
              <td><div className="acts">
                {a.status === 'pending_email' && <button className="btn btn-ghost btn-sm" onClick={() => post(`${a.id}/verify-email`)}>{t('a_verify')}</button>}
                {a.status === 'pending_approval' && <button className="btn btn-primary btn-sm" onClick={() => post(`${a.id}/approve`)}>{t('a_approve')}</button>}
                {['pending_approval', 'pending_email'].includes(a.status) && <button className="btn btn-danger btn-sm" onClick={() => post(`${a.id}/reject`, {}, t('a_confirm'))}>{t('a_reject')}</button>}
                {['pending_email', 'pending_approval', 'approved'].includes(a.status) && <>
                  <button className="btn btn-ghost btn-sm" onClick={() => { const n = Number(prompt(t('a_reassign_prompt'))); if (n) post(`${a.id}/reassign`, { seat: n }) }}>{t('a_reassign')}</button>
                  <button className="btn btn-danger btn-sm" onClick={() => post(`${a.id}/release`, {}, t('a_confirm'))}>{t('a_release')}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => post(`${a.id}/revoke-link`, {}, t('a_confirm'))}>{t('a_revoke')}</button></>}
                {a.profile && <button className="btn btn-ghost btn-sm" onClick={() => post(`${a.id}/hide-profile`, { hidden: !a.profile!.hiddenByAdmin })}>{a.profile.hiddenByAdmin ? t('a_show_profile') : t('a_hide_profile')}</button>}
                {a.status === 'approved' && <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={!!a.attended} onChange={(e) => post(`${a.id}/attendance`, { attended: e.target.checked })} />{t('a_attended')}</label>}
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {toast.node}
    </>
  )
}

function Waitlist({ evId, setEvId }: { evId: number | null; setEvId: (n: number) => void }) {
  const { t, locale } = useI18n()
  const [rows, reload] = useAsync(() => (evId ? api<any[]>('GET', `/admin/events/${evId}/waitlist`) : Promise.resolve([])), [evId])
  const toast = useToast()
  const act = async (path: string) => { try { await api('POST', `/admin/waitlist/${path}`, {}); reload(); toast.show(t('a_done')) } catch (x) { toast.show(x instanceof ApiError ? x.code : t('a_error'), true) } }
  return (
    <>
      <h1>{t('a_waitlist')}</h1>
      <EventPicker evId={evId} setEvId={setEvId} />
      {!rows ? <Spinner /> : rows.length === 0 ? <p className="muted">{t('a_none')}</p> : (
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{t('a_name')}</th><th>{t('a_email')}</th><th>{t('a_status')}</th><th>{t('a_when')}</th><th /></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.email}</td><td>{r.status === 'offered' ? t('a_offered') : r.status}</td><td>{new Date(r.created_at).toLocaleString(locale)}</td>
            <td><div className="acts"><button className="btn btn-primary btn-sm" onClick={() => act(`${r.id}/offer`)}>{t('a_offer')}</button><button className="btn btn-ghost btn-sm" onClick={() => act(`${r.id}/remove`)}>{t('a_remove')}</button></div></td></tr>)}</tbody></table></div>
      )}
      {toast.node}
    </>
  )
}

function Interests() {
  const { t, locale } = useI18n()
  const [rows] = useAsync(() => api<any[]>('GET', '/admin/interests'), [])
  if (!rows) return <Spinner />
  return (
    <>
      <h1>{t('a_interests')}</h1>
      {rows.length === 0 ? <p className="muted">{t('a_none')}</p> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{t('a_email')}</th><th>{t('a_title')}</th><th>{t('a_marketing')}</th><th>{t('a_when')}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{r.email}</td><td>{r.event ?? '—'}</td><td>{r.marketing_consent ? t('a_yes') : t('a_no')}</td><td>{new Date(r.created_at).toLocaleString(locale)}</td></tr>)}</tbody></table></div>}
    </>
  )
}

function Notifications() {
  const { t, locale } = useI18n()
  const [s] = useAsync(() => api<any>('GET', '/admin/settings'), [])
  const [log] = useAsync(() => api<any[]>('GET', '/admin/notifications'), [])
  if (!s || !log) return <Spinner />
  return (
    <>
      <h1>{t('a_notifications')}</h1>
      <div className="panel stack" style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 22 }}>{t('a_mail_status')}</h2>
        {s.mail.configured ? <p className="notice ok">{t('a_mail_ok')}</p> : <p className="notice warn">{t('a_mail_off')}<code>{s.mail.needs.join(', ')}</code></p>}
        <p>{t('a_organizer')}: <b>{s.organizerEmail}</b></p>
        <p className="muted">{t('a_spam')}</p>
      </div>
      <h2 style={{ fontSize: 24, marginBottom: 10 }}>{t('a_log')}</h2>
      {log.length === 0 ? <p className="muted">{t('a_none')}</p> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{t('a_when')}</th><th>{t('a_to')}</th><th>{t('a_subject')}</th><th>{t('a_status')}</th></tr></thead>
        <tbody>{log.map((n) => <tr key={n.id}><td>{new Date(n.created_at).toLocaleString(locale)}</td><td>{n.to_email}</td><td>{n.subject}<br /><span className="muted">{n.type} · {n.locale}</span></td>
          <td><span className={`pill ${n.status === 'sent' ? 'sage' : n.status === 'failed' ? 'ox' : 'warn'}`}>{n.status === 'sent' ? t('a_sent') : n.status === 'failed' ? t('a_failed') : t('a_not_configured')}</span>{n.error && <><br /><span className="err">{n.error}</span></>}</td></tr>)}</tbody></table></div>}
    </>
  )
}
