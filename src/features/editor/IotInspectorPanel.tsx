import { useState, useEffect } from 'react';
import { Wifi, Send, Trash2, Globe, Radio, CheckCircle2, XCircle } from 'lucide-react';
import { FloatingPanel } from '../../components/ui/FloatingPanel';
import { VirtualNetworkStack, type NetworkLogEntry } from '../simulator/network/VirtualNetworkStack';
import { MqttBridge } from '../simulator/network/MqttBridge';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function IotInspectorPanel({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'traffic' | 'mqtt' | 'wifi' | 'inject'>('traffic');
  const [logs, setLogs] = useState<NetworkLogEntry[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | 'WIFI' | 'HTTP' | 'MQTT'>('ALL');
  const [injectTopic, setInjectTopic] = useState('home/sensor/temp');
  const [injectPayload, setInjectPayload] = useState('{"temperature":24.5,"humidity":58}');

  const network = VirtualNetworkStack.getInstance();
  const mqtt = MqttBridge.getInstance();

  useEffect(() => {
    setLogs(network.getLogs());
    const unsub = network.subscribe(() => {
      setLogs(network.getLogs());
    });
    return unsub;
  }, [network]);

  const wifiStatus = network.getStatus();
  const mqttStatus = mqtt.getStatus();

  const handleInjectPublish = () => {
    if (!injectTopic.trim()) return;
    mqtt.receiveIncoming(injectTopic, injectPayload);
  };

  const handleClearLogs = () => {
    network.clearLogs();
    setLogs([]);
  };

  const filteredLogs = logs.filter((l) => {
    if (filterType === 'ALL') return true;
    return l.type === filterType;
  });

  return (
    <FloatingPanel
      isOpen={isOpen}
      onClose={onClose}
      title="IoT & Cloud Telemetry Inspector"
      width="560px"
      icon={<Wifi size={14} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0f172a', color: '#e2e8f0', fontSize: '12px' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', padding: '0 8px', backgroundColor: '#090d16', gap: '4px' }}>
          <button
            onClick={() => setActiveTab('traffic')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'traffic' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'traffic' ? '#38bdf8' : '#94a3b8',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
            }}
          >
            <Radio size={13} />
            <span>Packet Traffic ({logs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('mqtt')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'mqtt' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'mqtt' ? '#38bdf8' : '#94a3b8',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
            }}
          >
            <Globe size={13} />
            <span>MQTT Broker</span>
          </button>

          <button
            onClick={() => setActiveTab('wifi')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'wifi' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'wifi' ? '#38bdf8' : '#94a3b8',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
            }}
          >
            <Wifi size={13} />
            <span>WiFi Stack</span>
          </button>

          <button
            onClick={() => setActiveTab('inject')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'inject' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'inject' ? '#38bdf8' : '#94a3b8',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
            }}
          >
            <Send size={13} />
            <span>Cloud Injector</span>
          </button>
        </div>

        {/* Tab 1: Packet Traffic */}
        {activeTab === 'traffic' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', backgroundColor: '#131d31', borderBottom: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['ALL', 'WIFI', 'HTTP', 'MQTT'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: filterType === t ? '#38bdf8' : '#1e293b',
                      color: filterType === t ? '#0f172a' : '#94a3b8',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button
                onClick={handleClearLogs}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={12} />
                <span>Clear</span>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>
              {filteredLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '32px' }}>
                  No network traffic captured yet. Start simulation with WiFi/MQTT code.
                </div>
              ) : (
                filteredLogs.map((l) => {
                  const typeColor = l.type === 'MQTT' ? '#38bdf8' : l.type === 'HTTP' ? '#a855f7' : '#22c55e';
                  const dirColor = l.direction === 'OUT' ? '#f59e0b' : l.direction === 'IN' ? '#4ade80' : '#94a3b8';
                  return (
                    <div
                      key={l.id}
                      style={{
                        display: 'flex',
                        gap: '8px',
                        padding: '4px 6px',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        alignItems: 'flex-start',
                      }}
                    >
                      <span style={{ color: '#64748b', fontSize: '10px', minWidth: '60px' }}>{l.timestamp}</span>
                      <span
                        style={{
                          backgroundColor: `${typeColor}22`,
                          color: typeColor,
                          padding: '1px 4px',
                          borderRadius: '3px',
                          fontSize: '9px',
                          fontWeight: 700,
                          minWidth: '40px',
                          textAlign: 'center',
                        }}
                      >
                        {l.type}
                      </span>
                      <span style={{ color: dirColor, fontWeight: 600, minWidth: '45px', fontSize: '10px' }}>
                        [{l.direction}]
                      </span>
                      <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>{l.summary}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: MQTT Broker Status */}
        {activeTab === 'mqtt' && (
          <div style={{ padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', backgroundColor: '#131d31', borderRadius: '6px', border: '1px solid #1e293b' }}>
              {mqttStatus.connected ? <CheckCircle2 color="#22c55e" size={20} /> : <XCircle color="#ef4444" size={20} />}
              <div>
                <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                  {mqttStatus.connected ? 'Broker Connected' : 'Broker Disconnected'}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                  {mqttStatus.broker}:{mqttStatus.port} (Client ID: {mqttStatus.clientId})
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 600, color: '#94a3b8', marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase' }}>
                Active Subscriptions ({mqttStatus.subscribedTopics.length})
              </div>
              {mqttStatus.subscribedTopics.length === 0 ? (
                <div style={{ color: '#64748b', fontStyle: 'italic' }}>No topics subscribed by device code</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {mqttStatus.subscribedTopics.map((top) => (
                    <span
                      key={top}
                      style={{
                        backgroundColor: '#1e293b',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        color: '#38bdf8',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '11px',
                      }}
                    >
                      {top}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: WiFi Stack Status */}
        {activeTab === 'wifi' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              <div style={{ padding: '10px', backgroundColor: '#131d31', borderRadius: '6px', border: '1px solid #1e293b' }}>
                <div style={{ color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase' }}>Network SSID</div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#38bdf8', marginTop: '2px' }}>
                  {wifiStatus.ssid || 'None'}
                </div>
              </div>

              <div style={{ padding: '10px', backgroundColor: '#131d31', borderRadius: '6px', border: '1px solid #1e293b' }}>
                <div style={{ color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase' }}>IP Address</div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#22c55e', marginTop: '2px', fontFamily: 'monospace' }}>
                  {wifiStatus.ip}
                </div>
              </div>

              <div style={{ padding: '10px', backgroundColor: '#131d31', borderRadius: '6px', border: '1px solid #1e293b' }}>
                <div style={{ color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase' }}>MAC Address</div>
                <div style={{ fontWeight: 600, fontSize: '11px', color: '#cbd5e1', marginTop: '2px', fontFamily: 'monospace' }}>
                  {wifiStatus.mac}
                </div>
              </div>

              <div style={{ padding: '10px', backgroundColor: '#131d31', borderRadius: '6px', border: '1px solid #1e293b' }}>
                <div style={{ color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase' }}>Signal Strength</div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#facc15', marginTop: '2px' }}>
                  {wifiStatus.rssi ? `${wifiStatus.rssi} dBm (Good)` : 'Disconnected'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Cloud Test Injector */}
        {activeTab === 'inject' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '4px', fontWeight: 600 }}>
                MQTT Topic
              </label>
              <input
                type="text"
                value={injectTopic}
                onChange={(e) => setInjectTopic(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#131d31',
                  border: '1px solid #1e293b',
                  borderRadius: '4px',
                  color: '#f8fafc',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '4px', fontWeight: 600 }}>
                Message Payload (JSON / String)
              </label>
              <textarea
                rows={4}
                value={injectPayload}
                onChange={(e) => setInjectPayload(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#131d31',
                  border: '1px solid #1e293b',
                  borderRadius: '4px',
                  color: '#f8fafc',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  resize: 'vertical',
                }}
              />
            </div>

            <button
              onClick={handleInjectPublish}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              <Send size={13} />
              <span>Simulate Cloud Message to Device</span>
            </button>
          </div>
        )}
      </div>
    </FloatingPanel>
  );
}
