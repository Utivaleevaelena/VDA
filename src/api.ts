export class ApiError extends Error {
  constructor(public status: number, public code: string, public issues?: { path: string; message: string }[]) {
    super(code)
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'nt' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'server_error', data?.issues)
  return data as T
}

export type EventPublic = {
  id: number; slug: string; format: 'hot_seat' | 'growth_lab' | 'business_match' | 'digital_clinic'; language: 'ru' | 'en' | 'pl'
  title: string; topic: string; description: string; benefits: string[]; host: string | null
  startsAt: string | null; durationMin: number; timezone: string; capacity: number; status: string
  isDemo: boolean; registrationOpen: boolean; seatsTaken: number; seatsFree: number
}
export type SeatState = 'available' | 'held' | 'pending' | 'confirmed_public' | 'confirmed_private' | 'closed'
export type SeatView = { seat: number; state: SeatState; profile?: { nickname: string; sector: string; avatarUrl: string | null } }
export type Member = { seat: number; nickname: string; sector: string; city: string | null; whatIBring: string | null; avatarUrl: string | null }
