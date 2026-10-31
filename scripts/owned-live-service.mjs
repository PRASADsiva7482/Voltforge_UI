// Test-only lifecycle control. Never discover/kill somebody else's process by port.
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { LiveChatBlocked } from './live-chat-report.mjs'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
export function portOpen(port) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', error => {
      socket.destroy()
      if (error.code === 'ECONNREFUSED') resolve(false)
      else reject(new LiveChatBlocked('LOCAL_SERVICE_PORT_CHECK_FAILED'))
    })
    socket.setTimeout(2000, () => { socket.destroy(); reject(new LiveChatBlocked('LOCAL_SERVICE_PORT_CHECK_FAILED')) })
  })
}

export class OwnedLiveService {
  #child
  #exited
  constructor({ command, args, cwd, env, port, ready, timeout = 120_000 }) {
    Object.assign(this, { command, args, cwd, env, port, ready, timeout })
  }
  async start() {
    if (this.#child) throw new LiveChatBlocked('OWNED_SERVICE_ALREADY_STARTED')
    if (await portOpen(this.port)) throw new LiveChatBlocked('LOCAL_SERVICE_PORT_OCCUPIED')
    const child = spawn(this.command, this.args, { cwd: this.cwd, env: this.env,
      windowsHide: true, shell: false, stdio: 'ignore' })
    this.#child = child
    let ended = false
    this.#exited = new Promise(resolve => {
      const finish = () => { ended = true; resolve() }
      child.once('exit', finish)
      child.once('error', finish)
    })
    try {
      const deadline = Date.now() + this.timeout
      while (Date.now() < deadline) {
        if (ended) throw new LiveChatBlocked('OWNED_SERVICE_EXITED')
        let ready = false
        try { ready = await this.ready() } catch { /* Startup may not listen yet. */ }
        if (ready && !ended) return
        await pause(250)
      }
      throw new LiveChatBlocked('OWNED_SERVICE_START_TIMEOUT')
    } catch (error) { await this.stop(); throw error }
  }
  async stop({ force = false } = {}) {
    if (!this.#child) return
    const child = this.#child
    if (child.exitCode === null && child.signalCode === null) child.kill(force ? 'SIGKILL' : 'SIGTERM')
    let exited = await Promise.race([this.#exited.then(() => true), pause(5000).then(() => false)])
    if (!exited) {
      child.kill('SIGKILL')
      exited = await Promise.race([this.#exited.then(() => true), pause(5000).then(() => false)])
    }
    if (!exited) throw new LiveChatBlocked('OWNED_SERVICE_STOP_TIMEOUT')
    this.#child = undefined
    // Process exit can precede Windows socket teardown. Wait for release without
    // killing any process that may have subsequently acquired the same port.
    const deadline = Date.now() + 5000
    while (await portOpen(this.port)) {
      if (Date.now() >= deadline) throw new LiveChatBlocked('LOCAL_SERVICE_PORT_STILL_OCCUPIED')
      await pause(100)
    }
  }
}
