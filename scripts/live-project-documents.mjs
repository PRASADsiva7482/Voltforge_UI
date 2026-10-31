import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { request as http } from '@playwright/test'

// Actual owner session and application controls; only synthetic records created
// in this invocation may be mutated or cleaned up.
export async function verifyProjectDocuments({ page, api, call, waitFor, login, report, verifyOtherUser }) {
  const marker = randomUUID()
  const title = `AIR07 reference ${marker.slice(0,8)}`
  const firmware = `// Synthetic acceptance ${marker}\nvoid setup() {}\nvoid loop() {}`
  const text = `Synthetic reference, not a real component specification. ZX123 test supply rating: 3.3 V. Fixture marker: ${marker}.`
  let projectId, conversationId, documentId, deletedDocument = false
  const rows = async () => {
    assert(conversationId)
    const response = await call(`/ai/conversations/${conversationId}/messages`)
    assert.equal(response.status(),200)
    return (await response.json()).data.content
  }
  const snapshot = messages => messages.map(m=>[m.id,m.status,m.content,m.metadata?.citations])
  const composer = () => page.getByLabel('Ask VoltForge AI',{exact:true})
  const library = () => page.getByRole('dialog',{name:'Reference documents',exact:true})
  const openLibrary = async () => {
    await page.getByLabel('Chat options',{exact:true}).click()
    await page.getByRole('button',{name:/^Reference documents/}).click()
    await library().waitFor()
  }
  const send = async message => {
    await composer().fill(message)
    const [request,response] = await Promise.all([
      page.waitForRequest(r=>r.url()===`${api}/ai/conversations/${conversationId}/messages/stream` && r.method()==='POST'),
      page.waitForResponse(r=>r.url()===`${api}/ai/conversations/${conversationId}/messages/stream` && r.request().method()==='POST', {timeout:150_000}),
      page.getByRole('button',{name:'Send message',exact:true}).click(),
    ])
    report.measurements.projectSendStatus=response.status()
    if(!response.ok()) {
      const failure=await response.json().catch(()=>null)
      if(/^[A-Z_]{1,80}$/.test(failure?.errorCode || '')) report.projectSendFailure=failure.errorCode
    }
    assert.equal(response.status(),200,'do not poll indefinitely after a rejected send')
    return request.postDataJSON()
  }
  const complete = count => waitFor(async () => {
    const messages = await rows()
    if(messages[0]?.status==='failed') throw new Error('Project response failed')
    return messages.length===count && messages[0].status==='completed' && messages[0].content.trim() ? messages : false
  })
  try {
    report.stage='project-create'
    const projectResponse=await call('/projects',{method:'POST',data:{name:`AIR07 private ${marker.slice(0,8)}`,
      description:'Synthetic acceptance; remove only this run-owned project.',boardType:'ARDUINO_UNO',isPublic:false,
      canvasLayout:{nodes:[],wires:[]},codeFiles:[{filename:'main.ino',language:'cpp',content:firmware,sortOrder:0}]}})
    assert.equal(projectResponse.status(),201)
    const project=(await projectResponse.json()).data
    assert.equal(typeof project.id,'string'); projectId=project.id
    assert.equal(project.isPublic,false)
    assert.equal(project.boardType,'ARDUINO_UNO')
    assert.equal(project.codeFiles[0].content,firmware)
    report.checks.privateProjectPersisted=true
    await page.getByRole('button',{name:'New chat',exact:true}).click()
    const selector=page.getByLabel('Associated project',{exact:true})
    await selector.locator(`option[value="${projectId}"]`).waitFor({state:'attached'})
    await selector.selectOption(projectId)
    const [created]=await Promise.all([
      page.waitForResponse(r=>r.url()===`${api}/ai/conversations` && r.request().method()==='POST'),
      page.getByRole('button',{name:'Create conversation',exact:true}).click(),
    ])
    assert.equal(created.status(),201)
    const conversation=(await created.json()).data
    assert.equal(typeof conversation.id,'string'); conversationId=conversation.id
    assert.equal(conversation.projectId,projectId)
    await page.locator(`a[href="/editor/${projectId}?conversation=${conversationId}"]`).waitFor()
    assert.equal(await page.getByLabel('Share this project context',{exact:true}).isChecked(),false)
    report.checks.projectConversationAssociated=true

    report.stage='project-sharing-off'
    const off=await send('What is a resistor? Answer in one short sentence. Synthetic sharing-off acceptance.')
    assert.equal(off.includeProjectContext,false)
    for(const field of ['code','context','canvasContext','components','wires','files','simulationState','boardType']) assert.equal(off[field],undefined)
    assert(!JSON.stringify(off).includes(marker),'private fixture must not be sent with sharing off')
    assert(!(off.research?.documentIds?.length))
    await complete(2)
    report.checks.projectSharingOffNoPrivatePayload=true

    report.stage='project-document-upload'
    await openLibrary()
    await library().getByLabel('Document title',{exact:true}).fill(title)
    await library().getByLabel('Document file',{exact:true}).setInputFiles({name:'synthetic-reference.txt',mimeType:'text/plain',buffer:Buffer.from(text)})
    const [uploaded]=await Promise.all([
      page.waitForResponse(r=>r.url()===`${api}/ai/documents` && r.request().method()==='POST'),
      library().getByRole('button',{name:'Upload document',exact:true}).click(),
    ])
    assert.equal(uploaded.status(),201)
    const doc=(await uploaded.json()).data
    assert.equal(typeof doc.id,'string'); documentId=doc.id
    assert.equal(doc.projectId,projectId)
    assert.equal(doc.currentVersion,1)
    const selection=library().getByRole('checkbox',{name:`Use ${title}`,exact:true})
    await selection.waitFor()
    assert.equal(await selection.isChecked(),false)
    report.checks.projectDocumentUploadedUnselected=true
    // Probe server enforcement directly with the actual authenticated session.
    // A UI checkbox alone cannot establish this boundary.
    const before=await rows()
    const denied=await call(`/ai/conversations/${conversationId}/messages/stream`,{method:'POST',data:{
      clientRequestId:randomUUID(),message:'What is the ZX123 rating?',includeProjectContext:false,
      research:{mode:'off',documentIds:[documentId],consentToExternalQuery:false}}})
    assert.equal(denied.status(),403)
    assert.deepEqual(snapshot(await rows()),snapshot(before),'rejected consent must not leave a user/pending pair')
    report.checks.projectDocumentConsentEnforced=true
    await selection.check()
    await library().getByRole('button',{name:'Done',exact:true}).click()
    await page.getByLabel('Share this project context',{exact:true}).check()
    report.stage='project-document-generation'
    const on=await send('According to the selected synthetic reference, what is the ZX123 test supply rating? Answer one short sentence and cite the source.')
    assert.equal(on.includeProjectContext,true)
    assert.equal(on.projectRevision,project.documentRevision,'AI context uses the canonical saved revision')
    assert.equal(on.research.mode,'off')
    assert.deepEqual(on.research.documentIds,[documentId])
    assert(JSON.stringify(on).includes(marker),'sharing on includes saved synthetic firmware')
    report.checks.projectSharingOnSavedPayload=true
    const completed=await complete(4)
    const sources=completed[0].metadata?.citations
    assert(Array.isArray(sources) && sources.length>0)
    const citation=sources.find(s=>s.documentId===documentId)
    assert(citation && citation.locator==='document_chunk')
    const sourcePath=`/ai/documents/${documentId}/versions/${citation.versionId}/chunks/${citation.sourceId}`
    report.checks.projectCitationsPersisted=true
    const anonymous=await http.newContext()
    try {
      for(const path of [`/projects/${projectId}`,`/ai/conversations/${conversationId}`,sourcePath]) {
        const response=await anonymous.get(`${api}${path}`)
        assert([401,403].includes(response.status()))
      }
    } finally { await anonymous.dispose() }
    report.checks.anonymousProjectSourcesDenied=true

    if(verifyOtherUser) {
      const beforeProject=await call(`/projects/${projectId}`)
      assert.equal(beforeProject.status(),200)
      const savedProject=(await beforeProject.json()).data
      await verifyOtherUser({projectId,conversationId,documentId,sourcePath,marker,revision:project.documentRevision})
      report.stage='owner-integrity-after-cross-user'
      assert.deepEqual(snapshot(await rows()),snapshot(completed))
      const intact=await call(`/projects/${projectId}`)
      assert.equal(intact.status(),200)
      const restoredProject=(await intact.json()).data
      // Compare persisted snapshots: database timestamp precision can differ
      // from the initial create response. View counters intentionally change on GET.
      for(const field of ['id','name','description','isPublic','boardType','documentRevision','canvasLayout','codeFiles']) {
        report.stage=`owner-integrity-${field}`
        assert.deepEqual(restoredProject[field],savedProject[field])
      }
      const intactSource=await call(sourcePath)
      assert.equal(intactSource.status(),200)
      assert.equal((await intactSource.json()).data.content,text)
      report.checks.ownerIntactAfterCrossUser=true
    }

    report.stage='project-document-reopen'
    await page.reload({waitUntil:'domcontentloaded'})
    await waitFor(async()=>await composer().isVisible() || await page.getByRole('button',{name:'Sign in',exact:true}).isVisible(),30_000)
    if(!(await composer().isVisible())) await login(page)
    await composer().waitFor()
    await page.locator(`a[href="/editor/${projectId}?conversation=${conversationId}"]`).waitFor()
    assert.deepEqual(snapshot(await rows()),snapshot(completed))
    assert.equal(await page.getByLabel('Share this project context',{exact:true}).isChecked(),false)
    const openSource=async()=>{
      const details=page.locator('.vf-chat-sources').last()
      if(!await details.evaluate(el=>el.open)) await details.locator('summary').click()
      await details.getByRole('button',{name:new RegExp(`^\\[${citation.citationId}\\]`)}).click()
      return page.getByRole('dialog',{name:'Source excerpt',exact:true})
    }
    let source=await openSource()
    await source.locator('.vf-document-excerpt').waitFor()
    assert.equal(await source.locator('.vf-document-excerpt').innerText(),text)
    await page.keyboard.press('Escape')
    await openLibrary()
    assert.equal(await library().getByRole('checkbox',{name:`Use ${title}`,exact:true}).isChecked(),false)
    report.checks.projectReopenConsentReset=true
    report.checks.ownerSourceReadable=true

    report.stage='project-document-version'
    await library().getByRole('button',{name:'New version',exact:true}).click()
    await library().getByLabel('Document file',{exact:true}).setInputFiles({name:'synthetic-reference.txt',mimeType:'text/plain',buffer:Buffer.from(text.replace('3.3 V','5 V'))})
    const [replacement]=await Promise.all([
      page.waitForResponse(r=>r.url()===`${api}/ai/documents` && r.request().method()==='POST'),
      library().getByRole('button',{name:'Upload new version',exact:true}).click(),
    ])
    assert.equal(replacement.status(),201)
    const version=(await replacement.json()).data
    assert.equal(version.id,documentId); assert.equal(version.currentVersion,2)
    await library().getByText('v2',{exact:false}).waitFor()
    const oldSource=await call(sourcePath)
    assert.equal(oldSource.status(),200)
    assert.equal((await oldSource.json()).data.content,text)
    report.checks.projectHistoricalVersionPreserved=true
    report.stage='project-document-delete'
    await library().getByRole('button',{name:`Delete ${title}`,exact:true}).click()
    assert.equal((await call(sourcePath)).status(),200,'confirmation must precede deletion')
    await library().getByRole('button',{name:'Confirm deletion',exact:true}).click()
    await library().getByText('No matching documents.',{exact:false}).waitFor()
    assert.equal((await call(sourcePath)).status(),404)
    deletedDocument=true
    await library().getByRole('button',{name:'Done',exact:true}).click()
    source=await openSource()
    await source.getByRole('alert').waitFor()
    assert.deepEqual(snapshot(await rows()),snapshot(completed))
    report.checks.projectSourceDeletionPreservesChat=true
  } finally {
    let cleaned=true
    // Each cleanup is independent; a failure must not skip remaining owned records.
    if(conversationId) try {
      await call(`/ai/conversations/${conversationId}/stop`,{method:'POST'})
      const removed=await call(`/ai/conversations/${conversationId}`,{method:'DELETE'})
      const absent=await call(`/ai/conversations/${conversationId}`)
      if(!removed.ok() || absent.status()!==404) cleaned=false
    } catch { cleaned=false }
    if(documentId && !deletedDocument) try {
      if(!(await call(`/ai/documents/${documentId}`,{method:'DELETE'})).ok()) cleaned=false
    } catch { cleaned=false }
    if(projectId) try {
      const removed=await call(`/projects/${projectId}`,{method:'DELETE'})
      const absent=await call(`/projects/${projectId}`)
      if(!removed.ok() || absent.status()!==404) cleaned=false
    } catch { cleaned=false }
    report.checks.projectDocumentCleanup=cleaned
    report.measurements.projectScenario={projects:projectId?1:0,conversations:conversationId?1:0,documents:documentId?1:0,cleanupIncomplete:!cleaned}
  }
}
