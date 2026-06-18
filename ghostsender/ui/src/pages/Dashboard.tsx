import { useEffect, useState } from 'react'
import { MessageSquare, Calendar, Layers, Cpu, TrendingUp, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import StatCard from '../components/StatCard'
import { api, WarmupStats, WarmupSession, Instance } from '../api'

const PHASE_LABELS = ['', 'Início', 'Aquecendo', 'Acelerando', 'Forte', 'Pronto']
const PHASE_PCT   = [0, 20, 40, 60, 80, 100]

function phaseColor(p: number) {
  if (p <= 1) return 'bg-blue-500'
  if (p <= 2) return 'bg-cyan-500'
  if (p <= 3) return 'bg-amber-500'
  if (p <= 4) return 'bg-orange-500'
  return 'bg-emerald-500'
}

export default function Dashboard() {
  const [stats, setStats]     = useState<WarmupStats | null>(null)
  const [instances, setInst]  = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.warmup.stats(), api.instances.list()])
      .then(([s, inst]) => { setStats(s); setInst(inst) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const chartData = (stats?.sessions ?? []).slice(-14).map((s: WarmupSession) => ({
    date: new Date(s.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    msgs: s.messagesSent,
    fase: s.phase,
  }))

  const connected  = instances.filter(i => i.connectionStatus === 'open').length
  const phase      = stats?.currentPhase ?? 0
  const phasePct   = PHASE_PCT[phase] ?? 0

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Visão geral do GhostSender</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Mensagens Totais" value={loading ? '—' : (stats?.totalMessages ?? 0).toLocaleString('pt-BR')}
          icon={MessageSquare} color="purple" sub="desde o início" />
        <StatCard label="Dias Ativos" value={loading ? '—' : stats?.totalDays ?? 0}
          icon={Calendar} color="cyan" sub="sessões realizadas" />
        <StatCard label="Fase Atual" value={loading ? '—' : `${phase}/5`}
          icon={Layers} color="amber" sub={PHASE_LABELS[phase] ?? '—'} />
        <StatCard label="Instâncias" value={loading ? '—' : `${connected}/${instances.length}`}
          icon={Cpu} color="green" sub="conectadas agora" />
      </div>

      {/* Phase progress */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Progresso de Aquecimento</p>
            <p className="text-xs text-slate-500 mt-0.5">Fase {phase}/5 — {PHASE_LABELS[phase] ?? 'Não iniciado'}</p>
          </div>
          <span className={`badge-purple text-xs badge`}>~{10 - Math.min(10, stats?.totalDays ?? 0)} dias restantes</span>
        </div>
        <div className="relative h-2 bg-ghost-border rounded-full overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${phaseColor(phase)}`}
            style={{ width: `${phasePct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-600">
          {PHASE_LABELS.slice(1).map((l, i) => (
            <span key={i} className={i + 1 <= phase ? 'text-slate-400' : ''}>{l}</span>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-ghost-primary" />
            Mensagens por Dia (últimas 2 semanas)
          </p>
        </div>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-600 text-sm">
            Nenhuma sessão registrada ainda
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} width={35} />
              <Tooltip
                contentStyle={{ background: '#14141f', border: '1px solid #1e1e30', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#a78bfa' }}
              />
              <Area type="monotone" dataKey="msgs" name="Mensagens" stroke="#7c3aed" strokeWidth={2} fill="url(#grad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { to: '/warmup',    label: 'Iniciar Warmup',   desc: 'Aquece chips automaticamente',  color: 'text-violet-400 hover:border-violet-500/40' },
          { to: '/blast',     label: 'Disparar Msgs',    desc: 'Envio em massa para sua lista', color: 'text-cyan-400 hover:border-cyan-500/40' },
          { to: '/verify',    label: 'Verificar Números',desc: 'Filtra quem tem WhatsApp',      color: 'text-emerald-400 hover:border-emerald-500/40' },
        ].map(({ to, label, desc, color }) => (
          <Link key={to} to={to}
            className={`card flex items-center justify-between group transition-colors duration-150 hover:bg-ghost-card/80 border border-ghost-border ${color}`}>
            <div>
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
            </div>
            <ArrowRight className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" />
          </Link>
        ))}
      </div>
    </div>
  )
}
