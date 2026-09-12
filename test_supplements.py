"""Exercise supplemental imports in an isolated browser (optional backup paths)."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json, sys, threading
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.test-tools'))
from playwright.sync_api import sync_playwright
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
  tab=browser.new_page();errors=[]
  tab.on('pageerror',lambda e:errors.append(str(e)))
  tab.on('dialog',lambda d:d.accept())
  tab.goto(f'http://127.0.0.1:{server.server_port}/');tab.wait_for_function('ready')
  if len(sys.argv)>=3:
   original=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
   supplement=json.loads(Path(sys.argv[2]).read_text(encoding='utf-8-sig'))
  else:
   original=dict(library=dict(topics=[dict(id='topic',title='Test',description='',color='blue')],pages=[dict(id='old',title='Existing',topic='topic',updated=1,blocks=[])]),images={})
   supplement=dict(format='curio',version=1,supplement=dict(version=1,id='test'),library=dict(topics=original['library']['topics'],pages=[dict(id='new',title='New',topic='topic',kind='quick',updated=2,blocks=[dict(id='b',type='text',text='Content')])]),images={})
  tab.evaluate('''async data=>{
   library=data.library;changed();await save();
   const tx=db.transaction('images','readwrite'),wait=done(tx);
   for(const [id,value] of Object.entries(data.images))tx.objectStore('images').put(value,id);
   await wait;
  }''',original)
  before=tab.evaluate('JSON.stringify(library.pages)')
  if '--repair' in sys.argv:
   expected_topics=tab.evaluate('planTopicRepair(library).library.topics.length')
   retained=tab.evaluate('library.pages.map(({topic,category,...p})=>p)')
   tab.locator('#repair-topics').click()
   tab.wait_for_function('(n)=>library.topics.length===n',arg=expected_topics)
   assert tab.evaluate('library.pages.map(({topic,category,...p})=>p)')==retained
   assert tab.evaluate('planTopicRepair(library).merged')==0
   assert tab.evaluate('(data)=>planSupplement(library,data).added',supplement)==0
   tab.reload();tab.wait_for_function('ready')
   assert tab.evaluate('library.topics.length')==expected_topics
   assert tab.evaluate('library.pages.length')==len(original['library']['pages'])
   assert tab.evaluate('''async()=>{for(const p of library.pages)for(const b of p.blocks)if(b.type==='image'&&!await req(db.transaction('images').objectStore('images').get(b.image)))return false;return true;}''')
   assert not errors,errors
   print('PASS: duplicate subjects repaired; all pages and images preserved; supplement reimport adds zero pages.')
   browser.close();sys.exit(0)
  tab.evaluate('async data=>{validateBackup(data);await importSupplement(data);}',supplement)
  expected=len(original['library']['pages'])+len(supplement['library']['pages'])
  assert tab.evaluate('library.pages.length')==expected
  assert tab.evaluate('(n)=>JSON.stringify(library.pages.slice(0,n))',len(original['library']['pages']))==before
  assert tab.evaluate('library.topics.length')==len(original['library']['topics'])
  tab.evaluate('async data=>{await importSupplement(data);}',supplement)
  assert tab.evaluate('library.pages.length')==expected
  tab.reload();tab.wait_for_function('ready')
  assert tab.evaluate('library.pages.length')==expected
  assert tab.evaluate('''async()=>{for(const p of library.pages)for(const b of p.blocks)if(b.type==='image'&&!await req(db.transaction('images').objectStore('images').get(b.image)))return false;return true;}''')
  assert not errors,errors
  print(f'PASS: {expected} pages, original pages preserved, repeat import ignored, reload and images verified.')
  browser.close()
finally:server.shutdown()
