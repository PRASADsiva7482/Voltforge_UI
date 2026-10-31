import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const requiredLiveChecks = [
  'uiLoaded', 'issuerDiscovery', 'signedIn', 'createdConversation',
  'incrementalVisibleAnswer', 'completedPersisted', 'reloadRestored',
  'stopPersisted', 'retrySameMessages', 'newLoginRestored',
  'offlineNoWrite', 'offlineRetryRestored', 'cleanup',
]
export const requiredOutageChecks = ['aiProcessStopped', 'outageFailedPersisted',
  'outageFailureVisible', 'aiProcessRestarted', 'outageRetrySameMessages', 'ownedAiStopped']
export const requiredMidstreamChecks = ['partialPersistedBeforeCrash', 'aiKilledDuringGeneration',
  'partialFailurePersisted', 'partialFailureVisible', 'partialReloadRestored',
  'midstreamAiRestarted', 'midstreamRetrySameMessages', 'ownedAiStopped']
export const requiredProjectChecks = ['privateProjectPersisted', 'projectConversationAssociated',
  'projectSharingOffNoPrivatePayload', 'projectDocumentUploadedUnselected',
  'projectDocumentConsentEnforced', 'projectSharingOnSavedPayload', 'projectCitationsPersisted',
  'anonymousProjectSourcesDenied', 'projectReopenConsentReset', 'ownerSourceReadable',
  'projectHistoricalVersionPreserved', 'projectSourceDeletionPreservesChat', 'projectDocumentCleanup', 'ownedAiStopped']
export const requiredCrossUserChecks = ['secondLoginDistinct', 'foreignConversationUiDenied',
  'foreignConversationOperationsDenied', 'foreignProjectOperationsDenied', 'foreignDocumentOperationsDenied',
  'foreignResourcesAbsentFromLists', 'secondOwnConversationRestored', 'secondFixtureCleanup', 'ownerIntactAfterCrossUser']

export class LiveChatBlocked extends Error {
  constructor(code) { super(code); this.code = code }
}

// Only explicit 429 responses are retried. Never replay ambiguous writes or
// provider/server failures. Leave the application's rate limit unchanged.
export async function acceptanceRequest(send, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt=0; ; attempt++) {
    const response=await send()
    if(response.status()!==429 || attempt===6) return response
    await pause(10_000)
  }
}

export function serviceUrl(value) {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new LiveChatBlocked('UNSAFE_SERVICE_URL')
  }
  return url.href.replace(/\/$/, '')
}

export async function writeLiveReport(path, report) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(`${path}.tmp`, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  await rename(`${path}.tmp`, path)
}

// Deliberately exclude exception messages, URLs, tokens, IDs and transcript content.
export async function runLiveReport(path, execute, { aiOutage = false, projectDocuments = false, crossUser = false, midstreamCrash = false } = {}) {
  const report = {
    schemaVersion: 1, date: new Date().toISOString(), status: 'running',
    scope: 'real_issuer_browser_chat', releaseAccepted: false,
    providerSearchVerified: false, projectIsolationVerified: false,
    modelQualityAccepted: false, checks: {}, measurements: {},
    aiProcessOutageRequested: aiOutage,
    midstreamCrashRequested: midstreamCrash,
    projectDocumentsRequested: projectDocuments, projectOwnerVerified: false,
    crossUserRequested: crossUser,
  }
  await writeLiveReport(path, report)
  try {
    await execute(report)
    const required = [...requiredLiveChecks, ...(aiOutage ? requiredOutageChecks : []), ...(projectDocuments || crossUser ? requiredProjectChecks : []), ...(crossUser ? requiredCrossUserChecks : []), ...(midstreamCrash ? requiredMidstreamChecks : [])]
    if (!required.every(key => report.checks[key] === true)) throw new Error('Missing acceptance checks')
    report.status = 'passed'
    report.projectOwnerVerified = projectDocuments
    report.projectIsolationVerified = crossUser
  } catch (error) {
    report.status = error instanceof LiveChatBlocked ? 'blocked' : 'failed'
    report.errorCode = error instanceof LiveChatBlocked && /^[A-Z_]{1,80}$/.test(error.code)
      ? error.code : 'LIVE_CHAT_VERIFICATION_FAILED'
  }
  await writeLiveReport(path, report)
  return report
}
