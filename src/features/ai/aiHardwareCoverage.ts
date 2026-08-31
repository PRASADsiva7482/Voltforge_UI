import type { AiHardwareSupportStatus } from '../../types/domain'

export function aiCoverageStatusLabel(status: AiHardwareSupportStatus): string {
  if (status === 'verified') return 'AI verified'
  if (status === 'variant-required') return 'Variant required'
  return 'Not curated'
}

export function aiCoverageStatusClass(status: AiHardwareSupportStatus): string {
  return `is-${status}`
}
