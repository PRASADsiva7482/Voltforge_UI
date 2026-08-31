import { create } from 'zustand';
import type { Project, CodeFile } from '../types/domain';

interface ProjectState {
  currentProject: Project | null;
  activeCodeFile: CodeFile | null;
  isDirty: boolean;
  isSaving: boolean;

  setCurrentProject: (project: Project | null) => void;
  setActiveCodeFile: (file: CodeFile | null) => void;
  updateCodeFileContent: (fileId: string, content: string) => void;
  setProjectUpdatedAt: (updatedAt: string) => void;
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  activeCodeFile: null,
  isDirty: false,
  isSaving: false,

  setCurrentProject: (project) =>
    set({
      currentProject: project,
      activeCodeFile: project?.codeFiles?.[0] || null,
      isDirty: false,
    }),

  setActiveCodeFile: (file) => set({ activeCodeFile: file }),

  updateCodeFileContent: (fileId, content) =>
    set((state) => {
      if (!state.currentProject) return state;
      const updatedFiles = state.currentProject.codeFiles.map((f) =>
        f.id === fileId ? { ...f, content } : f
      );
      return {
        currentProject: { ...state.currentProject, codeFiles: updatedFiles },
        activeCodeFile:
          state.activeCodeFile?.id === fileId
            ? { ...state.activeCodeFile, content }
            : state.activeCodeFile,
        isDirty: true,
      };
    }),

  setProjectUpdatedAt: (updatedAt) =>
    set((state) => state.currentProject
      ? { currentProject: { ...state.currentProject, updatedAt } }
      : state),

  setDirty: (isDirty) => set({ isDirty }),
  setSaving: (isSaving) => set({ isSaving }),
}));

import { boardPinRegistry } from '../features/canvas/pinRegistry';

export const SMART_DEVICE_PRESET: Project = {
  id: 'preset-smart-device',
  name: 'Smart Automation Controller',
  description: 'Fully automated smart device: LDR light control, I2C LCD display, DC motor controlled by SPDT relay.',
  boardType: 'ARDUINO_UNO',
  isPublic: true,
  forkCount: 0,
  viewCount: 0,
  tags: 'arduino,ldr,lcd,relay,motor,template',
  owner: {
    id: '00000000-0000-0000-0000-000000000000',
    keycloakId: 'system-admin',
    username: 'system-admin',
    email: 'admin@voltforge.in',
    displayName: 'System Admin',
    role: 'ADMIN',
    accountStatus: 'ACTIVE',
    createdAt: '2026-06-13T08:00:00Z',
    updatedAt: '2026-06-13T08:00:00Z',
  },
  codeFiles: [
    {
      id: 'preset-code-main',
      filename: 'main.ino',
      content: `// VoltForge Smart Automation Controller Preset
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

const int ldrPin = A0;
const int relayPin = 2;

void setup() {
  pinMode(relayPin, OUTPUT);
  lcd.init();
  lcd.backlight();
  Serial.begin(9600);
}

void loop() {
  int val = analogRead(ldrPin);
  
  // LDR is divider: V_A0 = 5V * (10k / (R_LDR + 10k))
  // Dark: R_LDR is high (~1M) -> V_A0 is low (< 0.1V) -> val < 200
  // Light: R_LDR is low (~100) -> V_A0 is high (~4.9V) -> val > 900
  if (val < 300) {
    digitalWrite(relayPin, HIGH);
    lcd.setCursor(0, 0);
    lcd.print("Light: DARK     ");
    lcd.setCursor(0, 1);
    lcd.print("Motor: ACTIVE   ");
  } else {
    digitalWrite(relayPin, LOW);
    lcd.setCursor(0, 0);
    lcd.print("Light: LIGHT    ");
    lcd.setCursor(0, 1);
    lcd.print("Motor: INACTIVE ");
  }
  delay(100);
}`,
      language: 'cpp',
      sortOrder: 0,
      createdAt: '2026-06-13T08:00:00Z',
      updatedAt: '2026-06-13T08:00:00Z',
    }
  ],
  canvasLayout: {
    viewport: { x: 0, y: 0, scale: 1 },
    nodes: [
      {
        id: 'node_uno',
        componentId: 'uno_comp',
        type: 'ARDUINO_UNO',
        name: 'Arduino Uno',
        x: 50,
        y: 200,
        width: 200,
        height: 150,
        rotation: 0,
        properties: { usbConnected: 'Yes', boardPowered: true },
        pins: boardPinRegistry['ARDUINO_UNO'] || [],
      },
      {
        id: 'node_bb',
        componentId: 'bb_comp',
        type: 'BREADBOARD',
        name: 'Breadboard',
        x: 350,
        y: 200,
        width: 220,
        height: 120,
        rotation: 0,
        properties: {},
        pins: boardPinRegistry['BREADBOARD'] || [],
      },
      {
        id: 'node_ldr',
        componentId: 'ldr_comp',
        type: 'SENSOR_LDR',
        name: 'LDR Light Sensor',
        x: 355,
        y: 200,
        width: 40,
        height: 40,
        rotation: 0,
        properties: { lightLevel: 50, resistanceDark: 1000000, resistanceLight: 10000 },
        pins: boardPinRegistry['SENSOR_LDR'] || [],
      },
      {
        id: 'node_res',
        componentId: 'res_comp',
        type: 'RESISTOR',
        name: 'Resistor',
        x: 384.65,
        y: 228,
        width: 90,
        height: 24,
        rotation: 0,
        properties: { resistance: 10000 },
        pins: boardPinRegistry['RESISTOR'] || [],
      },
      {
        id: 'node_lcd',
        componentId: 'lcd_comp',
        type: 'DISPLAY_LCD_I2C',
        name: 'LCD 16x2 (I2C)',
        x: 50,
        y: 420,
        width: 120,
        height: 60,
        rotation: 0,
        properties: { backlight: 'On', address: '0x27', line1: 'Initializing...', line2: '' },
        pins: boardPinRegistry['DISPLAY_LCD_I2C'] || [],
      },
      {
        id: 'node_relay',
        componentId: 'relay_comp',
        type: 'RELAY_SINGLE',
        name: 'Single Channel Relay',
        x: 350,
        y: 420,
        width: 70,
        height: 50,
        rotation: 0,
        properties: { isActive: false },
        pins: boardPinRegistry['RELAY_SINGLE'] || [],
      },
      {
        id: 'node_motor',
        componentId: 'motor_comp',
        type: 'MOTOR_DC',
        name: 'DC Motor',
        x: 500,
        y: 420,
        width: 70,
        height: 50,
        rotation: 0,
        properties: { resistance: 10 },
        pins: boardPinRegistry['MOTOR_DC'] || [],
      }
    ],
    wires: [
      {
        id: 'wire_5v_to_ldr',
        fromNodeId: 'node_uno',
        fromPinId: '5v',
        toNodeId: 'node_bb',
        toPinId: 'b1',
        color: '#ef4444',
        bendPoints: [],
        routingMode: 'auto',
      },
      {
        id: 'wire_gnd_to_res',
        fromNodeId: 'node_uno',
        fromPinId: 'gnd1',
        toNodeId: 'node_bb',
        toPinId: 'b18',
        color: '#3b82f6',
        bendPoints: [],
        routingMode: 'auto',
      },
      {
        id: 'wire_ldr_mid_to_a0',
        fromNodeId: 'node_uno',
        fromPinId: 'a0',
        toNodeId: 'node_bb',
        toPinId: 'b4',
        color: '#22c55e',
        bendPoints: [],
        routingMode: 'auto',
      },
      {
        id: 'wire_lcd_vcc_to_bb',
        fromNodeId: 'node_lcd',
        fromPinId: 'vcc',
        toNodeId: 'node_bb',
        toPinId: 'c1',
        color: '#ef4444',
        bendPoints: [],
        routingMode: 'auto',
      },
      {
        id: 'wire_lcd_gnd_to_uno',
        fromNodeId: 'node_lcd',
        fromPinId: 'gnd',
        toNodeId: 'node_uno',
        toPinId: 'gnd2',
        color: '#3b82f6',
        bendPoints: [],
        routingMode: 'auto',
      },
      {
        id: 'wire_lcd_sda_to_uno',
        fromNodeId: 'node_lcd',
        fromPinId: 'sda',
        toNodeId: 'node_uno',
        toPinId: 'a4',
        color: '#f59e0b',
        bendPoints: [],
        routingMode: 'auto',
      },
      {
        id: 'wire_lcd_scl_to_uno',
        fromNodeId: 'node_lcd',
        fromPinId: 'scl',
        toNodeId: 'node_uno',
        toPinId: 'a5',
        color: '#a855f7',
        bendPoints: [],
        routingMode: 'auto',
      },
      {
        id: 'wire_uno_d2_to_relay_coil',
        fromNodeId: 'node_uno',
        fromPinId: 'd2',
        toNodeId: 'node_relay',
        toPinId: 'coil1',
        color: '#22c55e',
        bendPoints: [],
        routingMode: 'auto',
      },
      {
        id: 'wire_relay_coil_gnd_to_bb',
        fromNodeId: 'node_relay',
        fromPinId: 'coil2',
        toNodeId: 'node_bb',
        toPinId: 'c18',
        color: '#3b82f6',
        bendPoints: [],
        routingMode: 'auto',
      },
      {
        id: 'wire_relay_com_to_bb_5v',
        fromNodeId: 'node_relay',
        fromPinId: 'com',
        toNodeId: 'node_bb',
        toPinId: 'd1',
        color: '#ef4444',
        bendPoints: [],
        routingMode: 'auto',
      },
      {
        id: 'wire_relay_no_to_motor',
        fromNodeId: 'node_relay',
        fromPinId: 'no',
        toNodeId: 'node_motor',
        toPinId: 'm1',
        color: '#f97316',
        bendPoints: [],
        routingMode: 'auto',
      },
      {
        id: 'wire_motor_gnd_to_bb',
        fromNodeId: 'node_motor',
        fromPinId: 'm2',
        toNodeId: 'node_bb',
        toPinId: 'd18',
        color: '#3b82f6',
        bendPoints: [],
        routingMode: 'auto',
      }
    ]
  },
  createdAt: '2026-06-13T08:00:00Z',
  updatedAt: '2026-06-13T08:00:00Z',
};

