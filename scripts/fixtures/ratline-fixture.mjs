export function createRatlineFixture(pads = 128, nets = 1) {
  const nodes = [], footprints = [], wires = []
  for (let net = 0; net < nets; net++) {
    for (let i = 0; i < pads; i++) {
      const id = `n${net}-${i}`
      const pin = { id: 'p', name: '1', type: 'power', x: 0, y: 0 }
      nodes.push({ id, componentId: id, type: 'CUSTOM', name: id, x: i * 30, y: net * 50, width: 20, height: 20, rotation: 0, properties: {}, pins: [pin] })
      footprints.push({ id: `fp_${id}`, componentId: id, componentType: 'CUSTOM', name: id, packageType: 'DIP',
        x: 12 + (i % 32) * 7, y: 12 + Math.floor(i / 32) * 7 + net * 130, rotation: 0, width: 5, height: 4,
        pads: [{ id: 'p', name: '1', x: 0, y: .8, width: 1.4, height: 1.4, shape: 'rect', drillDiameter: .8, netId: i ? `w${net}-${i}` : `w${net}-1` }] })
      if (i) wires.push({ id: `w${net}-${i}`, fromNodeId: `n${net}-0`, fromPinId: 'p', toNodeId: id, toPinId: 'p', routingMode: 'curved', color: '#22c55e', bendPoints: [{ x: 10, y: 10 }] })
    }
  }
  return { nodes, wires, footprints, traces: [], vias: [], boardWidth_mm: 240, boardHeight_mm: 140 * nets }
}
