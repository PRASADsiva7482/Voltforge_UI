import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LiveChatBlocked, requiredLiveChecks, requiredOutageChecks, requiredProjectChecks, requiredCrossUserChecks, requiredMidstreamChecks, runLiveReport, serviceUrl, acceptanceRequest } from './live-chat-report.mjs'

const dir = await mkdtemp(join(tmpdir(),'voltforge-live-report-'))
try {
  const path = join(dir,'report.json')
  const success = await runLiveReport(path, async r => requiredLiveChecks.forEach(k=>{r.checks[k]=true}))
  assert.equal(success.status,'passed')
  assert.equal(success.releaseAccepted,false)
  const missingOutage = await runLiveReport(path, async r => requiredLiveChecks.forEach(k=>{r.checks[k]=true}), {aiOutage:true})
  assert.equal(missingOutage.status,'failed','base checks cannot certify process outage recovery')
  const outage = await runLiveReport(path, async r => [...requiredLiveChecks,...requiredOutageChecks].forEach(k=>{r.checks[k]=true}), {aiOutage:true})
  assert.equal(outage.status,'passed')
  assert.equal(outage.aiProcessOutageRequested,true)
  for(const missing of requiredMidstreamChecks) {
    const partial=await runLiveReport(path,async r=>[...requiredLiveChecks,...requiredOutageChecks,...requiredMidstreamChecks]
      .filter(k=>k!==missing).forEach(k=>{r.checks[k]=true}),{midstreamCrash:true})
    assert.equal(partial.status,'failed',`pre-generation outage cannot substitute for ${missing}`)
  }
  const crash=await runLiveReport(path,async r=>[...requiredLiveChecks,...requiredMidstreamChecks]
    .forEach(k=>{r.checks[k]=true}),{midstreamCrash:true})
  assert.equal(crash.status,'passed')
  assert.equal(crash.midstreamCrashRequested,true)
  assert.equal(crash.releaseAccepted,false)
  const incompleteProject = await runLiveReport(path, async r => requiredLiveChecks.forEach(k=>{r.checks[k]=true}), {projectDocuments:true})
  assert.equal(incompleteProject.status,'failed')
  assert.equal(incompleteProject.projectOwnerVerified,false)
  const project = await runLiveReport(path, async r => [...requiredLiveChecks,...requiredProjectChecks].forEach(k=>{r.checks[k]=true}), {projectDocuments:true})
  assert.equal(project.status,'passed')
  assert.equal(project.projectOwnerVerified,true)
  assert.equal(project.projectIsolationVerified,false,'owner checks cannot certify cross-user isolation')
  for(const missing of requiredCrossUserChecks) {
    const partial=await runLiveReport(path,async r=>[...requiredLiveChecks,...requiredProjectChecks,...requiredCrossUserChecks]
      .filter(k=>k!==missing).forEach(k=>{r.checks[k]=true}),{projectDocuments:true,crossUser:true})
    assert.equal(partial.status,'failed',`missing ${missing} must prevent acceptance`)
    assert.equal(partial.projectIsolationVerified,false)
  }
  const isolation=await runLiveReport(path,async r=>[...requiredLiveChecks,...requiredProjectChecks,...requiredCrossUserChecks]
    .forEach(k=>{r.checks[k]=true}),{projectDocuments:true,crossUser:true})
  assert.equal(isolation.status,'passed')
  assert.equal(isolation.projectIsolationVerified,true)
  assert.equal(isolation.releaseAccepted,false)
  let calls=0,waits=0
  await acceptanceRequest(async()=>({status:()=>++calls<3?429:200}),async ms=>{assert.equal(ms,10000);waits++})
  assert.equal(calls,3);assert.equal(waits,2)
  for(const status of [403,500,503]) {
    calls=0
    await acceptanceRequest(async()=>{calls++;return {status:()=>status}},async()=>assert.fail('unexpected retry'))
    assert.equal(calls,1)
  }
  calls=0
  await acceptanceRequest(async()=>{calls++;return {status:()=>429}},async()=>{})
  assert.equal(calls,7,'rate-limit recovery is bounded')
  const blocked = await runLiveReport(path, async ()=>{throw new LiveChatBlocked('CONFIGURED_ISSUER_UNAVAILABLE')})
  assert.equal(blocked.status,'blocked')
  assert.equal(JSON.parse(await readFile(path,'utf8')).status,'blocked','replace stale PASS before retry')
  const incomplete = await runLiveReport(path, async r=>{r.checks.signedIn=true})
  assert.equal(incomplete.status,'failed','cannot pass on just login')
  const failure = await runLiveReport(path, async ()=>{throw new Error('secret token or private message')})
  assert.equal(failure.errorCode,'LIVE_CHAT_VERIFICATION_FAILED')
  assert(!JSON.stringify(failure).includes('secret'))
  for (const url of ['http://example.com','https://user:password@example.com','https://example.com/?token=secret','https://example.com/#secret'])
    assert.throws(()=>serviceUrl(url),LiveChatBlocked)
  assert.equal(serviceUrl('http://localhost:3000/'),'http://localhost:3000')
  assert.equal(serviceUrl('https://example.com/identity/'),'https://example.com/identity')
  console.log('Live acceptance report checks passed: required evidence, stale PASS replacement, safe errors and service URL boundaries.')
} finally {
  await rm(join(dir,'report.json'),{force:true})
  await rm(join(dir,'report.json.tmp'),{force:true})
  await rmdir(dir)
}
