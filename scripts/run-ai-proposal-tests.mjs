import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({
  appType: 'custom',
  logLevel: 'error',
  root,
  server: { middlewareMode: true },
});

try {
  const proposalModule = await vite.ssrLoadModule('/src/features/ai/aiProposal.ts');
  const transactionModule = await vite.ssrLoadModule('/src/features/ai/aiProposalTransaction.ts');
  const canvasModule = await vite.ssrLoadModule('/src/store/canvasStore.ts');
  const projectModule = await vite.ssrLoadModule('/src/store/projectStore.ts');
  const {
    buildAiProposal,
    calculateEditorRevision,
    defaultAiProposalSelection,
    isAiProposalCurrent,
  } = proposalModule;
  const { planAiProposalChanges } = transactionModule;
  const { useCanvasStore } = canvasModule;
  const { useProjectStore } = projectModule;

  const nodes = [
    {
      componentId: 'source-a',
      height: 40,
      id: 'source-a',
      name: 'Source A',
      pins: [{ id: 'out', name: 'OUT', type: 'bidirectional', x: 0, y: 0 }],
      properties: { resistance: 1000 },
      rotation: 0,
      type: 'TEST_SOURCE',
      width: 60,
      x: 10,
      y: 10,
    },
    {
      componentId: 'source-b',
      height: 40,
      id: 'source-b',
      name: 'Source B',
      pins: [{ id: 'in', name: 'IN', type: 'bidirectional', x: 0, y: 0 }],
      properties: {},
      rotation: 0,
      type: 'TEST_LOAD',
      width: 60,
      x: 120,
      y: 10,
    },
  ];
  const wires = [];
  const codeFiles = [{ content: 'digitalWrite(2, LOW);', filename: 'main.ino', language: 'cpp', sortOrder: 0 }];
  const sourceEditorRevision = calculateEditorRevision(nodes, wires, codeFiles);
  const proposal = buildAiProposal({
    additions: [{ between: ['source-a/out', 'source-b/in'], componentType: 'RESISTOR', value: '220', reason: 'Limit current' }],
    codeFixes: [{ description: 'Set the output low', from: 'digitalWrite(2, LOW);', line: 1, to: 'digitalWrite(2, HIGH);', type: 'replace' }],
    id: 'proposal-029',
    projectId: 'project-029',
    removals: [{ reason: 'Remove an unsafe wire', wireId: 'missing-wire' }],
    sourceEditorRevision,
    sourceProjectRevision: 'revision-029',
    valueChanges: [{ componentId: 'source-a', property: 'resistance', newValue: '470', reason: 'Increase resistance' }],
    wireSuggestions: [{ description: 'Connect the source to the load', fromComponentId: 'source-a', fromPin: 'out', toComponentId: 'source-b', toPin: 'in' }],
  });

  assert.ok(proposal);
  assert.deepEqual(proposal.items.map((item) => item.kind), ['wire', 'addition', 'value-change', 'removal', 'code-fix']);
  assert.deepEqual(defaultAiProposalSelection(proposal), proposal.items.map((item) => item.id));
  assert.equal(isAiProposalCurrent(proposal, {
    editorRevision: sourceEditorRevision,
    projectId: 'project-029',
    projectRevision: 'revision-029',
  }), true);
  assert.equal(isAiProposalCurrent(proposal, {
    editorRevision: sourceEditorRevision,
    projectId: 'project-029',
    projectRevision: 'revision-newer',
  }), false);

  const selected = proposal.items.filter((item) => item.kind !== 'removal').map((item) => item.id);
  const plan = planAiProposalChanges(proposal, selected, {
    activeCodeFile: { content: codeFiles[0].content, id: 'file-029' },
    nodes,
    wires,
  });
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.canvasChanged, true);
  assert.equal(plan.codeChanged, true);
  assert.equal(plan.nextNodes.length, nodes.length + 1);
  assert.equal(plan.nextWires.length, 3);
  assert.match(plan.nextCode, /digitalWrite\(2, HIGH\)/);

  useProjectStore.getState().setCurrentProject({ id: 'project-029', codeFiles: [{ id: 'file-029', content: codeFiles[0].content }] });
  useProjectStore.getState().updateCodeFileContent('file-029', plan.nextCode);
  assert.match(useProjectStore.getState().activeCodeFile.content, /digitalWrite\(2, HIGH\)/);
  useProjectStore.getState().updateCodeFileContent('file-029', plan.beforeCode);
  assert.equal(useProjectStore.getState().activeCodeFile.content, codeFiles[0].content);

  const staleRevision = calculateEditorRevision(nodes.map((node) => ({ ...node, x: node.x + 1 })), wires, codeFiles);
  assert.notEqual(staleRevision, sourceEditorRevision);
  assert.equal(isAiProposalCurrent(proposal, {
    editorRevision: staleRevision,
    projectId: 'project-029',
    projectRevision: 'revision-029',
  }), false);

  const rejected = planAiProposalChanges(proposal, proposal.items.map((item) => item.id), {
    activeCodeFile: { content: codeFiles[0].content, id: 'file-029' },
    nodes,
    wires,
  });
  assert.match(rejected.errors[0], /already exists|unsafe|no longer exists|missing|duplicate/i);
  assert.equal(rejected.nextNodes.length, nodes.length + 1);
  assert.equal(rejected.nextWires.length, 3);

  useCanvasStore.getState().loadCanvas(nodes, wires);
  const addedNode = { ...nodes[0], componentId: 'transaction-node', id: 'transaction-node', x: 220 };
  useCanvasStore.getState().commitCanvasSnapshot([...nodes, addedNode], wires);
  assert.equal(useCanvasStore.getState().history.length, 1);
  assert.equal(useCanvasStore.getState().historyIndex, 0);
  assert.equal(useCanvasStore.getState().nodes.length, nodes.length + 1);
  useCanvasStore.getState().undo();
  assert.equal(useCanvasStore.getState().nodes.length, nodes.length);

  console.log('AI proposal contract: typed review, revision guards, atomic planning, circuit changes, and firmware changes passed');
} finally {
  await vite.close();
}
