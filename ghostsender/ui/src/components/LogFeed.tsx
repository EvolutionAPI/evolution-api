import { useEffect, useRef } from 'react'
import { Terminal } from 'lucide-react'

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: string
}

interface Props {
  logs: LogEntry[]
  maxHeight?: string
}

const levelClass: Record<LogEntry['level'], string> = {
  info:  'text-slate-300',
  warn:  'text-amber-400',
  error: 'text-red-400',
  debug: 'text-slate-500',
}

const levelPrefix: Record<LogEntry['level'], string> = {
  info:  'INFO ',
  warn:  'WARN ',
  error: 'ERR  ',
  debug: 'DBG  ',
}

export default function LogFeed({ logs, maxHeight = '280px' }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-ghost-border bg-ghost-surface">
        <Terminal className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-xs font-medium text-slate-400">Log em tempo real</span>
        <span className="ml-auto text-[10px] text-slate-600 font-mono">{logs.length} entradas</span>
      </div>
      <div
        className="overflow-y-auto font-mono text-[11px] leading-5 p-3 space-y-0.5 bg-black/30"
        style={{ maxHeight }}
      >
        {logs.length === 0 && (
          <p className="text-slate-600 py-4 text-center text-xs">Aguardando atividade...</p>
        )}
        {logs.map((log, i) => (
          <div key={i} className={`flex gap-2 ${levelClass[log.level]}`}>
            <span className="text-slate-600 flex-shrink-0">
              {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-slate-600 flex-shrink-0">{levelPrefix[log.level]}</span>
            <span className="break-all">{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
