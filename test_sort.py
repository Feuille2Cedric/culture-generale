"""Verify sorting and generate README screenshots with isolated demo data."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys
import threading
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '.test-tools'))
from playwright.sync_api import sync_playwright

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
        tab = browser.new_page(viewport={'width':1440, 'height':1100})
        errors = []
        tab.on('pageerror', lambda error: errors.append(str(error)))
        tab.goto(f'http://127.0.0.1:{server.server_port}/')
        tab.wait_for_function('ready')
        tab.evaluate('''async () => {
            library={topics:[
                {id:'t1',title:'Musique',description:'Écouter autrement. Des albums, des artistes et des émotions.',color:'rose'},
                {id:'t2',title:'Écriture',description:'Des idées, des mots et des phrases à garder près de soi.',color:'lavender'},
                {id:'t3',title:'Astronomie',description:'Lever les yeux et faire de la place aux grandes questions.',color:'blue'},
                {id:'t4',title:'Histoire',description:'Suivre les traces du passé pour éclairer le présent.',color:'sand'},
                {id:'t5',title:'Botanique',description:'Prendre le temps de regarder le vivant qui nous entoure.',color:'sage'}
            ],pages:[]};
            for(const [i,title] of ['Zodiaque','étoiles','Andromède','Observation 10','Observation 2'].entries())
                library.pages.push({id:'p'+i,topic:'t3',kind:'article',title,blocks:[{id:'b'+i,type:'text',text:'Une page de démonstration pour organiser mes découvertes.'}],updated:1700000000000+i*1000,visited:1700000000000+i*1000,favorite:true});
            library.pages.push({id:'note',topic:'t2',kind:'quote',title:'Garder le regard ouvert',author:'Note personnelle · exemple',blocks:[{id:'quote',type:'quote',text:'Il reste toujours quelque chose à découvrir.'}],updated:1700000000000,favorite:false});
            library.pages.push({id:'quick',topic:'t5',kind:'quick',title:'Observer avant de nommer',blocks:[{id:'quicktext',type:'text',text:'Regarder la forme d’une feuille, sa texture et son contour. Prendre quelques notes avant de chercher son nom.'}],updated:1700000000000,favorite:false});
            changed(); await save(); render();
        }''')
        original = tab.evaluate('JSON.stringify(library)')
        assert tab.locator('.card h3').all_text_contents() == ['Astronomie','Botanique','Écriture','Histoire','Musique']
        assert [s.strip() for s in tab.locator('#topics button').all_text_contents()] == ['Astronomie','Botanique','Écriture','Histoire','Musique']
        recent_before = tab.locator('[data-page]').all_text_contents()
        tab.get_by_label('Ordre de tri').select_option('za')
        assert tab.locator('.card h3').all_text_contents() == ['Musique','Histoire','Écriture','Botanique','Astronomie']
        assert tab.locator('[data-page]').all_text_contents() == recent_before
        assert tab.evaluate('JSON.stringify(library)') == original
        tab.reload()
        tab.wait_for_function('ready')
        assert tab.get_by_label('Ordre de tri').input_value() == 'za'
        assert tab.locator('.card h3').first.inner_text() == 'Musique'
        tab.locator('.card[data-topic="t3"]').click()
        assert tab.locator('.page-name strong').all_text_contents() == ['Zodiaque ☆','Observation 10 ☆','Observation 2 ☆','étoiles ☆','Andromède ☆']
        tab.get_by_label('Ordre de tri').select_option('az')
        expected = ['Andromède ☆','étoiles ☆','Observation 2 ☆','Observation 10 ☆','Zodiaque ☆']
        assert tab.locator('.page-name strong').all_text_contents() == expected
        tab.locator('#favorites').click()
        assert tab.locator('.page-name strong').all_text_contents() == expected
        tab.get_by_label('Rechercher', exact=True).fill('démonstration')
        assert tab.locator('.page-name strong').all_text_contents() == expected
        tab.get_by_label('Ordre de tri').select_option('recent')
        assert tab.locator('.page-name strong').first.inner_text() == 'Observation 2 ☆'
        tab.locator('#home').click()
        assert tab.locator('.card h3').all_text_contents() == ['Botanique','Histoire','Astronomie','Écriture','Musique']
        tab.locator('[data-collection="article"]').click()
        tab.get_by_label('Ordre de tri').select_option('az')
        assert tab.locator('.page-name strong').all_text_contents() == expected
        tab.locator('[data-page]').first.click()
        assert tab.locator('#sort-control').is_hidden()
        tab.locator('[data-action="edit-page"]').click()
        assert tab.locator('#sort-control').is_hidden()
        assert tab.locator('#page-topic option').all_text_contents() == ['Astronomie','Botanique','Écriture','Histoire','Musique']
        tab.locator('#home').click()
        tab.screenshot(path=str(ROOT/'docs'/'bibliotheque.png'),full_page=True)
        tab.evaluate('navigate("reader","note")')
        tab.screenshot(path=str(ROOT/'docs'/'lecture.png'),full_page=True)
        tab.set_viewport_size({'width':390,'height':844})
        tab.locator('#home').click()
        assert tab.evaluate('document.documentElement.scrollWidth <= innerWidth')
        tab.screenshot(path=str(ROOT/'docs'/'mobile.png'),full_page=True)
        assert not errors, errors
        browser.close()
        print('PASS: accents, natural numbers, A-Z/Z-A/recent, subjects/sidebar/pages/search/favorites/collections, unchanged recent section and stored content, persisted preference, mobile; README screenshots generated.')
finally:
    server.shutdown()
