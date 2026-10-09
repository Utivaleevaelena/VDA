import layout8 from './seat_layout_8.json'
import type { EventPublic } from './api'
import type { Key, Lang } from './i18n'

export type Pos = { seat: number; x: number; y: number; rot: number; sc: number; dx: string; dy: string }

/** Seat coordinates (% of the stage). 8 seats use the designer's layout; 6–18 are placed on the same ellipse. */
export function seatLayout(n: number): Pos[] {
  const sc = Math.min(1, 9.5 / n)
  if (n === 8)
    return layout8.layout.map((l) => ({ seat: l.seat, x: l.x_percent, y: l.y_percent, rot: l.rotation_degrees, sc, ...outward(l.rotation_degrees) }))
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI + Math.PI / n * (n % 2 === 0 ? 1 : 0)
    const deg = (a * 180) / Math.PI
    return { seat: i + 1, x: 50 + 40 * Math.sin(a), y: 47 - 38 * Math.cos(a), rot: deg > 180 ? deg - 360 : deg, sc, ...outward(deg) }
  })
}
const outward = (deg: number) => {
  const r = (deg * Math.PI) / 180
  return { dx: `${(Math.sin(r) * 1.6).toFixed(2)}cqw`, dy: `${(-Math.cos(r) * 1.6).toFixed(2)}cqw` }
}

export const chairFor = (state: string, seat: number, selected: boolean) => {
  if (selected) return 'oxblood'
  switch (state) {
    case 'held': return 'taupe'
    case 'pending': return 'sand'
    case 'confirmed_private': return 'forest'
    case 'confirmed_public': return seat % 2 ? 'sage' : 'ivory'
    case 'closed': return 'sand'
    default: return 'ivory'
  }
}
export const iconFor = (state: string, selected: boolean) =>
  selected ? 'selected' : state === 'available' ? 'free' : state === 'held' ? 'held' : state === 'pending' ? 'pending' : state === 'confirmed_private' ? 'private' : null

export function fmtWhen(e: Pick<EventPublic, 'startsAt' | 'timezone'>, locale: string, local = false) {
  if (!e.startsAt) return null
  const opts: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeStyle: 'short', ...(local ? {} : { timeZone: e.timezone }) }
  const tz = local ? Intl.DateTimeFormat().resolvedOptions().timeZone : e.timezone
  return `${new Intl.DateTimeFormat(locale, opts).format(new Date(e.startsAt))} (${tz})`
}

export const fmtDay = (iso: string, locale: string, tz: string) =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: tz }).format(new Date(iso))

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const TOPICS = ['growth', 'marketing', 'product', 'sales', 'leadership', 'branding', 'community', 'investment'] as const
export const FORMATS = ['hot_seat', 'growth_lab', 'business_match', 'digital_clinic'] as const
export const ICON = (n: string) => `/assets/icons/${n}.svg`
export const CHAIR = (c: string) => `/assets/images/chair_base_${c}.png`

export function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(r.error)
    r.readAsDataURL(f)
  })
}
export const FORMAT_KEY = (f: string) => `fmt_${f}` as Key
export const langName = (l: Lang, t: (k: any) => string) => t(`lang_${l}`)

/** "2026-10-20T18:00" typed in `tz` → UTC ISO string. */
export function zonedToUtc(local: string, tz: string): string {
  const [d, tm] = local.split('T'); const [y, mo, da] = d.split('-').map(Number); const [h, mi] = tm.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, da, h, mi)
  const off = (ts: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(ts)).map((x) => [x.type, Number(x.value)]))
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ts
  }
  const first = guess - off(guess)
  return new Date(guess - off(first)).toISOString()
}
export function utcToZoned(iso: string, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
