import { useEffect, useRef, useState } from 'react'
import { Flame, Play, Square, RotateCcw, Clock, Zap, CheckCircle } from 'lucide-react'
import { getSocket } from '../socket'
import { api, WarmupStats, Instance } from '../api'
import LogFeed, { LogEntry } from '../components/LogFeed'

interface Progress { sent: number; total: number; phase: number; pct: number }

const PHASE_INFO = [
  { label: 'Não iniciado', msgs: '—',       delay: '—',       color: 'text-slate-500' },
  { label: 'Início',       msgs: '20–40',   delay: '8–20s',   color: 'text-blue-400'  },
  { label: 'Aquecendo',    msgs: '60–120',  delay: '5–12s',   color: 'text-cyan-400'  },
  { label: 'Acelerando',   msgs: '150–250', delay: '3–8s',    color: 'text-amber-400' },
  { label: 'Forte',        msgs: '280–450', delay: '1.5–5s',  color: 'text-orange-400'},
  { label: 'Pronto!',      msgs: '500–800', delay: '0.8–3s',  color: 'text-emerald-400'},
]

export default function Warmup() {
  const [stats, setStats]       = useState<WarmupStats | null>(null)
  const [instances, setInst]    = useState<Instance[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [running, setRunning]   = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [logs, setLogs]         = useState<LogEntry[]>([])
  const [startPhase, setStartPhase] = useState(1)
  const [hourStart, setHourStart]   = useState('08:00')
  const [hourEnd,   setHourEnd]     = useState('22:00')
  const [status, setStatus]     = useState<'idle' | 'running' | 'done'>('idle')
  const socketRef = useRef(getSocket())

  useEffect(() => {
    Promise.all([api.warmup.stats(), api.instances.list()])
      .then(([s, inst]) => {
        setStats(s)
        setInst(inst)
        const connected = inst.filter(i => i.connectionStatus === 'open').map(i => i.instanceName)
        setSelected(connected.slice(0, 4))
        setStartPhase(s.currentPhase || 1)
      })
      .catch(() => {})

    const sock = socketRef.current
    const onLog      = (e: LogEntry) => setLogs(prev => [...prev.slice(-499), e])
    const onProgress = (e: Progress) => { setProgress(e); setRunning(true); setStatus('running') }
    const onStart    = () => { setRunning(true); setStatus('running') }
    const onEnd      = () => { setRunning(false); setStatus('done'); api.warmup.stats().then(setStats).catch(() => {}) }
    const onError    = () => { setRunning(false); setStatus('idle') }

    sock.on('warmup:log', onLog)
    sock.on('warmup:progress', onProgress)
    sock.on('warmup:start', onStart)
    sock.on('warmup:end', onEnd)
    sock.on('warmup:error', onError)
    return () => { sock.off('warmup:log', onLog); sock.off('warmup:progress', onProgress)
      sock.off('warmup:start', onStart); sock.off('warmup:end', onEnd); sock.off('warmup:error', onError) }
  }, [])

  const toggle = (name: string) =>
    setSelected(p => p.includes(name) ? p.filter(x => x !== name) : [...p, name])

  const handleStart = async () => {
    if (selected.length < 2) return alert('Selecione ao menos 2 instâncias.')
    setLogs([])
    setProgress(null)
    await api.warmup.start({ instances: selected, startPhase: startPhase as 1, hourStart, hourEnd })
    setRunning(true); setStatus('running')
  }

  const handleStop = async () => { await api.warmup.stop(); setRunning(false); setStatus('idle') }

  const handleReset = async () => {
    if (!confirm('Resetar todo o histórico de warmup?')) return
    await api.warmup.reset()
    const s = await api.warmup.stats()
    setStats(s); setProgress(null); setStatus('idle')
  }

  const phase = progress?.phase ?? stats?.currentPhase ?? 0
  const info  = PHASE_INFO[phase] ?? PHASE_INFO[0]

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-400" /> Warmup
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Aquecimento automático de chips em 10–14 dias</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset} className="btn-ghost text-xs">
            <RotateCcw className="w-3.5 h-3.5" /> Resetar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Config */}
        <div className="lg:col-span-1 space-y-4">
          <div className="card space-y-4">
            <p className="text-sm font-medium text-white">Configuração</p>

            {/* Instances */}
            <div>
              <label className="label">Instâncias ({selected.length} selecionadas)</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {instances.length === 0 && (
                  <p className="text-xs text-slate-500 py-2">Nenhuma instância encontrada</p>
                )}
                {instances.map(inst => (
                  <label key={inst.instanceName}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg bg-ghost-surface border border-ghost-border cursor-pointer hover:border-ghost-primary/40 transition-colors">
                    <input type="checkbox" checked={selected.includes(inst.instanceName)}
                      onChange={() => toggle(inst.instanceName)}
                      className="w-3.5 h-3.5 accent-violet-500" />
                    <span className="text-sm text-slate-300 flex-1 truncate">{inst.instanceName}</span>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${inst.connectionStatus === 'open' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  </label>
                ))}
              </div>
            </div>

            {/* Start phase */}
            <div>
              <label className="label">Fase inicial</label>
              <select value={startPhase} onChange={e => setStartPhase(Number(e.target.value))} className="w-full">
                {PHASE_INFO.slice(1).map((p, i) => (
                  <option key={i+1} value={i+1}>Fase {i+1} — {p.label}</option>
                ))}
              </select>
            </div>

            {/* Hours */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Horário início</label>
                <input type="time" value={hourStart} onChange={e => setHourStart(e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="label">Horário fim</label>
                <input type="time" value={hourEnd} onChange={e => setHourEnd(e.target.value)} className="w-full" />
              </div>
            </div>

            {/* Actions */}
            {!running ? (
              <button onClick={handleStart} className="btn-primary w-full justify-center">
                <Play className="w-4 h-4" /> Iniciar Warmup
              </button>
            ) : (
              <button onClick={handleStop} className="btn-danger w-full justify-center">
                <Square className="w-4 h-4" /> Parar
              </button>
            )}
          </div>

          {/* Phase info */}
          <div className="card space-y-3">
            <p className="text-sm font-medium text-white">Fase atual</p>
            <div className="flex items-center justify-between">
              <span className={`text-2xl font-bold ${info.color}`}>{phase}/5</span>
              <span className={`badge ${phase === 5 ? 'badge-green' : 'badge-blue'}`}>{info.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-ghost-surface rounded-lg p-2.5">
                <p className="text-slate-500 mb-0.5">Msgs/dia</p>
                <p className="font-mono text-white">{info.msgs}</p>
              </div>
              <div className="bg-ghost-surface rounded-lg p-2.5">
                <p className="text-slate-500 mb-0.5">Delay</p>
                <p className="font-mono text-white">{info.delay}</p>
              </div>
            </div>
            <div className="text-xs text-slate-500 space-y-1">
              <p className="flex gap-2"><Zap className="w-3 h-3 text-cyan-500 mt-0.5 flex-shrink-0" /> Fase avança a cada 2 dias</p>
              <p className="flex gap-2"><Clock className="w-3 h-3 text-violet-500 mt-0.5 flex-shrink-0" /> Aquecimento completo em ~10–14 dias</p>
            </div>
          </div>
        </div>

        {/* Right side */}
        <div className="lg:col-span-2 space-y-4">
          {/* Progress */}
          {(running || status === 'done') && progress && (
            <div className="card space-y-3 animate-slide-in">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">Progresso da sessão</p>
                {status === 'done' && (
                  <span className="badge-green flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Concluído
                  </span>
                )}
                {running && <span className="flex items-center gap-1.5 text-xs text-cyan-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /> Em andamento
                </span>}
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{progress.sent} enviadas</span>
                  <span>{progress.pct}%</span>
                  <span>meta: {progress.total}</span>
                </div>
                <div className="h-2 bg-ghost-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-600 to-cyan-500 rounded-full transition-all duration-500"
                    style={{ width: `${progress.pct}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Log feed */}
          <LogFeed logs={logs} maxHeight="340px" />

          {/* Session history */}
          {(stats?.sessions?.length ?? 0) > 0 && (
            <div className="card overflow-hidden p-0">
              <div className="px-4 py-3 border-b border-ghost-border">
                <p className="text-sm font-medium text-white">Histórico de sessões</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-ghost-border">
                      {['Data', 'Fase', 'Mensagens', 'Pares'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(stats?.sessions ?? []).slice(-10).reverse().map((s, i) => (
                      <tr key={i} className="border-b border-ghost-border/50 hover:bg-ghost-surface/50">
                        <td className="px-4 py-2.5 text-slate-400">{new Date(s.date).toLocaleDateString('pt-BR')}</td>
                        <td className="px-4 py-2.5"><span className="badge-purple">{s.phase}/5</span></td>
                        <td className="px-4 py-2.5 text-white font-mono">{s.messagesSent}</td>
                        <td className="px-4 py-2.5 text-slate-500">{s.pairs?.length ?? 0} par(es)</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
