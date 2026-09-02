import type { AiComponentSupportStatus, AiHardwareSupportStatus } from '../../types/domain'

export function aiCoverageStatusLabel(status: AiHardwareSupportStatus): string {
  if (status === 'verified') return 'AI verified'
  if (status === 'variant-required') return 'Variant required'
  return 'Not curated'
}

export function aiCoverageStatusClass(status: AiHardwareSupportStatus): string {
  return `is-${status}`
}

export function aiComponentCoverageStatusLabel(status: AiComponentSupportStatus): string {
  if (status === 'verified') return 'AI exact'
  if (status === 'variant-required') return 'Variant required'
  if (status === 'simulation-only') return 'Simulation model'
  return 'Not curated'
}

export function aiComponentCoverageStatusClass(status: AiComponentSupportStatus): string {
  return `is-${status}`
}
