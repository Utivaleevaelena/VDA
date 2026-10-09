import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { get, run, tx } from './db.ts'
import { putFile } from './storage.ts'
import { ensureSeats } from './domain.ts'
import { token } from './util.ts'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * First start on an empty DB (dev only, SEED_DEMO != 0):
 *  - 4 pilot topics with "date TBA": published, accept interest only, no seats are bookable.
 *  - 1 DEMO table with fictional participants, flagged is_demo so the UI labels it clearly.
 * Unpublish/delete them in the admin panel before launch.
 */
export async function seedIfEmpty() {
  if (process.env.SEED_DEMO === '0' || process.env.NODE_ENV === 'production') return
  if (await get('SELECT 1 FROM events LIMIT 1')) return

  const ev = async (slug: string, format: string, language: string, title: string, topic: string, description: string, benefits: string[], capacity: number, startsAt: string | null, demo = 0) => {
    const r = await run(
      `INSERT INTO events(slug,format,language,title,topic,description,benefits,host,starts_at,capacity,status,is_demo) VALUES(?,?,?,?,?,?,?,?,?,?,'published',?)`,
      slug, format, language, title, topic, description, JSON.stringify(benefits), 'Pixel Experts Team', startsAt, capacity, demo)
    await ensureSeats(Number(r.lastInsertRowid), capacity)
    return Number(r.lastInsertRowid)
  }

  await tx(async () => {
    await ev('hot-seat-fresh-look', 'hot_seat', 'en', 'A fresh look at your toughest business challenge', 'growth', 'Two real founder challenges, constructive questions and actionable perspectives.', ['A fresh outside view on your challenge', 'Honest questions from peers', 'One concrete next move'], 8, null)
    await ev('digital-clinic-klienci', 'digital_clinic', 'pl', 'Gdzie Twoja firma traci klientów?', 'marketing', 'Przyjrzyjmy się wspólnie ścieżce klienta, stronie i pomysłom na usprawnienia.', ['Diagnoza ścieżki klienta', 'Praktyczne usprawnienia', 'Kontakt z praktykami'], 10, null)
    await ev('business-match-znakomstva', 'business_match', 'ru', 'Полезные знакомства без неловкого нетворкинга', 'community', 'Знакомимся по интересам, экспертизе и бизнес-задачам в небольших группах.', ['Знакомства по запросу', 'Понятные точки сотрудничества', 'Без неловкого нетворкинга'], 14, null)

    const when = new Date(Date.now() + 14 * 86_400_000)
    when.setUTCHours(16, 0, 0, 0)
    const id = await ev('demo-growth-lab', 'growth_lab', 'ru', 'Где твой бизнес теряет клиентов?', 'growth', 'Разбираем реальные препятствия для роста и ищем новые подходы вместе с участниками.', ['Новые точки роста для твоего бизнеса', 'Реальные кейсы и опыт участников', 'Конкретные идеи, которые можно проверить'], 8, when.toISOString(), 1)

    const people: [number, string, string, string, string, string][] = [
      [1, 'Marta', 'Branding', 'Warsaw, Poland', 'Опыт создания брендов для небольших компаний.', 'avatar_marta.png'],
      [2, 'Nina', 'E-commerce', 'Berlin, Germany', 'Масштабирование интернет-магазинов и выход на новые рынки.', 'avatar_nina.png'],
      [3, 'Alex', 'SaaS', 'Berlin, Germany', 'Продуктовый рост, международные рынки и построение remote-команд.', 'avatar_alex.png'],
      [5, 'Lena', 'Product', 'Prague, Czechia', 'Исследования пользователей и продуктовые стратегии.', 'avatar_lena.png'],
      [7, 'Dima', 'Marketing', 'Gdańsk, Poland', 'Системный маркетинг, аналитика и воронки продаж.', 'avatar_dima.png'],
    ]
    const addApp = async (seat: number, name: string) => {
      const a = await run(
        `INSERT INTO applications(event_id,seat_no,status,full_name,email,company,location,locale,manage_token,is_demo,decided_at)
         VALUES(?,?,'approved',?,?,?,?,'ru',?,1,?)`,
        id, seat, `Demo ${name}`, `demo-${seat}@example.invalid`, 'Demo', 'Demo', token(24), new Date().toISOString())
      await run('UPDATE event_seats SET application_id=? WHERE event_id=? AND seat_no=?', Number(a.lastInsertRowid), id, seat)
      return Number(a.lastInsertRowid)
    }
    for (const [seat, nick, sector, city, bring, file] of people) {
      const appId = await addApp(seat, nick)
      const stored = `seed-${file}`
      await putFile(stored, fs.readFileSync(path.join(here, 'seed-avatars', file)), 'image/png')
      await run('INSERT INTO public_profiles(application_id,nickname,sector,city,what_i_bring,avatar_file,visible) VALUES(?,?,?,?,?,?,1)', appId, nick, sector, city, bring, stored)
    }
    await addApp(6, 'Private') // confirmed, no public profile → "Место занято"
  })
  console.log('[seed] demo data created (1 DEMO table + 3 TBA pilot topics)')
}
