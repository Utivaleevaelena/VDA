import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api'
import { useI18n } from '../i18n'

/** "I want to participate" / newsletter. Stored on the server as an interest — never as a booking. */
export function InterestForm({ eventSlug, compact }: { eventSlug?: string; compact?: boolean }) {
  const { t, lang } = useI18n()
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState('')
  const [website, setWebsite] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError(t('err_email'))
    if (!consent) return setError(t('err_consent'))
    setState('sending')
    try {
      await api('POST', '/interest', { email, locale: lang, eventSlug, consent: true, marketing, website })
      setState('done')
    } catch (err) {
      setState('idle')
      setError(err instanceof ApiError ? (err.status === 0 ? t('err_network') : err.status === 429 ? t('err_rate') : t('err_generic')) : t('err_generic'))
    }
  }

  if (state === 'done') return <p className="notice ok" role="status">{t('subscribed')}</p>
  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`int-${eventSlug ?? 'g'}`}>{t('email')}</label>
        <input id={`int-${eventSlug ?? 'g'}`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error && !/^\S+@\S+\.\S+$/.test(email)} />
      </div>
      <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden name="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
      <label className="consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>{t('c_interest')} <Link to="/privacy">{t('footer_privacy')}</Link></span></label>
      {!compact && <label className="consent"><input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} /><span>{t('c_marketing_news')}</span></label>}
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={state === 'sending'}>{state === 'sending' ? t('sending') : t('subscribe')}</button>
    </form>
  )
}
