import { useEffect, useState } from 'react'
import {
  Cpu, Plus, RefreshCw, Trash2, LogOut, Wifi, WifiOff, QrCode, RotateCcw
} from 'lucide-react'
import { api, Instance, CreateInstanceDto } from '../api'

export default function Instances() {
  const [instances, setInst]   = useState<Instance[]>([])
  const [loading, setLoading]  = useState(true)
  const [showCreate, setCreate] = useState(false)
  const [qr, setQr]            = useState<{ name: string; base64: string } | null>(null)
  const [form, setForm]        = useState<CreateInstanceDto>({ instanceName: '', number: '', qrcode: true })
  const [creating, setCreating] = useState(false)
  const [refreshing, setRefresh] = useState(false)

  const load = async () => {
    setRefresh(true)
    try { setInst(await api.instances.list()) }
    catch { /* ignore */ }
    finally { setLoading(false); setRefresh(false) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!form.instanceName.trim()) return
    setCreating(true)
    try {
      await api.instances.create(form)
      setCreate(false)
      setForm({ instanceName: '', number: '', qrcode: true })
      await load()
      if (form.qrcode) {
        const res = await api.instances.connect(form.instanceName)
        if (res.qrcode?.base64) setQr({ name: form.instanceName, base64: res.qrcode.base64 })
      }
    } finally { setCreating(false) }
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`Deletar instância "${name}"? Esta ação é irreversível.`)) return
    await api.instances.delete(name)
    load()
  }

  const handleLogout = async (name: string) => {
    await api.instances.logout(name); load()
  }

  const handleRestart = async (name: string) => {
    await api.instances.restart(name); setTimeout(load, 2000)
  }

  const handleConnect = async (name: string) => {
    const res = await api.instances.connect(name)
    if (res.qrcode?.base64) setQr({ name, base64: res.qrcode.base64 })
  }

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-violet-400" /> Instâncias
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Gerenciar conexões WhatsApp</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={refreshing} className="btn-ghost text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setCreate(true)} className="btn-primary text-xs">
            <Plus className="w-4 h-4" /> Nova instância
          </button>
        </div>
      </div>

      {/* Instances grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card animate-pulse h-36 bg-ghost-card/50" />
          ))}
        </div>
      ) : instances.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <Cpu className="w-12 h-12 text-slate-700 mb-3" />
          <p className="text-slate-500 text-sm">Nenhuma instância criada</p>
          <button onClick={() => setCreate(true)} className="btn-primary mt-4 text-sm">
            <Plus className="w-4 h-4" /> Criar primeira instância
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {instances.map(inst => (
            <div key={inst.instanceName} className="card space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {inst.profilePicUrl ? (
                    <img src={inst.profilePicUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-ghost-primary/20 flex items-center justify-center flex-shrink-0">
                      <Cpu className="w-4 h-4 text-ghost-primary" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{inst.instanceName}</p>
                    <p className="text-xs text-slate-500 truncate">{inst.ownerJid ?? 'Não conectado'}</p>
                  </div>
                </div>
                {inst.connectionStatus === 'open'
                  ? <span className="badge-green flex-shrink-0"><Wifi className="w-3 h-3" /> Online</span>
                  : <span className="badge-red flex-shrink-0"><WifiOff className="w-3 h-3" /> Offline</span>
                }
              </div>

              <div className="flex flex-wrap gap-1.5">
                {inst.connectionStatus !== 'open' && (
                  <button onClick={() => handleConnect(inst.instanceName)} className="btn-accent text-xs py-1.5 px-2.5">
                    <QrCode className="w-3 h-3" /> Conectar
                  </button>
                )}
                <button onClick={() => handleRestart(inst.instanceName)} className="btn-ghost text-xs py-1.5 px-2.5">
                  <RotateCcw className="w-3 h-3" /> Reiniciar
                </button>
                {inst.connectionStatus === 'open' && (
                  <button onClick={() => handleLogout(inst.instanceName)} className="btn-ghost text-xs py-1.5 px-2.5">
                    <LogOut className="w-3 h-3" /> Logout
                  </button>
                )}
                <button onClick={() => handleDelete(inst.instanceName)} className="btn-danger text-xs py-1.5 px-2.5 ml-auto">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={e => { if (e.target === e.currentTarget) setCreate(false) }}>
          <div className="bg-ghost-card border border-ghost-border rounded-2xl p-6 w-full max-w-sm space-y-4 animate-slide-in">
            <h2 className="text-base font-semibold text-white">Nova Instância</h2>
            <div>
              <label className="label">Nome da instância</label>
              <input value={form.instanceName} onChange={e => setForm(p => ({ ...p, instanceName: e.target.value }))}
                placeholder="meu-chip-01" className="w-full" />
            </div>
            <div>
              <label className="label">Número (opcional)</label>
              <input value={form.number ?? ''} onChange={e => setForm(p => ({ ...p, number: e.target.value }))}
                placeholder="5511999990001" className="w-full" />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={form.qrcode} onChange={e => setForm(p => ({ ...p, qrcode: e.target.checked }))}
                className="w-3.5 h-3.5 accent-violet-500" />
              <span className="text-sm text-slate-300">Exibir QR Code ao criar</span>
            </label>
            <div className="flex gap-2">
              <button onClick={() => setCreate(false)} className="btn-ghost flex-1 justify-center">Cancelar</button>
              <button onClick={handleCreate} disabled={creating || !form.instanceName} className="btn-primary flex-1 justify-center">
                {creating ? 'Criando...' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code modal */}
      {qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setQr(null)}>
          <div className="bg-ghost-card border border-ghost-border rounded-2xl p-6 space-y-4 animate-slide-in" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-white text-center">Escanear QR Code</h2>
            <p className="text-xs text-slate-500 text-center">{qr.name}</p>
            <div className="flex justify-center">
              <img src={`data:image/png;base64,${qr.base64}`} alt="QR Code" className="w-56 h-56 rounded-xl" />
            </div>
            <p className="text-xs text-slate-500 text-center">Abra o WhatsApp → Aparelhos conectados → Conectar aparelho</p>
            <button onClick={() => setQr(null)} className="btn-ghost w-full justify-center">Fechar</button>
          </div>
        </div>
      )}
    </div>
  )
}
