import type { BoardType, PinPosition } from '../../types/domain';

type PinType = PinPosition['type'];

export type BoardFootprint =
  | 'uno'
  | 'mega'
  | 'nano'
  | 'esp32'
  | 'esp8266'
  | 'pico'
  | 'pi40'
  | 'stm32'
  | 'teensy'
  | 'microbit'
  | 'xiao'
  | 'feather'
  | 'eval'
  | 'beaglebone'
  | 'avr28'
  | 'attiny8';

export type BoardCatalogEntry = {
  type: BoardType;
  name: string;
  family: string;
  footprint: BoardFootprint;
  features: string[];
  logicVoltage: 3.3 | 5;
  clock: string;
  compiler: 'avr' | 'arduino-core' | 'linux' | 'external' | 'canvas-only';
  sortOrder: number;
};

export const BOARD_FOOTPRINT_DIMENSIONS: Record<BoardFootprint, { w: number; h: number }> = {
  uno: { w: 200, h: 150 },
  mega: { w: 280, h: 120 },
  nano: { w: 100, h: 160 },
  esp32: { w: 100, h: 160 },
  esp8266: { w: 95, h: 150 },
  pico: { w: 100, h: 180 },
  pi40: { w: 120, h: 170 },
  stm32: { w: 110, h: 170 },
  teensy: { w: 95, h: 170 },
  microbit: { w: 150, h: 90 },
  xiao: { w: 76, h: 110 },
  feather: { w: 110, h: 180 },
  eval: { w: 150, h: 110 },
  beaglebone: { w: 165, h: 190 },
  avr28: { w: 140, h: 70 },
  attiny8: { w: 80, h: 60 },
};

const board = (
  type: BoardType,
  name: string,
  family: string,
  footprint: BoardFootprint,
  features: string[],
  logicVoltage: 3.3 | 5,
  clock: string,
  compiler: BoardCatalogEntry['compiler'],
  sortOrder: number,
): BoardCatalogEntry => ({
  type,
  name,
  family,
  footprint,
  features,
  logicVoltage,
  clock,
  compiler,
  sortOrder,
});

export const BOARD_CATALOG: BoardCatalogEntry[] = [
  board('ARDUINO_UNO', 'Arduino Uno R3', 'Arduino', 'uno', ['ATmega328P', '14 digital I/O', '6 analog inputs'], 5, '16MHz', 'avr', 1),
  board('ARDUINO_UNO_R4', 'Arduino Uno R4', 'Arduino', 'uno', ['Renesas RA4M1', 'Uno shield layout', '12-bit DAC'], 5, '48MHz', 'arduino-core', 2),
  board('ARDUINO_NANO', 'Arduino Nano', 'Arduino', 'nano', ['ATmega328P', 'Breadboard friendly', '8 analog inputs'], 5, '16MHz', 'avr', 3),
  board('ARDUINO_NANO_EVERY', 'Arduino Nano Every', 'Arduino', 'nano', ['ATmega4809', 'Nano footprint', '5V logic'], 5, '20MHz', 'arduino-core', 4),
  board('ARDUINO_NANO_33_IOT', 'Arduino Nano 33 IoT', 'Arduino', 'nano', ['SAMD21', 'Wi-Fi', 'Bluetooth'], 3.3, '48MHz', 'arduino-core', 5),
  board('ARDUINO_MEGA', 'Arduino Mega 2560', 'Arduino', 'mega', ['ATmega2560', '54 digital I/O', '16 analog inputs'], 5, '16MHz', 'avr', 6),
  board('ARDUINO_LEONARDO', 'Arduino Leonardo', 'Arduino', 'uno', ['ATmega32U4', 'Native USB', 'Uno-style headers'], 5, '16MHz', 'arduino-core', 7),
  board('ARDUINO_MICRO', 'Arduino Micro', 'Arduino', 'nano', ['ATmega32U4', 'Native USB', 'Breadboard friendly'], 5, '16MHz', 'arduino-core', 8),
  board('ARDUINO_DUE', 'Arduino Due', 'Arduino', 'mega', ['SAM3X8E ARM Cortex-M3', '3.3V logic', '54 digital I/O'], 3.3, '84MHz', 'arduino-core', 9),
  board('ARDUINO_GIGA_R1', 'Arduino GIGA R1 WiFi', 'Arduino', 'mega', ['STM32H747XI', 'Wi-Fi', 'Bluetooth', 'advanced I/O'], 3.3, '480MHz', 'arduino-core', 10),
  board('ARDUINO_PORTENTA_H7', 'Arduino Portenta H7', 'Arduino', 'eval', ['STM32H747', 'dual-core', 'industrial edge'], 3.3, '480MHz', 'arduino-core', 11),

  board('ESP8266', 'ESP8266 NodeMCU', 'ESP8266', 'esp8266', ['Wi-Fi', 'low cost', 'Lua/Arduino support'], 3.3, '80MHz', 'arduino-core', 40),
  board('ESP8266_WEMOS_D1_MINI', 'WeMos D1 Mini', 'ESP8266', 'esp8266', ['Wi-Fi', 'compact', 'shield ecosystem'], 3.3, '80MHz', 'arduino-core', 41),
  board('ESP8266_ESP01', 'ESP-01', 'ESP8266', 'esp8266', ['Wi-Fi', '8-pin module', 'serial programming'], 3.3, '80MHz', 'arduino-core', 42),
  board('ESP8266_ESP12E', 'ESP-12E', 'ESP8266', 'esp8266', ['Wi-Fi', 'module form factor', 'many GPIO'], 3.3, '80MHz', 'arduino-core', 43),

  board('ESP32', 'ESP32 DevKit V1', 'ESP32', 'esp32', ['Wi-Fi', 'Bluetooth', 'dual-core MCU'], 3.3, '240MHz', 'arduino-core', 70),
  board('ESP32_WROOM', 'ESP32-WROOM', 'ESP32', 'esp32', ['Wi-Fi', 'Bluetooth', 'module reference'], 3.3, '240MHz', 'arduino-core', 71),
  board('ESP32_WROVER', 'ESP32-WROVER', 'ESP32', 'esp32', ['Wi-Fi', 'Bluetooth', 'PSRAM'], 3.3, '240MHz', 'arduino-core', 72),
  board('ESP32_S2', 'ESP32-S2', 'ESP32', 'esp32', ['Wi-Fi', 'USB OTG', 'single-core'], 3.3, '240MHz', 'arduino-core', 73),
  board('ESP32_S3', 'ESP32-S3', 'ESP32', 'esp32', ['Wi-Fi', 'Bluetooth LE', 'AI acceleration'], 3.3, '240MHz', 'arduino-core', 74),
  board('ESP32_C3', 'ESP32-C3', 'ESP32', 'esp32', ['Wi-Fi', 'Bluetooth LE', 'RISC-V'], 3.3, '160MHz', 'arduino-core', 75),
  board('ESP32_C6', 'ESP32-C6', 'ESP32', 'esp32', ['Wi-Fi 6', 'Bluetooth LE', 'Thread/Zigbee'], 3.3, '160MHz', 'arduino-core', 76),
  board('ESP32_H2', 'ESP32-H2', 'ESP32', 'esp32', ['Bluetooth LE', 'Thread', 'Zigbee'], 3.3, '96MHz', 'arduino-core', 77),
  board('ESP32_TTGO', 'TTGO ESP32', 'ESP32', 'esp32', ['Wi-Fi', 'Bluetooth', 'maker modules'], 3.3, '240MHz', 'arduino-core', 78),
  board('ESP32_LILYGO', 'LilyGO ESP32', 'ESP32', 'esp32', ['Wi-Fi', 'Bluetooth', 'display/module variants'], 3.3, '240MHz', 'arduino-core', 79),
  board('ESP32_M5STACK', 'M5Stack ESP32', 'ESP32', 'esp32', ['Wi-Fi', 'Bluetooth', 'modular stack'], 3.3, '240MHz', 'arduino-core', 80),

  board('RASPBERRY_PI_PICO', 'Raspberry Pi Pico', 'Raspberry Pi Pico', 'pico', ['RP2040', 'PIO', 'microcontroller'], 3.3, '133MHz', 'arduino-core', 110),
  board('RASPBERRY_PI_PICO_W', 'Raspberry Pi Pico W', 'Raspberry Pi Pico', 'pico', ['RP2040', 'Wi-Fi', 'Bluetooth'], 3.3, '133MHz', 'arduino-core', 111),
  board('RASPBERRY_PI_PICO_2', 'Raspberry Pi Pico 2', 'Raspberry Pi Pico', 'pico', ['RP2350', 'dual architecture', 'microcontroller'], 3.3, '150MHz', 'arduino-core', 112),

  board('RASPBERRY_PI_ZERO_2_W', 'Raspberry Pi Zero 2 W', 'Raspberry Pi SBC', 'pi40', ['Linux SBC', 'WiFi', 'Bluetooth 4.2', 'Mini HDMI', 'CSI camera', '40-pin header'], 3.3, '1GHz', 'linux', 140),
  board('RASPBERRY_PI_3', 'Raspberry Pi 3', 'Raspberry Pi SBC', 'pi40', ['Linux SBC', 'WiFi', 'Bluetooth 4.1', 'HDMI', '10/100 Ethernet', '40-pin header'], 3.3, '1.2GHz', 'linux', 141),
  board('RASPBERRY_PI_4', 'Raspberry Pi 4', 'Raspberry Pi SBC', 'pi40', ['Linux SBC', 'Gigabit Ethernet', '2x USB 3.0', '2x USB 2.0', '2x Micro HDMI (4K)', '40-pin header'], 3.3, '1.5GHz', 'linux', 142),
  board('RASPBERRY_PI_5', 'Raspberry Pi 5', 'Raspberry Pi SBC', 'pi40', ['Linux SBC', 'PCIe 2.0', 'Gigabit Ethernet', '2x USB 3.0', '2x USB 2.0', '2x Micro HDMI (4K@60)', '40-pin header'], 3.3, '2.4GHz', 'linux', 143),
  board('RASPBERRY_PI_COMPUTE_MODULE', 'Raspberry Pi Compute Module', 'Raspberry Pi SBC', 'pi40', ['Linux module', 'carrier board I/O', 'PCIe', 'HDMI', 'Gigabit Ethernet', 'industrial'], 3.3, 'varies', 'linux', 144),

  board('STM32_BLUE_PILL', 'STM32 Blue Pill', 'STM32', 'stm32', ['STM32F103C8', 'ARM Cortex-M3', 'low-cost'], 3.3, '72MHz', 'arduino-core', 170),
  board('STM32_BLACK_PILL', 'STM32 Black Pill', 'STM32', 'stm32', ['STM32F401/F411', 'USB-C variants', 'ARM Cortex-M4'], 3.3, '84MHz', 'arduino-core', 171),
  board('STM32_NUCLEO', 'STM32 Nucleo', 'STM32', 'eval', ['ARM Cortex-M', 'Arduino headers', 'ST-LINK'], 3.3, 'varies', 'external', 172),
  board('STM32_DISCOVERY', 'STM32 Discovery', 'STM32', 'eval', ['ARM Cortex-M', 'sensors/display variants', 'ST-LINK'], 3.3, 'varies', 'external', 173),

  board('TEENSY_4_0', 'Teensy 4.0', 'Teensy', 'teensy', ['i.MX RT1062', 'high performance', 'USB'], 3.3, '600MHz', 'arduino-core', 200),
  board('TEENSY_4_1', 'Teensy 4.1', 'Teensy', 'teensy', ['i.MX RT1062', 'Ethernet pins', 'expanded I/O'], 3.3, '600MHz', 'arduino-core', 201),
  board('TEENSY_LC', 'Teensy LC', 'Teensy', 'teensy', ['ARM Cortex-M0+', 'low cost', 'USB'], 3.3, '48MHz', 'arduino-core', 202),

  board('BBC_MICROBIT_V1', 'BBC micro:bit V1', 'BBC micro:bit', 'microbit', ['education', 'LED matrix', 'Bluetooth LE'], 3.3, '16MHz', 'external', 230),
  board('BBC_MICROBIT_V2', 'BBC micro:bit V2', 'BBC micro:bit', 'microbit', ['education', 'speaker/mic', 'Bluetooth LE'], 3.3, '64MHz', 'external', 231),

  board('SEEED_XIAO_SAMD21', 'Seeed XIAO SAMD21', 'Seeed XIAO', 'xiao', ['ultra compact', 'SAMD21', 'USB-C'], 3.3, '48MHz', 'arduino-core', 260),
  board('SEEED_XIAO_RP2040', 'Seeed XIAO RP2040', 'Seeed XIAO', 'xiao', ['ultra compact', 'RP2040', 'USB-C'], 3.3, '133MHz', 'arduino-core', 261),
  board('SEEED_XIAO_ESP32C3', 'Seeed XIAO ESP32C3', 'Seeed XIAO', 'xiao', ['ultra compact', 'Wi-Fi', 'Bluetooth LE'], 3.3, '160MHz', 'arduino-core', 262),
  board('SEEED_XIAO_ESP32S3', 'Seeed XIAO ESP32S3', 'Seeed XIAO', 'xiao', ['ultra compact', 'Wi-Fi', 'Bluetooth LE'], 3.3, '240MHz', 'arduino-core', 263),
  board('SEEED_XIAO_NRF52840', 'Seeed XIAO nRF52840', 'Seeed XIAO', 'xiao', ['ultra compact', 'Bluetooth LE', 'Matter-ready MCU'], 3.3, '64MHz', 'arduino-core', 264),

  board('ADAFRUIT_FEATHER_M0', 'Adafruit Feather M0', 'Adafruit Feather', 'feather', ['Feather ecosystem', 'SAMD21', 'LiPo charger'], 3.3, '48MHz', 'arduino-core', 290),
  board('ADAFRUIT_FEATHER_M4', 'Adafruit Feather M4', 'Adafruit Feather', 'feather', ['Feather ecosystem', 'SAMD51', 'high speed'], 3.3, '120MHz', 'arduino-core', 291),
  board('ADAFRUIT_FEATHER_ESP32', 'Adafruit Feather ESP32', 'Adafruit Feather', 'feather', ['Feather ecosystem', 'Wi-Fi', 'Bluetooth'], 3.3, '240MHz', 'arduino-core', 292),
  board('ADAFRUIT_FEATHER_RP2040', 'Adafruit Feather RP2040', 'Adafruit Feather', 'feather', ['Feather ecosystem', 'RP2040', 'STEMMA QT'], 3.3, '133MHz', 'arduino-core', 293),
  board('ADAFRUIT_FEATHER_NRF52840', 'Adafruit Feather nRF52840', 'Adafruit Feather', 'feather', ['Feather ecosystem', 'Bluetooth LE', 'nRF52840'], 3.3, '64MHz', 'arduino-core', 294),

  board('SPARKFUN_THING_PLUS_ESP32', 'SparkFun Thing Plus ESP32', 'SparkFun Thing Plus', 'feather', ['Thing Plus', 'Wi-Fi', 'Bluetooth'], 3.3, '240MHz', 'arduino-core', 320),
  board('SPARKFUN_THING_PLUS_RP2040', 'SparkFun Thing Plus RP2040', 'SparkFun Thing Plus', 'feather', ['Thing Plus', 'RP2040', 'Qwiic'], 3.3, '133MHz', 'arduino-core', 321),
  board('SPARKFUN_THING_PLUS_ARTEMIS', 'SparkFun Thing Plus Artemis', 'SparkFun Thing Plus', 'feather', ['Thing Plus', 'Apollo3', 'BLE'], 3.3, '48MHz', 'arduino-core', 322),

  board('BEAGLEBONE_BLACK', 'BeagleBone Black', 'BeagleBone', 'beaglebone', ['Linux SBC', 'PRU real-time units', 'industrial I/O', 'HDMI', '10/100 Ethernet', 'USB Host', 'eMMC'], 3.3, '1GHz', 'linux', 380),
  board('BEAGLEBONE_AI64', 'BeagleBone AI-64', 'BeagleBone', 'beaglebone', ['Linux SBC', 'AI acceleration', 'industrial I/O', 'Mini DisplayPort', 'Gigabit Ethernet', 'USB 3.0'], 3.3, '2GHz', 'linux', 381),

  board('ODROID_C4', 'ODROID-C4', 'ODROID', 'pi40', ['Linux SBC', 'Amlogic S905X3', '40-pin header', 'HDMI 2.0', 'Gigabit Ethernet', '4x USB 3.0'], 3.3, '2GHz', 'linux', 410),
  board('ODROID_M1', 'ODROID-M1', 'ODROID', 'pi40', ['Linux SBC', 'RK3568B2', 'SATA/NVMe', 'HDMI 2.0', 'Gigabit Ethernet', 'USB 3.0'], 3.3, '2GHz', 'linux', 411),

  board('ORANGE_PI_ZERO', 'Orange Pi Zero', 'Orange Pi', 'pi40', ['Linux SBC', 'compact', 'networking', '100M Ethernet', 'WiFi', 'USB 2.0'], 3.3, '1.2GHz', 'linux', 440),
  board('ORANGE_PI_3B', 'Orange Pi 3B', 'Orange Pi', 'pi40', ['Linux SBC', 'RK3566', '40-pin header', 'HDMI 2.0', 'Gigabit Ethernet', 'USB 3.0'], 3.3, '1.8GHz', 'linux', 441),

  board('JETSON_NANO', 'NVIDIA Jetson Nano', 'Jetson', 'pi40', ['edge AI', 'CUDA', '40-pin header', 'HDMI/DisplayPort', 'Gigabit Ethernet', '4x USB 3.0'], 3.3, '1.43GHz', 'linux', 530),
  board('JETSON_ORIN_NANO', 'NVIDIA Jetson Orin Nano', 'Jetson', 'pi40', ['edge AI', 'Ampere GPU', '40-pin header', 'DisplayPort', 'Gigabit Ethernet', 'USB 3.2'], 3.3, '1.5GHz', 'linux', 532),

  board('CORAL_DEV_BOARD', 'Google Coral Dev Board', 'Coral', 'pi40', ['Edge TPU', 'Linux SBC', 'machine learning', 'HDMI', 'Gigabit Ethernet', 'USB-C'], 3.3, '1.5GHz', 'linux', 560),

  board('TI_LAUNCHPAD_MSP430', 'TI LaunchPad MSP430', 'Texas Instruments', 'eval', ['low power', 'MSP430', 'industrial learning'], 3.3, '16MHz', 'external', 620),
  board('TI_LAUNCHPAD_TIVA_C', 'TI Tiva C LaunchPad', 'Texas Instruments', 'eval', ['ARM Cortex-M4F', 'industrial', 'BoosterPack headers'], 3.3, '80MHz', 'external', 621),
  board('TI_SIMPLELINK_CC32XX', 'TI SimpleLink CC32xx', 'Texas Instruments', 'eval', ['Wi-Fi MCU', 'low power', 'industrial IoT'], 3.3, '80MHz', 'external', 622),

  board('NXP_FRDM', 'NXP FRDM Board', 'NXP', 'eval', ['ARM Cortex-M', 'automotive/industrial', 'Arduino headers'], 3.3, 'varies', 'external', 650),
  board('NXP_LPCXPRESSO', 'NXP LPCXpresso', 'NXP', 'eval', ['LPC MCU', 'debug probe', 'embedded control'], 3.3, 'varies', 'external', 651),
  board('NXP_IMX_RT_EVK', 'NXP i.MX RT EVK', 'NXP', 'eval', ['crossover MCU', 'high performance', 'industrial'], 3.3, '600MHz', 'external', 652),

  board('MICROCHIP_CURIOSITY_NANO', 'Microchip Curiosity Nano', 'Microchip', 'eval', ['PIC/AVR dev board', 'debugger', 'tiny footprint'], 3.3, 'varies', 'external', 680),
  board('MICROCHIP_PICKIT', 'Microchip PICkit Ecosystem', 'Microchip', 'eval', ['PIC programming', 'debugging', 'prototype headers'], 5, 'varies', 'external', 681),

  board('ATMEL_AVR_ATMEGA328P', 'ATmega328P DIP', 'Atmel AVR', 'avr28', ['classic AVR MCU', 'Arduino Uno core', '28-pin DIP'], 5, '16MHz', 'avr', 710),
  board('ATMEL_AVR_ATTINY', 'ATtiny Series DIP', 'Atmel AVR', 'attiny8', ['classic AVR MCU', 'tiny package', 'low power'], 5, '1-20MHz', 'arduino-core', 711),

  board('NORDIC_NRF52840_DK', 'Nordic nRF52840 DK', 'Nordic', 'eval', ['Bluetooth LE', 'Thread', 'Matter capable'], 3.3, '64MHz', 'external', 740),
  board('NORDIC_NRF5340_DK', 'Nordic nRF5340 DK', 'Nordic', 'eval', ['dual-core Bluetooth LE', 'Thread', 'Matter capable'], 3.3, '128MHz', 'external', 741),

  board('SILICON_LABS_EFR32_DEV_KIT', 'Silicon Labs EFR32 Dev Kit', 'Silicon Labs', 'eval', ['Zigbee', 'Thread', 'Matter capable'], 3.3, 'varies', 'external', 770),

  board('INFINEON_XMC', 'Infineon XMC Board', 'Infineon', 'eval', ['industrial MCU', 'motor control', 'automation'], 3.3, 'varies', 'external', 800),
  board('INFINEON_PSOC4', 'Infineon PSoC 4', 'Infineon', 'eval', ['configurable analog', 'low power', 'Cortex-M0'], 3.3, '48MHz', 'external', 801),
  board('INFINEON_PSOC5', 'Infineon PSoC 5', 'Infineon', 'eval', ['configurable analog', 'Cortex-M3', 'mixed-signal'], 5, '80MHz', 'external', 802),
  board('INFINEON_PSOC6', 'Infineon PSoC 6', 'Infineon', 'eval', ['dual-core', 'Bluetooth LE', 'low power'], 3.3, '150MHz', 'external', 803),

  board('RENESAS_RA', 'Renesas RA Board', 'Renesas', 'eval', ['ARM Cortex-M', 'industrial', 'security features'], 3.3, 'varies', 'external', 830),
  board('RENESAS_RX', 'Renesas RX Board', 'Renesas', 'eval', ['RX MCU', 'industrial controllers', 'motor control'], 3.3, 'varies', 'external', 831),
  board('RENESAS_RZ', 'Renesas RZ Board', 'Renesas', 'eval', ['MPU/industrial Linux', 'control applications', 'HMI'], 3.3, 'varies', 'external', 832),

  board('CH32V003', 'WCH CH32V003', 'CH32', 'eval', ['low-cost RISC-V', 'tiny MCU', '3.3V logic'], 3.3, '48MHz', 'external', 860),
  board('CH32V203', 'WCH CH32V203', 'CH32', 'eval', ['RISC-V MCU', 'USB/CAN variants', 'low cost'], 3.3, '144MHz', 'external', 861),

  board('RISC_V_SIPEED_LONGAN_NANO', 'Sipeed Longan Nano', 'RISC-V', 'eval', ['GD32VF103', 'RISC-V MCU', 'LCD module'], 3.3, '108MHz', 'external', 890),
  board('RISC_V_VISIONFIVE', 'StarFive VisionFive', 'RISC-V', 'pi40', ['RISC-V Linux SBC', 'open ISA', '40-pin header'], 3.3, '1.5GHz', 'linux', 891),
];

export const BOARD_TYPE_SET = new Set<string>(BOARD_CATALOG.map((boardItem) => boardItem.type));

export const BOARD_FAMILY_PREFIXES = [
  'ARDUINO',
  'ESP8266',
  'ESP32',
  'RASPBERRY_PI',
  'STM32',
  'TEENSY',
  'BBC_MICROBIT',
  'SEEED_XIAO',
  'ADAFRUIT_FEATHER',
  'SPARKFUN_THING_PLUS',
  'PARTICLE',
  'BEAGLEBONE',
  'ODROID',
  'ORANGE_PI',
  'JETSON',
  'CORAL',
  'TI_',
  'NXP',
  'MICROCHIP',
  'ATMEL_AVR',
  'NORDIC',
  'SILICON_LABS',
  'INFINEON',
  'RENESAS',
  'CH32',
  'RISC_V',
];

export const BOARD_OPTIONS: BoardType[] = BOARD_CATALOG.map((boardItem) => boardItem.type);

export function getBoardProfile(type: string): BoardCatalogEntry | undefined {
  return BOARD_CATALOG.find((boardItem) => boardItem.type === type);
}

export function isBoardComponentType(type: string): boolean {
  return BOARD_TYPE_SET.has(type) || BOARD_FAMILY_PREFIXES.some((prefix) => type.startsWith(prefix));
}

export function getBoardLogicVoltage(type: string): 3.3 | 5 {
  const profile = getBoardProfile(type);
  if (profile) return profile.logicVoltage;
  return type.startsWith('ARDUINO') || type.startsWith('ATMEL_AVR') || type === 'MICROCHIP_PICKIT' ? 5 : 3.3;
}

export function isLinuxBoardType(type: string): boolean {
  return getBoardProfile(type)?.compiler === 'linux';
}

function pin(id: string, name: string, x: number, y: number, type: PinType = 'bidirectional'): PinPosition {
  return { id, name, x, y, type };
}

function typeFromLabel(id: string, name: string): PinType {
  const label = `${id} ${name}`.toUpperCase();
  if (/(^|\W)(GND|GROUND|VSS)(\W|$)/.test(label)) return 'ground';
  if (/(^|\W)(5V|3V3|3\.3V|VIN|VBUS|VSYS|VCC|VDD|BAT|USB)(\W|$)/.test(label)) return 'power';
  if (/(^|\W)(RESET|RST|RUN|EN|BOOT|ADC|AREF)(\W|$)/.test(label)) return 'input';
  if (/(^|\W)(TX|MISO|DOUT)(\W|$)/.test(label)) return 'output';
  return 'bidirectional';
}

function sideHeaderPins(
  left: Array<[string, string]>,
  right: Array<[string, string]>,
  width: number,
  startY = 12,
  step = 9,
): PinPosition[] {
  return [
    ...left.map(([id, name], index) => pin(id, name, 0, startY + index * step, typeFromLabel(id, name))),
    ...right.map(([id, name], index) => pin(id, name, width, startY + index * step, typeFromLabel(id, name))),
  ];
}

function unoPins(): PinPosition[] {
  return [
    ...Array.from({ length: 14 }, (_, index) => pin(`d${index}`, index === 0 ? 'D0/RX' : index === 1 ? 'D1/TX' : `D${index}`, 168 - index * 12, 0)),
    pin('rst', 'RESET', 12, 150, 'input'),
    pin('5v', '5V', 24, 150, 'power'),
    pin('3v3', '3.3V', 36, 150, 'power'),
    pin('gnd1', 'GND', 48, 150, 'ground'),
    pin('gnd2', 'GND', 60, 150, 'ground'),
    pin('vin', 'VIN', 72, 150, 'power'),
    ...Array.from({ length: 6 }, (_, index) => pin(`a${index}`, index === 4 ? 'A4/SDA' : index === 5 ? 'A5/SCL' : `A${index}`, 108 + index * 12, 150)),
    pin('aref', 'AREF', 180, 150, 'input'),
  ];
}

function megaPins(): PinPosition[] {
  const pins: PinPosition[] = [];
  for (let index = 0; index <= 21; index++) {
    pins.push(pin(`d${index}`, `D${index}`, 8 + index * 12.5, 0));
  }
  for (let index = 22; index <= 53; index++) {
    pins.push(pin(`d${index}`, `D${index}`, 8 + (index - 22) * 8, 120));
  }
  for (let index = 0; index <= 15; index++) {
    pins.push(pin(`a${index}`, `A${index}`, 280, 6 + index * 7));
  }
  [
    ['5v', '5V'],
    ['3v3', '3.3V'],
    ['gnd1', 'GND'],
    ['gnd2', 'GND'],
    ['vin', 'VIN'],
    ['rst', 'RESET'],
    ['sda', 'SDA'],
    ['scl', 'SCL'],
  ].forEach(([id, name], index) => pins.push(pin(id, name, 0, 10 + index * 13, typeFromLabel(id, name))));
  return pins;
}

function nanoPins(): PinPosition[] {
  const left = Array.from({ length: 14 }, (_, index): [string, string] => [`d${index}`, index === 0 ? 'D0/RX' : index === 1 ? 'D1/TX' : `D${index}`]);
  const right: Array<[string, string]> = [
    ['vin', 'VIN'],
    ['5v', '5V'],
    ['3v3', '3.3V'],
    ['rst', 'RESET'],
    ['gnd1', 'GND'],
    ['aref', 'AREF'],
    ['a0', 'A0'],
    ['a1', 'A1'],
    ['a2', 'A2'],
    ['a3', 'A3'],
    ['a4', 'A4/SDA'],
    ['a5', 'A5/SCL'],
    ['a6', 'A6'],
    ['a7', 'A7'],
  ];
  return sideHeaderPins(left, right, 100, 28, 9.3);
}

function esp32Pins(): PinPosition[] {
  return sideHeaderPins(
    [
      ['3v3', '3V3'],
      ['en', 'EN'],
      ['vp', 'VP/ADC'],
      ['vn', 'VN/ADC'],
      ['d34', 'D34/GPIO34'],
      ['d35', 'D35/GPIO35'],
      ['d32', 'D32/GPIO32'],
      ['d33', 'D33/GPIO33'],
      ['d25', 'D25/GPIO25'],
      ['d26', 'D26/GPIO26'],
      ['d27', 'D27/GPIO27'],
      ['d14', 'D14/GPIO14'],
      ['d12', 'D12/GPIO12'],
      ['gnd1', 'GND'],
      ['d13', 'D13/GPIO13'],
    ],
    [
      ['vin', 'VIN/5V'],
      ['gnd2', 'GND'],
      ['d23', 'D23/GPIO23'],
      ['d22', 'D22/GPIO22/SCL'],
      ['d1', 'D1/TX0'],
      ['d3', 'D3/RX0'],
      ['d21', 'D21/GPIO21/SDA'],
      ['d19', 'D19/GPIO19'],
      ['d18', 'D18/GPIO18'],
      ['d5', 'D5/GPIO5'],
      ['d17', 'D17/GPIO17'],
      ['d16', 'D16/GPIO16'],
      ['d4', 'D4/GPIO4'],
      ['d2', 'D2/GPIO2'],
      ['d15', 'D15/GPIO15'],
    ],
    100,
    10,
    10,
  );
}

function esp8266Pins(): PinPosition[] {
  return sideHeaderPins(
    [
      ['a0', 'A0/ADC'],
      ['gnd1', 'GND'],
      ['d0', 'D0/GPIO16'],
      ['d1', 'D1/GPIO5/SCL'],
      ['d2', 'D2/GPIO4/SDA'],
      ['d3', 'D3/GPIO0'],
      ['d4', 'D4/GPIO2'],
      ['3v3', '3V3'],
    ],
    [
      ['vin', 'VIN/5V'],
      ['gnd2', 'GND'],
      ['d5', 'D5/GPIO14/SCLK'],
      ['d6', 'D6/GPIO12/MISO'],
      ['d7', 'D7/GPIO13/MOSI'],
      ['d8', 'D8/GPIO15'],
      ['rx', 'RX/GPIO3'],
      ['tx', 'TX/GPIO1'],
    ],
    95,
    15,
    15,
  );
}

function picoPins(): PinPosition[] {
  return sideHeaderPins(
    [
      ['d0', 'D0/GP0'],
      ['d1', 'D1/GP1'],
      ['gnd1', 'GND'],
      ['d2', 'D2/GP2'],
      ['d3', 'D3/GP3'],
      ['d4', 'D4/GP4'],
      ['d5', 'D5/GP5'],
      ['gnd2', 'GND'],
      ['d6', 'D6/GP6'],
      ['d7', 'D7/GP7'],
      ['d8', 'D8/GP8'],
      ['d9', 'D9/GP9'],
      ['gnd3', 'GND'],
      ['d10', 'D10/GP10'],
      ['d11', 'D11/GP11'],
      ['d12', 'D12/GP12'],
      ['d13', 'D13/GP13'],
      ['gnd4', 'GND'],
      ['d14', 'D14/GP14'],
      ['d15', 'D15/GP15'],
    ],
    [
      ['vbus', 'VBUS'],
      ['vsys', 'VSYS'],
      ['gnd5', 'GND'],
      ['en', '3V3_EN'],
      ['3v3', '3V3'],
      ['aref', 'ADC_VREF'],
      ['a2', 'A2/GP28'],
      ['gnd6', 'GND'],
      ['a1', 'A1/GP27'],
      ['a0', 'A0/GP26'],
      ['run', 'RUN'],
      ['d22', 'D22/GP22'],
      ['gnd7', 'GND'],
      ['d21', 'D21/GP21'],
      ['d20', 'D20/GP20'],
      ['d19', 'D19/GP19'],
      ['d18', 'D18/GP18'],
      ['gnd8', 'GND'],
      ['d17', 'D17/GP17'],
      ['d16', 'D16/GP16'],
    ],
    100,
    10,
    8.4,
  );
}

function pi40Pins(): PinPosition[] {
  const physical: Array<[string, string]> = [
    ['3v3_1', '3.3V'], ['5v_2', '5V'], ['d2', 'D2/GPIO2/SDA1'], ['5v_4', '5V'],
    ['d3', 'D3/GPIO3/SCL1'], ['gnd6', 'GND'], ['d4', 'D4/GPIO4'], ['d14', 'D14/GPIO14/TX'],
    ['gnd9', 'GND'], ['d15', 'D15/GPIO15/RX'], ['d17', 'D17/GPIO17'], ['d18', 'D18/GPIO18/PWM'],
    ['d27', 'D27/GPIO27'], ['gnd14', 'GND'], ['d22', 'D22/GPIO22'], ['d23', 'D23/GPIO23'],
    ['3v3_17', '3.3V'], ['d24', 'D24/GPIO24'], ['d10', 'D10/GPIO10/MOSI'], ['gnd20', 'GND'],
    ['d9', 'D9/GPIO9/MISO'], ['d25', 'D25/GPIO25'], ['d11', 'D11/GPIO11/SCLK'], ['d8', 'D8/GPIO8/CE0'],
    ['gnd25', 'GND'], ['d7', 'D7/GPIO7/CE1'], ['d0', 'D0/GPIO0/ID_SD'], ['d1', 'D1/GPIO1/ID_SC'],
    ['d5', 'D5/GPIO5'], ['gnd30', 'GND'], ['d6', 'D6/GPIO6'], ['d12', 'D12/GPIO12/PWM'],
    ['d13', 'D13/GPIO13/PWM'], ['gnd34', 'GND'], ['d19', 'D19/GPIO19'], ['d16', 'D16/GPIO16'],
    ['d26', 'D26/GPIO26'], ['d20', 'D20/GPIO20'], ['gnd39', 'GND'], ['d21', 'D21/GPIO21'],
  ];
  const pins: PinPosition[] = [];
  physical.forEach(([id, name], index) => {
    const row = Math.floor(index / 2);
    const x = index % 2 === 0 ? 0 : 120;
    pins.push(pin(id, name, x, 10 + row * 7.7, typeFromLabel(id, name)));
  });
  return pins;
}

function stm32Pins(): PinPosition[] {
  const left: Array<[string, string]> = [
    ['3v3', '3V3'],
    ['gnd1', 'GND'],
    ['a0', 'A0/PA0'],
    ['a1', 'A1/PA1'],
    ['a2', 'A2/PA2'],
    ['a3', 'A3/PA3'],
    ['a4', 'A4/PA4'],
    ['a5', 'A5/PA5/SCK'],
    ['a6', 'A6/PA6/MISO'],
    ['a7', 'A7/PA7/MOSI'],
    ['d8', 'D8/PB0'],
    ['d9', 'D9/PB1'],
    ['d10', 'D10/PB10/SCL'],
    ['d11', 'D11/PB11/SDA'],
    ['rst', 'RESET'],
  ];
  const right: Array<[string, string]> = [
    ['5v', '5V'],
    ['gnd2', 'GND'],
    ['d13', 'D13/PC13'],
    ['d14', 'D14/PC14'],
    ['d15', 'D15/PC15'],
    ['d0', 'D0/PA9/TX'],
    ['d1', 'D1/PA10/RX'],
    ['d2', 'D2/PA11'],
    ['d3', 'D3/PA12'],
    ['d4', 'D4/PB3'],
    ['d5', 'D5/PB4'],
    ['d6', 'D6/PB5'],
    ['d7', 'D7/PB6/SCL'],
    ['d12', 'D12/PB7/SDA'],
    ['boot0', 'BOOT0'],
  ];
  return sideHeaderPins(left, right, 110, 12, 10);
}

function teensyPins(): PinPosition[] {
  const left = Array.from({ length: 12 }, (_, index): [string, string] => [`d${index}`, index === 0 ? 'D0/RX' : index === 1 ? 'D1/TX' : `D${index}`]);
  left.unshift(['3v3', '3V3'], ['gnd1', 'GND']);
  const right: Array<[string, string]> = [
    ['vin', 'VIN'],
    ['gnd2', 'GND'],
    ['d12', 'D12/MISO'],
    ['d13', 'D13/SCK/LED'],
    ['d14', 'D14/A0'],
    ['d15', 'D15/A1'],
    ['d16', 'D16/A2'],
    ['d17', 'D17/A3'],
    ['d18', 'D18/SDA'],
    ['d19', 'D19/SCL'],
    ['d20', 'D20/A6'],
    ['d21', 'D21/A7'],
    ['d22', 'D22/A8'],
    ['d23', 'D23/A9'],
  ];
  return sideHeaderPins(left, right, 95, 12, 10);
}

function microbitPins(): PinPosition[] {
  const edge: Array<[string, string, number]> = [
    ['d0', 'D0/P0/A0', 8],
    ['d1', 'D1/P1/A1', 28],
    ['d2', 'D2/P2/A2', 48],
    ['3v3', '3V', 70],
    ['gnd', 'GND', 92],
    ['d8', 'D8/P8', 114],
    ['d12', 'D12/P12', 132],
    ['d16', 'D16/P16', 148],
  ];
  return edge.map(([id, name, x]) => pin(id, name, x, 90, typeFromLabel(id, name)));
}

function xiaoPins(): PinPosition[] {
  return sideHeaderPins(
    [
      ['d0', 'D0/A0'],
      ['d1', 'D1/A1'],
      ['d2', 'D2/A2'],
      ['d3', 'D3/A3'],
      ['d4', 'D4/A4/SDA'],
      ['d5', 'D5/A5/SCL'],
      ['gnd1', 'GND'],
    ],
    [
      ['5v', '5V/VBUS'],
      ['3v3', '3V3'],
      ['d10', 'D10/MOSI'],
      ['d9', 'D9/MISO'],
      ['d8', 'D8/SCK'],
      ['d7', 'D7/RX'],
      ['d6', 'D6/TX'],
    ],
    76,
    10,
    13,
  );
}

function featherPins(): PinPosition[] {
  return sideHeaderPins(
    [
      ['rst', 'RESET'],
      ['3v3', '3V3'],
      ['aref', 'AREF'],
      ['gnd1', 'GND'],
      ['a0', 'A0'],
      ['a1', 'A1'],
      ['a2', 'A2'],
      ['a3', 'A3'],
      ['a4', 'A4'],
      ['a5', 'A5'],
      ['sck', 'SCK'],
      ['mosi', 'MOSI'],
      ['miso', 'MISO'],
    ],
    [
      ['bat', 'BAT'],
      ['usb', 'USB/5V'],
      ['en', 'EN'],
      ['d13', 'D13'],
      ['d12', 'D12'],
      ['d11', 'D11'],
      ['d10', 'D10'],
      ['d9', 'D9'],
      ['d6', 'D6'],
      ['d5', 'D5'],
      ['scl', 'SCL'],
      ['sda', 'SDA'],
      ['rx', 'RX'],
      ['tx', 'TX'],
    ],
    110,
    12,
    11,
  );
}

function evalPins(): PinPosition[] {
  const left: Array<[string, string]> = [
    ['3v3', '3V3'],
    ['5v', '5V'],
    ['gnd1', 'GND'],
    ['rst', 'RESET'],
    ['d0', 'D0/RX'],
    ['d1', 'D1/TX'],
    ['d2', 'D2'],
    ['d3', 'D3/PWM'],
    ['d4', 'D4'],
    ['d5', 'D5/PWM'],
  ];
  const right: Array<[string, string]> = [
    ['vin', 'VIN'],
    ['gnd2', 'GND'],
    ['sda', 'SDA'],
    ['scl', 'SCL'],
    ['sck', 'SCK'],
    ['mosi', 'MOSI'],
    ['miso', 'MISO'],
    ['a0', 'A0/ADC'],
    ['a1', 'A1/ADC'],
    ['a2', 'A2/ADC'],
  ];
  return sideHeaderPins(left, right, 150, 10, 10);
}

function beaglebonePins(): PinPosition[] {
  const pins: PinPosition[] = [];
  for (let index = 0; index < 23; index++) {
    const num = index + 3;
    pins.push(pin(`p8_${num}`, `P8_${num}/GPIO`, 0, 10 + index * 7.5));
    pins.push(pin(`p9_${num}`, `P9_${num}/GPIO`, 165, 10 + index * 7.5));
  }
  [
    pin('p9_1', 'P9_1/GND', 60, 190, 'ground'),
    pin('p9_3', 'P9_3/3V3', 75, 190, 'power'),
    pin('p9_5', 'P9_5/5V', 90, 190, 'power'),
    pin('p9_19', 'P9_19/I2C2_SCL', 105, 190),
    pin('p9_20', 'P9_20/I2C2_SDA', 120, 190),
  ].forEach((item) => pins.push(item));
  return pins;
}

function avr28Pins(): PinPosition[] {
  const left = [
    ['rst', 'RESET/PC6'],
    ['d0', 'D0/RX/PD0'],
    ['d1', 'D1/TX/PD1'],
    ['d2', 'D2/PD2'],
    ['d3', 'D3/PD3'],
    ['d4', 'D4/PD4'],
    ['5v', 'VCC'],
    ['gnd1', 'GND'],
    ['xtal1', 'XTAL1'],
    ['xtal2', 'XTAL2'],
    ['d5', 'D5/PD5'],
    ['d6', 'D6/PD6'],
    ['d7', 'D7/PD7'],
    ['d8', 'D8/PB0'],
  ] as Array<[string, string]>;
  const right = [
    ['d9', 'D9/PB1'],
    ['d10', 'D10/PB2'],
    ['d11', 'D11/MOSI/PB3'],
    ['d12', 'D12/MISO/PB4'],
    ['d13', 'D13/SCK/PB5'],
    ['avcc', 'AVCC'],
    ['aref', 'AREF'],
    ['gnd2', 'GND'],
    ['a0', 'A0/PC0'],
    ['a1', 'A1/PC1'],
    ['a2', 'A2/PC2'],
    ['a3', 'A3/PC3'],
    ['a4', 'A4/SDA/PC4'],
    ['a5', 'A5/SCL/PC5'],
  ] as Array<[string, string]>;
  return sideHeaderPins(left, right, 140, 5, 4.6);
}

function attiny8Pins(): PinPosition[] {
  return sideHeaderPins(
    [
      ['rst', 'RESET/PB5'],
      ['d3', 'D3/PB3'],
      ['d4', 'D4/PB4'],
      ['gnd', 'GND'],
    ],
    [
      ['5v', 'VCC'],
      ['d2', 'D2/PB2/SCK'],
      ['d1', 'D1/PB1/MISO'],
      ['d0', 'D0/PB0/MOSI'],
    ],
    80,
    10,
    12,
  );
}

export function createBoardPins(footprint: BoardFootprint): PinPosition[] {
  switch (footprint) {
    case 'uno':
      return unoPins();
    case 'mega':
      return megaPins();
    case 'nano':
      return nanoPins();
    case 'esp32':
      return esp32Pins();
    case 'esp8266':
      return esp8266Pins();
    case 'pico':
      return picoPins();
    case 'pi40':
      return pi40Pins();
    case 'stm32':
      return stm32Pins();
    case 'teensy':
      return teensyPins();
    case 'microbit':
      return microbitPins();
    case 'xiao':
      return xiaoPins();
    case 'feather':
      return featherPins();
    case 'beaglebone':
      return beaglebonePins();
    case 'avr28':
      return avr28Pins();
    case 'attiny8':
      return attiny8Pins();
    case 'eval':
    default:
      return evalPins();
  }
}
