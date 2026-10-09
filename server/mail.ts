import { run } from './db.ts'

export type Locale = 'ru' | 'en' | 'pl'
export type MailType =
  | 'email_confirm' | 'application_received' | 'organizer_new_application' | 'approved' | 'rejected'
  | 'reminder_24h' | 'event_changed' | 'waitlist_offer' | 'thank_you' | 'interest_received'

export const ORGANIZER_EMAIL = process.env.ORGANIZER_EMAIL ?? 'elena@pixelexpertsteam.com'
export const PUBLIC_URL = (process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')
export const mailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM)

type V = { name?: string; event?: string; when?: string; seat?: number; link?: string; link2?: string; meet?: string; note?: string }

const T: Record<MailType, Record<Locale, (v: V) => [string, string]>> = {
  email_confirm: {
    ru: (v) => ['Подтвердите email — THE NEXT TABLE', `Здравствуйте, ${v.name}!\n\nПодтвердите email, чтобы заявка на «${v.event}» (место №${v.seat}) попала к организатору:\n${v.link}\n\nСсылка действует 60 минут, после этого место освободится.`],
    en: (v) => ['Confirm your email — THE NEXT TABLE', `Hello ${v.name},\n\nPlease confirm your email so your request for "${v.event}" (seat #${v.seat}) reaches the organiser:\n${v.link}\n\nThe link is valid for 60 minutes; after that the seat is released.`],
    pl: (v) => ['Potwierdź e-mail — THE NEXT TABLE', `Cześć ${v.name},\n\nPotwierdź e-mail, aby zgłoszenie na „${v.event}” (miejsce nr ${v.seat}) trafiło do organizatora:\n${v.link}\n\nLink działa 60 minut, potem miejsce zostanie zwolnione.`],
  },
  application_received: {
    ru: (v) => ['Заявка получена — ожидается подтверждение', `${v.name}, заявка на «${v.event}», ${v.when}, место №${v.seat} получена. Участие пока не подтверждено — организатор проверит заявку и напишет вам.\n\nУправление заявкой (изменить профиль, отменить участие):\n${v.link}`],
    en: (v) => ['Request received — awaiting confirmation', `${v.name}, we received your request for "${v.event}", ${v.when}, seat #${v.seat}. Participation is not confirmed yet — the organiser will review it and get back to you.\n\nManage your request (edit profile, cancel):\n${v.link}`],
    pl: (v) => ['Zgłoszenie otrzymane — oczekuje na potwierdzenie', `${v.name}, zgłoszenie na „${v.event}”, ${v.when}, miejsce nr ${v.seat} zostało otrzymane. Udział nie jest jeszcze potwierdzony — organizator sprawdzi zgłoszenie i odpowie.\n\nZarządzaj zgłoszeniem (edycja profilu, rezygnacja):\n${v.link}`],
  },
  organizer_new_application: {
    ru: (v) => [`Новая заявка: ${v.event}`, `${v.name} подтвердил(а) email и ждёт решения.\nСобытие: ${v.event}, место №${v.seat}.\nПанель: ${v.link}`],
    en: (v) => [`New application: ${v.event}`, `${v.name} confirmed their email and awaits a decision.\nEvent: ${v.event}, seat #${v.seat}.\nAdmin: ${v.link}`],
    pl: (v) => [`Nowe zgłoszenie: ${v.event}`, `${v.name} potwierdził(a) e-mail i czeka na decyzję.\nWydarzenie: ${v.event}, miejsce nr ${v.seat}.\nPanel: ${v.link}`],
  },
  approved: {
    ru: (v) => [`Участие подтверждено: ${v.event}`, `${v.name}, ваше место №${v.seat} подтверждено.\n${v.when}\nСсылка на встречу: ${v.meet}\n\nMeet your table → ${v.link2}\nУправление участием: ${v.link}`],
    en: (v) => [`You're confirmed: ${v.event}`, `${v.name}, seat #${v.seat} is confirmed.\n${v.when}\nMeeting link: ${v.meet}\n\nMeet your table → ${v.link2}\nManage your participation: ${v.link}`],
    pl: (v) => [`Udział potwierdzony: ${v.event}`, `${v.name}, miejsce nr ${v.seat} jest potwierdzone.\n${v.when}\nLink do spotkania: ${v.meet}\n\nMeet your table → ${v.link2}\nZarządzaj udziałem: ${v.link}`],
  },
  rejected: {
    ru: (v) => [`По заявке на «${v.event}»`, `${v.name}, к сожалению, в этот раз мы не можем подтвердить ваше участие в «${v.event}». Место освобождено. Будем рады видеть вас на других встречах: ${v.link}`],
    en: (v) => [`About your request for "${v.event}"`, `${v.name}, unfortunately we cannot confirm your participation in "${v.event}" this time. The seat has been released. We'd be glad to see you at other tables: ${v.link}`],
    pl: (v) => [`Dotyczy zgłoszenia na „${v.event}”`, `${v.name}, niestety tym razem nie możemy potwierdzić Twojego udziału w „${v.event}”. Miejsce zostało zwolnione. Zapraszamy na inne stoły: ${v.link}`],
  },
  reminder_24h: {
    ru: (v) => [`Завтра: ${v.event}`, `${v.name}, напоминаем: ${v.when}. Ссылка на встречу: ${v.meet}\nWho's at your table: ${v.link2}`],
    en: (v) => [`Tomorrow: ${v.event}`, `${v.name}, a reminder: ${v.when}. Meeting link: ${v.meet}\nWho's at your table: ${v.link2}`],
    pl: (v) => [`Jutro: ${v.event}`, `${v.name}, przypominamy: ${v.when}. Link do spotkania: ${v.meet}\nKto jest przy Twoim stole: ${v.link2}`],
  },
  event_changed: {
    ru: (v) => [`Изменение встречи: ${v.event}`, `${v.name}, в «${v.event}» есть изменения: ${v.note}\n${v.link}`],
    en: (v) => [`Event update: ${v.event}`, `${v.name}, there is an update to "${v.event}": ${v.note}\n${v.link}`],
    pl: (v) => [`Zmiana wydarzenia: ${v.event}`, `${v.name}, w „${v.event}” są zmiany: ${v.note}\n${v.link}`],
  },
  waitlist_offer: {
    ru: (v) => [`Освободилось место: ${v.event}`, `${v.name}, на «${v.event}» освободилось место. Выберите стул, пока он доступен: ${v.link}`],
    en: (v) => [`A seat opened up: ${v.event}`, `${v.name}, a seat opened up at "${v.event}". Pick it while it's available: ${v.link}`],
    pl: (v) => [`Zwolniło się miejsce: ${v.event}`, `${v.name}, zwolniło się miejsce na „${v.event}”. Wybierz je, póki jest dostępne: ${v.link}`],
  },
  thank_you: {
    ru: (v) => [`Спасибо, что были за столом`, `${v.name}, спасибо, что были частью THE NEXT TABLE. Ваш следующий разговор: ${v.link}`],
    en: (v) => [`Thank you for joining the table`, `${v.name}, thank you for being part of THE NEXT TABLE. Your next conversation: ${v.link}`],
    pl: (v) => [`Dziękujemy za wspólny stół`, `${v.name}, dziękujemy, że byłeś(-aś) częścią THE NEXT TABLE. Twoja następna rozmowa: ${v.link}`],
  },
  interest_received: {
    ru: (v) => ['Вы в списке приглашений — THE NEXT TABLE', `Спасибо! Мы напишем, когда появится встреча. Это не бронь места. Отписаться можно ответом на это письмо.`],
    en: (v) => ['You are on the invitation list — THE NEXT TABLE', `Thank you! We'll write when a table opens. This is not a seat booking. Reply to this email to unsubscribe.`],
    pl: (v) => ['Jesteś na liście zaproszeń — THE NEXT TABLE', `Dziękujemy! Napiszemy, gdy pojawi się spotkanie. To nie jest rezerwacja miejsca. Aby zrezygnować, odpowiedz na ten e-mail.`],
  },
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Branded HTML version (the plain-text part is always sent too). Links become underlined links; the first one is also a button. */
function renderHtml(subject: string, body: string, locale: Locale) {
  const urls = body.match(/https?:\/\/[^\s]+/g) ?? []
  const paras = body.split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 16px;line-height:1.6">${esc(p).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#863f3b">$1</a>')}</p>`).join('')
  const button = urls[0]
    ? `<p style="margin:24px 0 0"><a href="${esc(urls[0])}" style="display:inline-block;background:#863f3b;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">${{ ru: 'Открыть', en: 'Open', pl: 'Otwórz' }[locale]} →</a></p>` : ''
  return `<!doctype html><html><body style="margin:0;background:#f2efe8;padding:24px 12px;font-family:Helvetica,Arial,sans-serif;color:#262724">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#faf8f3;border:1px solid #d9d2c7;border-radius:14px">
<tr><td style="padding:28px 32px 8px;font-family:Georgia,serif;font-size:20px;letter-spacing:.08em">THE NEXT TABLE</td></tr>
<tr><td style="padding:8px 32px 28px;font-size:15px"><h1 style="font:400 24px/1.2 Georgia,serif;margin:12px 0 20px">${esc(subject)}</h1>${paras}${button}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #d9d2c7;font-size:12px;color:#6e6a63">by Pixel Experts Team · Different minds. One table.</td></tr>
</table></td></tr></table></body></html>`
}

/**
 * Records the message in `notifications` and sends it through Resend when configured.
 * Without a provider the row is stored as `not_configured` — nothing is pretended to be sent.
 */
export async function sendMail(type: MailType, to: string, locale: Locale, vars: V, applicationId?: number) {
  const [subject, body] = T[type][locale](vars)
  let status: 'sent' | 'failed' | 'not_configured' = 'not_configured'
  let error: string | null = null
  if (mailConfigured()) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.MAIL_FROM, to: [to], subject, text: body, html: renderHtml(subject, body, locale),
          reply_to: ORGANIZER_EMAIL,
          ...(type === 'interest_received' ? { headers: { 'List-Unsubscribe': `<mailto:${ORGANIZER_EMAIL}?subject=unsubscribe>` } } : {}),
        }),
      })
      status = r.ok ? 'sent' : 'failed'
      if (!r.ok) error = `${r.status} ${(await r.text()).slice(0, 300)}`
    } catch (e) {
      status = 'failed'
      error = String(e)
    }
  } else {
    console.log(`[mail:not_configured] ${type} → ${to}`)
  }
  await run(
    'INSERT INTO notifications(type,to_email,locale,subject,body,status,error,application_id) VALUES(?,?,?,?,?,?,?,?)',
    type, to, locale, subject, body, status, error, applicationId ?? null,
  )
  return status
}
