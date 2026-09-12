"""Two isolated browsers using the real SDK and a simulated private backend.
No real accounts, emails or user documents are used.
"""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys, threading, json, base64, time, copy
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.test-tools'))
from playwright.sync_api import sync_playwright

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT.parent)))
threading.Thread(target=server.serve_forever,daemon=True).start()
cloud={}; images={}; writes=[]; uploads=[]; cas_once=[False]
def b64(value): return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
def token(owner): return b64({'alg':'HS256','typ':'JWT'})+'.'+b64({'sub':owner,'exp':int(time.time())+3600,'role':'authenticated'})+'.test'
def route(request):
    req=request.request; url=req.url; headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'}
    if req.method=='OPTIONS': return request.fulfill(status=200,headers=headers)
    auth=req.headers.get('authorization','').replace('Bearer ','')
    owner=json.loads(base64.urlsafe_b64decode(auth.split('.')[1]+'==='))['sub']
    if '/auth/v1/logout' in url: return request.fulfill(status=204,headers=headers)
    if '/storage/v1/object/' in url:
        path=url.split('/personal-app-images/')[1]
        assert path.startswith(owner+'/'), (owner,path)
        if req.method=='POST':
            if path in images: return request.fulfill(status=409,json={'statusCode':'409'},headers=headers)
            images[path]=req.post_data_buffer; uploads.append(path)
            return request.fulfill(json={'Key':path},headers=headers)
        return request.fulfill(body=images[path],content_type='image/png',headers=headers)
    if '/rpc/' in url:
        body=req.post_data_json; key=(owner,body['p_app']); current=cloud.get(key,{'revision':0})
        if cas_once[0]:
            cas_once[0]=False
            return request.fulfill(json={'conflict':True,'revision':current['revision']},headers=headers)
        if current['revision']!=body['p_revision']: return request.fulfill(json={'conflict':True,'revision':current['revision']},headers=headers)
        cloud[key]={'revision':current['revision']+1,'document':body['p_document']};writes.append(key)
        return request.fulfill(json={'revision':cloud[key]['revision']},headers=headers)
    from urllib.parse import urlparse,parse_qs
    query=parse_qs(urlparse(url).query); app=query['app'][0][3:]
    assert query['owner_id'][0]=='eq.'+owner
    value=cloud.get((owner,app))
    return request.fulfill(json=[value] if value else [],headers=headers)

try:
 with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
    errors=[]
    def page(repo,owner='alice',seed=None):
        ctx=browser.new_context(accept_downloads=True)
        ctx.route('https://*.supabase.co/**',route)
        session={'access_token':token(owner),'refresh_token':'test','expires_at':int(time.time())+3600,'expires_in':3600,'token_type':'bearer','user':{'id':owner,'email':owner+'@example.test'}}
        ctx.add_init_script("if(!localStorage.getItem('test-initialized')){localStorage.setItem('personal-app-auth',"+json.dumps(json.dumps(session))+");localStorage.setItem('test-initialized','1');"+("localStorage.setItem('mes-apps-manual',"+json.dumps(json.dumps(seed))+");" if seed else '')+"}")
        p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
        p.goto('http://127.0.0.1:%s/%s/'%(server.server_port,repo))
        var='curioSync' if repo=='culture-generale' else 'mesAppsSync'
        p.wait_for_function('window.'+var+'?.meta.revision>0 && !window.'+var+'.busy')
        return ctx,p,var
    def cycle(p,var):
        p.wait_for_function('!window.'+var+'.busy')
        p.evaluate('window.'+var+'.cycle()')
        p.wait_for_function('!window.'+var+'.busy')
    item={'id':'one','name':'Personal link','url':'https://example.com','github':'','description':'Initial','accent':'#3056d3','category':'Test'}
    ca,a,v=page('mes-apps',seed=[item]);cb,b,_=page('mes-apps')
    assert b.evaluate('manualApps[0].name')=='Personal link'
    a.evaluate("manualApps[0].description='From A';saveManualApps()")
    b.evaluate("manualApps[0].name='From B';saveManualApps()")
    cycle(a,v);cycle(b,v);cycle(a,v)
    assert a.evaluate('manualApps[0]')==b.evaluate('manualApps[0]')
    assert b.evaluate('manualApps[0].description')=='From A'
    # Offline edits are retained, then sent on reconnect.
    ca.set_offline(True);a.evaluate("manualApps[0].description='Offline';saveManualApps()")
    cycle(a,v);assert a.evaluate('manualApps[0].description')=='Offline'
    ca.set_offline(False);cycle(a,v);cycle(b,v)
    assert b.evaluate('manualApps[0].description')=='Offline'
    # Revision races retry without overwriting a newer document.
    cas_once[0]=True;a.evaluate("manualApps[0].description='Retry';saveManualApps()")
    cycle(a,v);cycle(a,v);cycle(b,v)
    assert b.evaluate('manualApps[0].description')=='Retry'
    # Different account sees no Alice data.
    cc,c,_=page('mes-apps','bob');assert c.evaluate('manualApps.length')==0
    # Same-field conflicts preserve both versions until explicit resolution.
    a.evaluate("manualApps[0].name='Version A';saveManualApps()")
    b.evaluate("manualApps[0].name='Version B';saveManualApps()")
    cycle(a,v);cycle(b,v)
    assert b.evaluate('Boolean(mesAppsSync.pendingConflict)')
    assert b.evaluate('manualApps[0].name')=='Version B'
    with b.expect_download() as download: b.locator('#sync-backup').click()
    backup=json.loads(Path(download.value.path()).read_text(encoding='utf-8'))
    assert backup['local']['apps'][0]['name']=='Version B'
    assert backup['remote']['apps'][0]['name']=='Version A'
    b.locator('#sync-use-cloud').click();b.wait_for_function('!mesAppsSync.busy&&!mesAppsSync.pendingConflict')
    assert b.evaluate('manualApps[0].name')=='Version A'
    # Logout hides the account's cached information.
    b.locator('#sync-logout').click();b.wait_for_function('!mesAppsSync.user')
    assert b.locator('.sync-lock').is_visible()
    assert b.locator('main').evaluate('(el)=>el.inert')
    # Curio: preserve complete pages, categories and image bytes on a new device.
    cd,d,cv=page('culture-generale')
    d.evaluate("""async()=>{
      const tx=db.transaction('images','readwrite'),wait=done(tx);
      tx.objectStore('images').put('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1sAAAAASUVORK5CYII=','image-one');await wait;
      library={topics:[{id:'cinema',title:'Cinema',description:'',color:'sage',categories:[{id:'film',title:'Films'}]}],pages:[{id:'page-one',topic:'cinema',category:'film',kind:'article',title:'A film',updated:1,blocks:[{id:'text-one',type:'text',text:'My notes'},{id:'block-image',type:'image',image:'image-one',layout:'wide',text:''}]}]};changed();await save();navigate('home');
    }""")
    cycle(d,cv)
    ce,e,_=page('culture-generale')
    assert e.evaluate('library.pages[0].title')=='A film'
    assert e.evaluate("req(db.transaction('images').objectStore('images').get('image-one'))").startswith('data:image/png;')
    count=len(uploads);cycle(d,cv);cycle(e,cv);assert len(uploads)==count
    assert e.evaluate('library.topics[0].categories[0].title')=='Films'
    assert not errors,errors
    print('PASS: real SDK, two browsers, migration, disjoint merge, offline, CAS retry, private accounts, conflict export/resolution, logout, Curio categories and private images')
    browser.close()
finally: server.shutdown()
