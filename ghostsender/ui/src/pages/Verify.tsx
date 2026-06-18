import { useState } from 'react'
import { Search, Download, CheckCircle, XCircle, Upload } from 'lucide-react'
import { api, Instance, VerifyResult } from '../api'
import { useEffect, useRef } from 'react'

export default function Verify() {
  const [instances, setInst] = useState<Instance[]>([])
  const [instance, setInstance] = useState('')
  const [numbers, setNumbers] = useState('')
  const [results, setResults] = useState<VerifyResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.instances.list().then(list => {
      setInst(list)
      const first = list.find(i => i.connectionStatus === 'open')
      if (first) setInstance(first.instanceName)
    }).catch(() => {})
  }, [])

  const handleCheck = async () => {
    if (!instance || !numbers.trim()) return
    setLoading(true); setResults(null)
    try {
      const r = await api.verify.check({ instance, numbers })
      setResults(r)
    } finally {
      setLoading(false)
    }
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setNumbers(await f.text())
  }

  const downloadValid = () => {
    if (!results) return
    const valid = results.filter(r => r.exists).map(r => r.number).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([valid], { type: 'text/plain' }))
    a.download = `numeros-validos-${Date.now()}.txt`
    a.click()
  }

  const valid   = results?.filter(r => r.exists) ?? []
  const invalid = results?.filter(r => !r.exists) ?? []
  const pct     = results ? Math.round((valid.length / results.length) * 100) : 0

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-white flex items-center gap-2">
          <Search className="w-5 h-5 text-emerald-400" /> Verificar Números
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Descubra quais números possuem WhatsApp ativo</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Input */}
        <div className="space-y-4">
          <div className="card space-y-4">
            <div>
              <label className="label">Instância</label>
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">Números</label>
                <button onClick={() => fileRef.current?.click()} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors">
                  <Upload className="w-3 h-3" /> Importar arquivo
                </button>
                <input ref={fileRef} type="file" accept=".txt,.csv" className="hidden" onChange={handleFile} />
              </div>
              <textarea
                value={numbers}
                onChange={e => setNumbers(e.target.value)}
                placeholder={'5511999990001\n5521999990002\n5531999990003'}
                rows={10}
                className="w-full font-mono text-xs resize-none"
              />
              <p className="text-[10px] text-slate-600 mt-1">
                {numbers.split('\n').filter(l => l.replace(/\D/g, '').length >= 10).length} número(s) detectado(s)
              </p>
            </div>

            <button onClick={handleCheck} disabled={loading || !instance || !numbers.trim()}
              className="btn-primary w-full justify-center">
              {loading
                ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verificando...</>
                : <><Search className="w-4 h-4" /> Verificar</>
              }
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {results === null && !loading && (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <Search className="w-10 h-10 text-slate-700 mb-3" />
              <p className="text-sm text-slate-500">Cole os números e clique em Verificar</p>
            </div>
          )}

          {results !== null && (
            <div className="space-y-4 animate-slide-in">
              {/* Summary */}
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">Resultado</p>
                  <button onClick={downloadValid} className="btn-ghost text-xs">
                    <Download className="w-3.5 h-3.5" /> Exportar válidos
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-ghost-surface rounded-lg p-3">
                    <p className="text-xl font-bold text-white tabular-nums">{results.length}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Total</p>
                  </div>
                  <div className="bg-emerald-500/10 rounded-lg p-3">
                    <p className="text-xl font-bold text-emerald-400 tabular-nums">{valid.length}</p>
                    <p className="text-[10px] text-emerald-600 mt-0.5">Com WhatsApp</p>
                  </div>
                  <div className="bg-red-500/10 rounded-lg p-3">
                    <p className="text-xl font-bold text-red-400 tabular-nums">{invalid.length}</p>
                    <p className="text-[10px] text-red-600 mt-0.5">Sem WhatsApp</p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Taxa de validade</span><span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-ghost-border rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>

              {/* List */}
              <div className="card overflow-hidden p-0 max-h-72 overflow-y-auto">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-ghost-border/50 hover:bg-ghost-surface/50">
                    {r.exists
                      ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      : <XCircle    className="w-4 h-4 text-red-400 flex-shrink-0" />
                    }
                    <span className="font-mono text-sm text-slate-300">{r.number}</span>
                    {r.name && <span className="text-xs text-slate-500">({r.name})</span>}
                    {r.exists && r.jid && (
                      <span className="ml-auto text-[10px] text-slate-600 font-mono truncate max-w-32">{r.jid}</span>
                    )}
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
