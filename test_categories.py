"""Browser checks for custom categories and backup compatibility."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import sys
import threading
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.test-tools'))
from playwright.sync_api import sync_playwright
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
        context=browser.new_context(viewport={'width':1440,'height':1050},accept_downloads=True)
        tab=context.new_page();errors=[]
        tab.on('pageerror',lambda e:errors.append(str(e)))
        tab.on('dialog',lambda d:d.accept())
        tab.goto(f'http://127.0.0.1:{server.server_port}/');tab.wait_for_function('ready')
        tab.evaluate('''async()=>{
          library={topics:[{id:'cinema',title:'Cinéma',description:'Les visages et les histoires du grand écran.',color:'rose'},{id:'music',title:'Musique',description:'Albums, ballets et singles à explorer.',color:'sage'}],pages:[{id:'old',topic:'cinema',title:'Une ancienne page',kind:'quick',blocks:[{id:'text',type:'text',text:'À conserver.'}],updated:100}]};changed();await save();navigate('topic','cinema');
        }''')
        tab.locator('[data-category-suggest="Acteurs"]').click()
        tab.locator('#category-form button[type=submit]').click()
        actor_id=tab.evaluate('topic().categories[0].id')
        tab.locator('[data-create-kind="article"]').click()
        assert tab.locator('#page-category').input_value()==actor_id
        tab.locator('#page-title').fill('Un portrait à découvrir')
        tab.locator('[data-text]').fill('Mes notes sur un acteur.')
        tab.locator('[data-action="save-page"]').click();tab.locator('.reader').wait_for()
        assert 'Acteurs' in tab.locator('.reading-meta').inner_text()
        tab.locator('[data-action="back"]').click()
        assert tab.locator('[data-page]').count()==1
        tab.locator('[data-category-rename]').click()
        tab.locator('#category-name').fill('Interprètes')
        tab.locator('#category-form button[type=submit]').click()
        assert 'Interprètes' in tab.locator('.page-name small').inner_text()
        tab.locator('[data-category-new]').click();tab.locator('#category-name').fill('interprètes')
        tab.locator('#category-form button[type=submit]').click()
        assert tab.locator('#category-dialog').is_visible()
        assert tab.locator('#category-name').evaluate('(el)=>!el.checkValidity()')
        tab.locator('#category-name').fill('Films');tab.locator('#category-form button[type=submit]').click()
        tab.locator('[data-create-kind="article"]').click();tab.locator('#page-title').fill('Un film à revoir')
        tab.locator('[data-action="save-page"]').click();tab.locator('.reader').wait_for()
        tab.locator('[data-action="back"]').click();tab.locator('[data-category-filter="all"]').click()
        assert tab.locator('[data-page]').count()==3
        tab.locator('[data-category-filter="unfiled"]').click();assert tab.locator('[data-page]').count()==1
        tab.locator('[data-page]').click();tab.locator('[data-action="edit-page"]').click()
        tab.locator('#page-category').select_option(actor_id)
        tab.locator('[data-action="save-page"]').click();tab.locator('.reader').wait_for()
        tab.wait_for_function('!dirty&&!saving');tab.reload();tab.wait_for_function('ready')
        assert tab.evaluate('library.pages.find(p=>p.id==="old").category')==actor_id
        tab.evaluate('navigate("topic","cinema")');tab.locator('[data-category-filter="all"]').click()
        tab.screenshot(path=str(ROOT/'docs'/'sous-categories.png'),full_page=True)
        tab.set_viewport_size({'width':390,'height':844})
        assert tab.evaluate('document.documentElement.scrollWidth<=innerWidth')
        tab.set_viewport_size({'width':1440,'height':1050})
        # Export/import keeps category assignments and gives copies new IDs.
        with tab.expect_download() as download:tab.locator('#export').click()
        target=ROOT/'test-results'/'categories.json';target.parent.mkdir(exist_ok=True);download.value.save_as(target)
        backup=json.loads(target.read_text(encoding='utf-8'))
        tab.locator('#import-input').set_input_files(target)
        tab.wait_for_function('library.pages.length===6&&!dirty&&!saving')
        assert tab.evaluate('library.pages.slice(3).every(p=>!p.category||categoryOf(p))')
        assert tab.evaluate('library.topics[0].categories[0].id!==library.topics[2].categories[0].id')
        # Moving to another topic resets the assignment.
        tab.evaluate('navigate("editor","old")');tab.locator('#page-topic').select_option('music')
        assert tab.locator('#page-category').input_value()==''
        tab.locator('[data-category-new]').click();tab.locator('#category-name').fill('Albums')
        tab.locator('#category-form button[type=submit]').click()
        assert tab.locator('#page-category').input_value()
        tab.locator('[data-action="save-page"]').click();tab.locator('.reader').wait_for()
        tab.evaluate('navigate("topic","cinema")');tab.locator(f'[data-category-filter="{actor_id}"]').click()
        tab.locator('[data-category-delete]').click()
        assert tab.evaluate('library.pages.length')==6
        assert tab.evaluate('library.pages.filter(p=>p.topic==="cinema").every(p=>p.category!=="'+actor_id+'")')
        # The source metadata from the Notion conversion is recovered once.
        tab.evaluate('''async()=>{
          library.pages.push({id:'notion',topic:'music',title:'Un ballet',blocks:[{id:'n',type:'text',text:'Texte original inchangé.'}],updated:100,source:{type:'notion-html',path:['Musique','Ballet 🩰','Un ballet']}});changed();await save();
        }''')
        tab.reload();tab.wait_for_function('ready&&!dirty&&!saving')
        assert tab.evaluate('categoryOf(library.pages.find(p=>p.id==="notion")).title')=='Ballet'
        assert tab.evaluate('library.pages.find(p=>p.id==="notion").blocks[0].text')=='Texte original inchangé.'
        assert tab.evaluate('recoverNotionCategories(library)') is False
        invalid=backup.copy();invalid=json.loads(json.dumps(backup));invalid['library']['pages'][0]['category']='missing'
        rejected=tab.evaluate('(data)=>{try{validateBackup(data);return false;}catch{return true;}}',invalid)
        assert rejected
        assert not errors,errors
        print('PASS: create/rename/filter/assign/delete, duplicate validation, editor topic changes, persistence, category export/import remapping, legacy Notion recovery, invalid backup rejection, mobile.')
        browser.close()
finally:server.shutdown()
