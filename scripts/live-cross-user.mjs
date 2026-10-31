import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { acceptanceRequest } from './live-chat-report.mjs'

// An independent real browser login. Never inject cookies, tokens or an auth mock.
// Only this invocation's synthetic fixture identifiers may be used for writes.
export async function verifyCrossUser({ browser, app, api, login, waitFor, report, ownerToken, fixture, credentials }) {
  const { projectId, conversationId, documentId, sourcePath, marker, revision } = fixture
  const context=await browser.newContext({viewport:{width:1366,height:900}})
  let token, ownId
  const page=await context.newPage()
  const call=(path,options={})=>{
    assert(token)
    return acceptanceRequest(()=>context.request.fetch(`${api}${path}`,{
      ...options,headers:{Authorization:`Bearer ${token}`},timeout:30_000,
    }))
  }
  page.on('request',request=>{
    if(!request.url().startsWith(`${api}/`)) return
    const auth=request.headers().authorization
    if(auth?.startsWith('Bearer ')) token=auth.slice(7)
  })
  const denied=async(path,options,status)=>{
    const response=await call(path,options)
    assert.equal(response.status(),status,`Access boundary ${options?.method || 'GET'} ${path.split('/')[1]}`)
    assert(!(await response.text()).includes(marker),'denial must not leak fixture content')
  }
  try {
    report.stage='cross-user-fresh-login'
    const rejected=page.waitForResponse(r=>r.url()===`${api}/ai/conversations/${conversationId}` && r.status()===404,{timeout:120_000})
    // Attach a handler now so a failed login does not leave an unhandled rejection.
    void rejected.catch(()=>{})
    await page.goto(`${app}/ai-chat?conversation=${conversationId}`,{waitUntil:'domcontentloaded'})
    await login(page,credentials)
    await waitFor(()=>token,10_000)
    // Subject comparison is only evidence; the server validates both real JWTs.
    const subject=value=>JSON.parse(Buffer.from(value.split('.')[1],'base64url').toString()).sub
    assert(subject(token) && subject(token)!==subject(ownerToken))
    report.checks.secondLoginDistinct=true
    await rejected
    await page.getByRole('alert').first().waitFor()
    assert.equal(await page.locator('.vf-ai-chat__msg').count(),0)
    assert(!(await page.locator('body').innerText()).includes(marker))
    report.checks.foreignConversationUiDenied=true
    report.stage='cross-user-access-boundaries'
    const conversation=`/ai/conversations/${conversationId}`
    for(const [suffix,options] of [
      ['',{}],['/messages',{}],['',{method:'PATCH',data:{title:'Unauthorized change'}}],
      ['',{method:'DELETE'}],['/stop',{method:'POST'}],
      ['/messages/stream',{method:'POST',data:{clientRequestId:randomUUID(),message:'Unauthorized synthetic request',includeProjectContext:false}}],
    ]) await denied(conversation+suffix,options,404)
    report.checks.foreignConversationOperationsDenied=true
    for(const options of [{},{method:'PUT',data:{name:'Unauthorized change',expectedRevision:revision}},{method:'DELETE'}])
      await denied(`/projects/${projectId}`,options,403)
    await denied('/ai/conversations',{method:'POST',data:{projectId}},403)
    report.checks.foreignProjectOperationsDenied=true
    await denied(`/ai/documents?projectId=${projectId}`,{},403)
    await denied(sourcePath,{},404)
    await denied(`/ai/documents/${documentId}`,{method:'DELETE'},404)
    await denied('/ai/documents',{method:'POST',multipart:{documentId,title:'Unauthorized replacement',
      file:{name:'replacement.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic unauthorized replacement')}}},404)
    report.checks.foreignDocumentOperationsDenied=true
    for(const [path,id] of [['/ai/conversations',conversationId],['/projects',projectId],['/ai/documents',documentId]]) {
      const response=await call(path)
      assert.equal(response.status(),200)
      assert(!(await response.text()).includes(id))
    }
    report.checks.foreignResourcesAbsentFromLists=true
    // Positive control: the second principal can create and reopen their own chat.
    const created=await call('/ai/conversations',{method:'POST',data:{}})
    assert.equal(created.status(),201)
    ownId=(await created.json()).data.id
    assert.equal(typeof ownId,'string')
    const own=await call(`/ai/conversations/${ownId}`)
    assert.equal(own.status(),200)
    assert.equal((await own.json()).data.id,ownId)
    const ownMessages=await call(`/ai/conversations/${ownId}/messages`)
    assert.equal(ownMessages.status(),200)
    assert.deepEqual((await ownMessages.json()).data.content,[])
    report.checks.secondOwnConversationRestored=true
  } finally {
    let cleaned=true
    if(ownId) try {
      const removed=await call(`/ai/conversations/${ownId}`,{method:'DELETE'})
      cleaned=removed.ok() && (await call(`/ai/conversations/${ownId}`)).status()===404
    } catch { cleaned=false }
    report.checks.secondFixtureCleanup=cleaned
    await context.close()
  }
}
