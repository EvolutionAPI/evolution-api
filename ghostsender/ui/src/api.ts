const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error ?? 'Erro desconhecido')
  return json.data as T
}

const get  = <T>(path: string) => request<T>(path)
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })
const del  = <T>(path: string) => request<T>(path, { method: 'DELETE' })

// ── Instances ────────────────────────────────────────────────
export const api = {
  instances: {
    list:    () => get<Instance[]>('/instances'),
    status:  (name: string) => get<{ state: string }>(`/instances/${name}/status`),
    create:  (body: CreateInstanceDto) => post<Instance>('/instances', body),
    connect: (name: string) => post<{ qrcode?: { base64: string } }>(`/instances/${name}/connect`),
    restart: (name: string) => post(`/instances/${name}/restart`),
    logout:  (name: string) => post(`/instances/${name}/logout`),
    delete:  (name: string) => del(`/instances/${name}`),
  },
  warmup: {
    stats:    () => get<WarmupStats>('/warmup/stats'),
    start:    (body: WarmupStartDto) => post<{ started: boolean }>('/warmup/start', body),
    stop:     () => post<{ stopped: boolean }>('/warmup/stop'),
    reset:    () => post<{ reset: boolean }>('/warmup/reset'),
    schedule: (body: { cronExpression?: string; instances?: string[] }) =>
      post<{ scheduled: boolean; next: string }>('/warmup/schedule', body),
    scheduleStop: () => post('/warmup/schedule/stop'),
  },
  blast: {
    send:   (body: BlastSendDto) => post<{ started: boolean; total: number }>('/blast/send', body),
    upload: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return fetch(BASE + '/blast/upload', { method: 'POST', body: fd })
        .then(r => r.json()).then(j => j.data as { count: number; preview: { number: string; name?: string }[] })
    },
  },
  verify: {
    check:   (body: { instance: string; numbers: string }) => post<VerifyResult[]>('/verify/check', body),
    profile: (body: { instance: string; number: string }) => post<ContactProfile>('/verify/profile', body),
  },
  message: {
    send: (body: { instance: string; number: string; text: string }) =>
      post<{ key: { id: string } }>('/message/send', body),
  },
  health: () => get<{ status: string }>('/health'),
}

// ── Types ────────────────────────────────────────────────────
export interface Instance {
  instanceName: string
  instanceId?: string
  connectionStatus?: 'open' | 'close' | 'connecting'
  ownerJid?: string
  profileName?: string
  profilePicUrl?: string
  apikey?: string
}

export interface CreateInstanceDto {
  instanceName: string
  number?: string
  qrcode?: boolean
  integration?: string
}

export interface WarmupStats {
  totalDays: number
  totalMessages: number
  currentPhase: number
  sessions: WarmupSession[]
}

export interface WarmupSession {
  date: string
  phase: number
  messagesSent: number
  pairs: { sender: string; receiver: string }[]
}

export interface WarmupStartDto {
  instances: string[]
  startPhase?: number
  hourStart?: string
  hourEnd?: string
  minDelayMs?: number
  maxDelayMs?: number
}

export interface BlastSendDto {
  instance: string
  message: string
  numbers: string
  concurrency?: number
  delayBetweenMs?: number
  verifyNumbers?: boolean
}

export interface VerifyResult {
  number: string
  exists: boolean
  jid?: string
  name?: string
}

export interface ContactProfile {
  wuid: string
  name?: string
  status?: string
  picture?: string
  isBusiness?: boolean
}
