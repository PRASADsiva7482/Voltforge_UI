import { createReadStream, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { Plugin } from 'vite'

// Serve the already-installed Monaco runtime from this application. A blocked
// CDN must not leave the core code editor permanently on "Loading...".
export function monacoAssets(): Plugin {
  const require = createRequire(import.meta.url)
  const packageFile = path.resolve(path.dirname(require.resolve('monaco-editor')), '../../package.json')
  const version: string = JSON.parse(readFileSync(packageFile, 'utf8')).version
  const root = path.join(path.dirname(packageFile), 'min', 'vs')
  const prefix = `/vendor/monaco/${version}/vs/`
  return {
    name: 'voltforge-monaco-assets',
    config: () => ({ define: { 'import.meta.env.VITE_MONACO_BASE': JSON.stringify(prefix.slice(0, -1)) } }),
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = (request.url || '').split('?')[0]
        if (!url.startsWith(prefix)) return next()
        let file: string
        try { file = path.resolve(root, decodeURIComponent(url.slice(prefix.length))) } catch { response.statusCode = 400; response.end(); return }
        if (!file.startsWith(root + path.sep)) { response.statusCode = 403; response.end(); return }
        try { if (!statSync(file).isFile()) return next() } catch { return next() }
        const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.wasm': 'application/wasm' }
        response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream')
        createReadStream(file).on('error', () => response.destroy()).pipe(response)
      })
    },
    generateBundle() {
      const emit = (directory: string) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const file = path.join(directory, entry.name)
          if (entry.isDirectory()) emit(file)
          else this.emitFile({ type: 'asset', fileName: prefix.slice(1) + path.relative(root, file).replaceAll('\\', '/'), source: readFileSync(file) })
        }
      }
      emit(root)
      this.emitFile({ type: 'asset', fileName: prefix.slice(1).replace(/vs\/$/, 'LICENSE'), source: readFileSync(path.join(path.dirname(packageFile), 'LICENSE')) })
    },
  }
}
