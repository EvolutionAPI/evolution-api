import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] })
  }
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
