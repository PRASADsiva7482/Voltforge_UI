import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/features/simulator/resultSubscription.ts', import.meta.url), 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const contract = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled)}`);
contract.assertResultSubscriptionContract();
console.log('result subscription contract: deterministic consumer assertions passed');

