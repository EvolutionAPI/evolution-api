import { useEffect, useRef, useState } from 'react'
import { Send, Upload, X, CheckCircle, XCircle, Download, Users } from 'lucide-react'
import { getSocket } from '../socket'
import { api, Instance } from '../api'

interface BlastResult {
  number: string; name?: string; status: 'sent' | 'failed' | 'invalid'
  messageId?: string; error?: string
}
interface BlastReport {
  total: number; sent: number; failed: number; invalid: number
  results: BlastResult[]; startedAt: string; durationMs?: number
}

export default function Blast() {
  const [instances, setInst] = useState<Instance[]>([])
  const [instance, setInstance] = useState('')
  const [message, setMessage] = useState('')
  const [numbers, setNumbers] = useState('')
  const [concurrency, setConcurrency] = useState(5)
  const [delay, setDelay] = useState(3000)
  const [verify, setVerify] = useState(true)
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<BlastReport | null>(null)
  const [progress, setProgress] = useState(0)
  const [uploadedCount, setUploadedCount] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const socketRef = useRef(getSocket())

  useEffect(() => {
    api.instances.list().then(list => {
      setInst(list)
      const first = list.find(i => i.connectionStatus === 'open')
      if (first) setInstance(first.instanceName)
    }).catch(() => {})

    const sock = socketRef.current
    const onComplete = (r: BlastReport) => { setReport(r); setRunning(false); setProgress(100) }
    const onError    = () => { setRunning(false) }
    sock.on('blast:complete', onComplete)
    sock.on('blast:error', onError)
    return () => { sock.off('blast:complete', onComplete); sock.off('blast:error', onError) }
  }, [])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await api.blast.upload(file)
    setUploadedCount(result.count)
    const text = await file.text()
    setNumbers(text)
  }

  const handleSend = async () => {
    if (!instance || !message.trim() || !numbers.trim()) return alert('Preencha todos os campos.')
    const count = numbers.split('\n').filter(l => l.trim() && l.replace(/\D/g, '').length >= 10).length
    if (!confirm(`Disparar para ~${count} número(s)?`)) return
    setReport(null); setProgress(0); setRunning(true)
    await api.blast.send({ instance, message, numbers, concurrency, delayBetweenMs: delay, verifyNumbers: verify })
    const interval = setInterval(() => {
      setProgress(p => { const next = p + 2; if (next >= 95) clearInterval(interval); return Math.min(95, next) })
    }, 500)
  }

  const downloadReport = () => {
    if (!report) return
    const csv = ['numero,nome,status,erro',
      ...report.results.map(r => `${r.number},${r.name ?? ''},${r.status},${r.error ?? ''}`)
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `blast-report-${Date.now()}.csv`
    a.click()
  }

  const lineCount = numbers.split('\n').filter(l => l.replace(/\D/g, '').length >= 10).length

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-cyan-400" /> Disparar Mensagens
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Envio em massa para sua lista de contatos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Config */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card space-y-4">
            <p className="text-sm font-medium text-white">Configuração</p>

            <div>
              <label className="label">Instância remetente</label>
              <select value={instance} onChange={e => setInstance(e.target.value)} className="w-full">
                <option value="">Selecionar...</option>
                {instances.map(i => (
                  <option key={i.instanceName} value={i.instanceName}
                    disabled={i.connectionStatus !== 'open'}>
                    {i.instanceName} {i.connectionStatus !== 'open' ? '(desconectada)' : '✓'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Mensagem</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Olá {{nome}}, temos uma oferta especial para você!"
                rows={5}
                className="w-full resize-none"
              />
              <p className="text-[10px] text-slate-600 mt-1">Use {'{{nome}}'} para personalizar com o nome da coluna 2 do CSV</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Concorrência</label>
                <input type="number" min={1} max={20} value={concurrency}
                  onChange={e => setConcurrency(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="label">Delay (ms)</label>
                <input type="number" min={500} step={500} value={delay}
                  onChange={e => setDelay(Number(e.target.value))} className="w-full" />
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={verify} onChange={e => setVerify(e.target.checked)}
                className="w-3.5 h-3.5 accent-violet-500" />
              <span className="text-sm text-slate-300">Verificar números antes de enviar</span>
            </label>

            <button onClick={handleSend} disabled={running || !instance || !message || !numbers}
              className="btn-primary w-full justify-center">
              {running
                ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Disparando...</>
                : <><Send className="w-4 h-4" /> Disparar</>
              }
            </button>
          </div>
        </div>

        {/* Numbers */}
        <div className="lg:col-span-3 space-y-4">
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" /> Lista de números
              </p>
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()} className="btn-ghost text-xs">
                  <Upload className="w-3.5 h-3.5" /> Importar CSV/TXT
                </button>
                {numbers && <button onClick={() => { setNumbers(''); setUploadedCount(null) }} className="btn-ghost text-xs">
                  <X className="w-3.5 h-3.5" />
                </button>}
              </div>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
            </div>

            {uploadedCount !== null && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-xs text-emerald-400">
                {uploadedCount} números importados do arquivo
              </div>
            )}

            <textarea
              value={numbers}
              onChange={e => { setNumbers(e.target.value); setUploadedCount(null) }}
              placeholder={'5511999990001,João\n5511999990002,Maria\n5511999990003'}
              rows={12}
              className="w-full resize-none font-mono text-xs"
            />
            <p className="text-[10px] text-slate-600">
              {lineCount > 0 ? `${lineCount} número(s) detectado(s)` : 'Um número por linha. Formato: numero,nome (nome é opcional)'}
            </p>
          </div>

          {/* Progress */}
          {running && (
            <div className="card space-y-2 animate-slide-in">
              <p className="text-xs text-slate-400">Disparando...</p>
              <div className="h-1.5 bg-ghost-border rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Report */}
          {report && (
            <div className="card space-y-4 animate-slide-in">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">Relatório</p>
                <button onClick={downloadReport} className="btn-ghost text-xs">
                  <Download className="w-3.5 h-3.5" /> Exportar CSV
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Total',     value: report.total,   color: 'text-slate-300'  },
                  { label: 'Enviados',  value: report.sent,    color: 'text-emerald-400'},
                  { label: 'Falhas',    value: report.failed,  color: 'text-red-400'    },
                  { label: 'Inválidos', value: report.invalid, color: 'text-slate-500'  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-ghost-surface rounded-lg p-2.5">
                    <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {report.results.slice(0, 100).map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-ghost-border/40">
                    {r.status === 'sent'
                      ? <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      : <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                    }
                    <span className="text-slate-400 font-mono">{r.number}</span>
                    {r.name && <span className="text-slate-500">({r.name})</span>}
                    {r.error && <span className="text-red-400 ml-auto truncate max-w-32">{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
