import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/features/simulator/workerBackpressure.ts', import.meta.url), 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const protocol = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled)}`);
protocol.assertWorkerBackpressureProtocol();
console.log('worker backpressure protocol: 22 deterministic assertions passed');
