import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type EventPublic } from '../api'
import { useI18n, type Key } from '../i18n'
import { fileToDataUrl, fmtWhen, mmss } from '../lib'
import { Modal } from './Chrome'

export type Hold = { token: string; seat: number; expiresAt: string }
type Form = {
  fullName: string; email: string; company: string; location: string; contact: string; goal: string
  nickname: string; sector: string; city: string; bring: string; avatar: string; show: boolean
  cProcessing: boolean; cPublic: boolean; cMarketing: boolean; website: string
}
const EMPTY: Form = { fullName: '', email: '', company: '', location: '', contact: '', goal: '', nickname: '', sector: '', city: '', bring: '', avatar: '', show: false, cProcessing: false, cPublic: false, cMarketing: false, website: '' }
const ERR_MAP: Record<string, Key> = { seat_taken: 'err_seat_taken', hold_expired: 'err_hold_expired', already_applied: 'err_already', registration_closed: 'err_closed', rate_limited: 'err_rate', bad_avatar: 'err_avatar', avatar_too_large: 'err_avatar' }

export function BookingModal({ event, hold, onClose, onTaken }: { event: EventPublic; hold: Hold; onClose: () => void; onTaken: () => void }) {
  const { t, lang, locale } = useI18n()
  const [step, setStep] = useState(1)
  const [f, setF] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<{ manage: string; mail: boolean } | null>(null)
  const [left, setLeft] = useState(() => new Date(hold.expiresAt).getTime() - Date.now())
  const headRef = useRef<HTMLHeadingElement>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    const id = setInterval(() => setLeft(new Date(hold.expiresAt).getTime() - Date.now()), 1000)
    return () => clearInterval(id)
  }, [hold.expiresAt])
  useEffect(() => { headRef.current?.focus() }, [step, done])
  const expired = left <= 0 && !done

  const fieldErr = (k: string) => errors[k] && <span className="err" role="alert">{errors[k]}</span>
  const bad = (k: string) => !!errors[k] || undefined

  function validate(s: number) {
    const e: Record<string, string> = {}
    if (s === 1) {
      if (!f.fullName.trim()) e.fullName = t('req')
      if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = t('err_email')
      if (!f.company.trim()) e.company = t('req')
      if (!f.location.trim()) e.location = t('req')
    }
    if (s === 2 && f.show) {
      if (!f.nickname.trim()) e.nickname = t('req')
      if (!f.sector.trim()) e.sector = t('req')
    }
    if (s === 3) {
      if (!f.cProcessing) e.cProcessing = t('err_consent')
      if (f.show && !f.cPublic) e.cPublic = t('err_consent')
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }
  const go = (n: number) => { if (n < step || validate(step)) { setStep(n); setFormError('') } }

  async function pickAvatar(file?: File) {
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) return setErrors((e) => ({ ...e, avatar: t('err_avatar') }))
    setErrors((e) => ({ ...e, avatar: '' }))
    set('avatar', await fileToDataUrl(file))
  }

  async function submit() {
    if (!validate(3)) return
    setSending(true); setFormError('')
    try {
      const body = {
        seat: hold.seat, holdToken: hold.token, locale: lang, fullName: f.fullName.trim(), email: f.email.trim(), company: f.company.trim(), location: f.location.trim(),
        contact: f.contact, goal: f.goal, website: f.website,
        consent: { processing: true, publicProfile: f.show, marketing: f.cMarketing },
        profile: f.show ? { nickname: f.nickname.trim(), sector: f.sector.trim(), city: f.city, whatIBring: f.bring, avatar: f.avatar || undefined } : undefined,
      }
      const r = await api<{ manageToken: string }>('POST', `/events/${event.slug}/applications`, body)
      const cfg = await api<{ mailConfigured: boolean }>('GET', '/config').catch(() => ({ mailConfigured: true }))
      setDone({ manage: r.manageToken, mail: cfg.mailConfigured })
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ''
      if (err instanceof ApiError && err.status === 0) setFormError(t('err_network'))
      else {
        setFormError(t(ERR_MAP[code] ?? 'err_generic'))
        if (code === 'seat_taken' || code === 'hold_expired') onTaken()
      }
    } finally { setSending(false) }
  }

  const when = fmtWhen(event, locale)
  const label = t('form_title', { n: hold.seat })

  if (done)
    return (
      <Modal onClose={onClose} label={t('sent_title')}>
        <span className="eyebrow">{t('form_eyebrow')}</span>
        <h2 ref={headRef} tabIndex={-1}>{t('sent_title')}</h2>
        <p style={{ margin: '12px 0 16px' }}>{done.mail ? t('sent_text', { email: f.email }) : t('sent_text_nomail')}</p>
        {!done.mail && <p className="notice warn" role="status">{t('sent_nomail')}</p>}
        <p className="muted" style={{ margin: '16px 0 8px', fontSize: 14 }}>{t('sent_manage')}</p>
        <Link className="btn btn-ghost" to={`/my/${done.manage}`} onClick={onClose}>{t('manage_open')} →</Link>
      </Modal>
    )

  return (
    <Modal onClose={onClose} label={label}>
      <span className="eyebrow">{t('form_eyebrow')}</span>
      <h2 ref={headRef} tabIndex={-1}>{label}</h2>
      <ol className="steps" aria-label="Steps">
        {[t('step1'), t('step2'), t('step3')].map((s, i) => <li key={i} aria-current={step === i + 1 ? 'step' : undefined}><b>{i + 1}</b>{s}</li>)}
      </ol>
      {expired ? (
        <div className="stack"><p className="notice error" role="alert">{t('hold_expired')}</p><button className="btn btn-primary" onClick={onClose}>{t('close')}</button></div>
      ) : (
        <>
          <div className={`hold-bar${left < 60_000 ? ' low' : ''}`} role="timer" aria-live="off"><span>{t('hold_left', { t: '' })}</span><b>{mmss(left)}</b></div>
          <form className="form" noValidate onSubmit={(e) => { e.preventDefault(); step < 3 ? go(step + 1) : submit() }}>
            <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden name="website" value={f.website} onChange={(e) => set('website', e.target.value)} />
            {step === 1 && (
              <>
                <p className="notice">{t('private_note')}</p>
                <div className="field"><label htmlFor="b-name">{t('f_name')} *</label><input id="b-name" autoComplete="name" value={f.fullName} maxLength={100} onChange={(e) => set('fullName', e.target.value)} aria-invalid={bad('fullName')} />{fieldErr('fullName')}</div>
                <div className="field"><label htmlFor="b-email">{t('f_email')} *</label><input id="b-email" type="email" autoComplete="email" value={f.email} maxLength={200} onChange={(e) => set('email', e.target.value)} aria-invalid={bad('email')} />{fieldErr('email')}</div>
                <div className="field"><label htmlFor="b-co">{t('f_company')} *</label><input id="b-co" autoComplete="organization" value={f.company} maxLength={120} onChange={(e) => set('company', e.target.value)} aria-invalid={bad('company')} />{fieldErr('company')}</div>
                <div className="field"><label htmlFor="b-loc">{t('f_location')} *</label><input id="b-loc" autoComplete="country-name" value={f.location} maxLength={120} onChange={(e) => set('location', e.target.value)} aria-invalid={bad('location')} />{fieldErr('location')}</div>
                <div className="field"><label htmlFor="b-ct">{t('f_contact')}</label><input id="b-ct" autoComplete="tel" value={f.contact} maxLength={120} onChange={(e) => set('contact', e.target.value)} /></div>
                <div className="field"><label htmlFor="b-goal">{t('f_goal')}</label><textarea id="b-goal" value={f.goal} maxLength={400} onChange={(e) => set('goal', e.target.value)} /></div>
              </>
            )}
            {step === 2 && (
              <>
                <div><h3 style={{ fontSize: 24 }}>{t('profile_title')}</h3><p className="muted" style={{ fontSize: 14 }}>{t('profile_note')}</p></div>
                <label className="switch"><input type="checkbox" role="switch" checked={f.show} onChange={(e) => set('show', e.target.checked)} /><span className="track" /><span>{t('show_profile')}</span></label>
                {!f.show && <p className="notice">{t('show_profile_off')}</p>}
                {f.show && (
                  <>
                    <div className="two">
                      <div className="field"><label htmlFor="b-nick">{t('f_nick')} *</label><input id="b-nick" maxLength={30} value={f.nickname} onChange={(e) => set('nickname', e.target.value)} aria-invalid={bad('nickname')} /><span className="hint">{t('f_nick_h')}</span>{fieldErr('nickname')}</div>
                      <div className="field"><label htmlFor="b-sec">{t('f_sector')} *</label><input id="b-sec" maxLength={60} value={f.sector} onChange={(e) => set('sector', e.target.value)} aria-invalid={bad('sector')} /><span className="hint">{t('f_sector_h')}</span>{fieldErr('sector')}</div>
                    </div>
                    <div className="field"><span className="lbl">{t('f_avatar')}</span>
                      <div className="avatar-pick">
                        {f.avatar ? <img className="preview" src={f.avatar} alt="" /> : <span className="preview" aria-hidden>{(f.nickname[0] ?? '·').toUpperCase()}</span>}
                        <div>
                          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>{t('upload')}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pickAvatar(e.target.files?.[0])} /></label>{' '}
                          {f.avatar && <button type="button" className="btn btn-text btn-sm" onClick={() => set('avatar', '')}>{t('remove')}</button>}
                          <div className="hint" style={{ marginTop: 4 }}>{t('f_avatar_h')}</div>
                        </div>
                      </div>{fieldErr('avatar')}
                    </div>
                    <div className="field"><label htmlFor="b-city">{t('f_city')}</label><input id="b-city" maxLength={80} value={f.city} onChange={(e) => set('city', e.target.value)} /><span className="hint">{t('f_city_h')}</span></div>
                    <div className="field">
                      <label htmlFor="b-bring">{t('bring_title')}</label>
                      <span className="hint">{t('bring_desc')}</span>
                      <textarea id="b-bring" maxLength={160} rows={3} placeholder={t('bring_label')} value={f.bring} onChange={(e) => set('bring', e.target.value)} />
                      <div className="counter">{f.bring.length} / 160</div>
                      <span className="hint">{t('bring_h')} {t('bring_ex')}</span>
                    </div>
                    <div className="preview-card" aria-label={t('preview')}>
                      <span className="eyebrow">{t('preview')}</span>
                      <div className="pc-top">
                        {f.avatar ? <img className="avatar-lg" src={f.avatar} alt="" /> : <span className="avatar-lg" aria-hidden>{(f.nickname[0] ?? '·').toUpperCase()}</span>}
                        <div><b>{f.nickname || '—'}</b><span>{f.sector || '—'}</span>{f.city && <span>{f.city}</span>}</div>
                      </div>
                      {f.bring && <p style={{ fontSize: 14 }}>“{f.bring}”</p>}
                    </div>
                  </>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <h3 style={{ fontSize: 24 }}>{t('confirm_title')}</h3>
                <dl className="summary">
                  <div><dt>{t('form_event')}</dt><dd>{event.title}</dd></div>
                  <div><dt>{t('fact_date')}</dt><dd>{when}</dd></div>
                  <div><dt>{t('fact_lang')}</dt><dd>{t(`lang_${event.language}` as Key)}</dd></div>
                  <div><dt>{t('my_seat')}</dt><dd>№ {hold.seat}</dd></div>
                  <div><dt>{t('f_email')}</dt><dd>{f.email}</dd></div>
                  {f.show && <div><dt>{t('my_profile')}</dt><dd>{f.nickname} · {f.sector}</dd></div>}
                </dl>
                <div role="group" aria-label="Consents">
                  <label className="consent"><input type="checkbox" checked={f.cProcessing} onChange={(e) => set('cProcessing', e.target.checked)} aria-invalid={bad('cProcessing')} /><span>{t('c_processing')} <Link to="/privacy" target="_blank">{t('c_policy')}</Link>{fieldErr('cProcessing')}</span></label>
                  {f.show && <label className="consent"><input type="checkbox" checked={f.cPublic} onChange={(e) => set('cPublic', e.target.checked)} aria-invalid={bad('cPublic')} /><span>{t('c_public')}{fieldErr('cPublic')}</span></label>}
                  <label className="consent"><input type="checkbox" checked={f.cMarketing} onChange={(e) => set('cMarketing', e.target.checked)} /><span>{t('c_marketing')}</span></label>
                </div>
                <p className="notice">{t('legend_note')}</p>
              </>
            )}
            {formError && <p className="notice error" role="alert">{formError}</p>}
            <div className="inline" style={{ justifyContent: 'space-between' }}>
              {step > 1 ? <button type="button" className="btn btn-ghost" onClick={() => go(step - 1)}>← {t('back')}</button> : <span />}
              <button className="btn btn-primary" disabled={sending}>{sending ? t('sending') : step < 3 ? <>{t('next')} →</> : <>{t('send')} →</>}</button>
            </div>
          </form>
        </>
      )}
    </Modal>
  )
}
