"""End-to-end checks. python test_app.py (requires Playwright and Chrome)."""
import base64
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '.test-tools'))
from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT.parent)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/culture-generale/'
    output = ROOT / 'test-results'
    output.mkdir(exist_ok=True)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
            context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
            tab = context.new_page()
            errors = []
            tab.on('pageerror', lambda error: errors.append(str(error)))
            tab.goto(url)
            tab.get_by_role('button', name='Nouveau sujet', exact=False).click()
            tab.get_by_label('Nom du sujet').fill('Astronomie')
            tab.get_by_label('Une petite description').fill('Étoiles, planètes et grandes questions sur l’Univers.')
            tab.get_by_role('button', name='Enregistrer', exact=True).click()
            tab.locator('[data-create-kind="article"]').click()
            tab.get_by_label('Titre de la page', exact=True).fill('Les étoiles')
            tab.get_by_role('textbox', name='Texte', exact=True).fill('Une étoile produit de l’énergie. <script>test</script>')
            tab.locator('[data-add="heading"]').click()
            tab.get_by_label('Titre de section', exact=True).fill('À retenir')
            tab.locator('[data-add="link"]').click()
            tab.get_by_label('Titre du lien', exact=True).fill('Ma source')
            tab.get_by_label('Adresse du lien', exact=True).fill('https://example.com/')
            png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=')
            tab.locator('[data-add="image"]').click()
            tab.locator('#image-input').set_input_files({'name': 'star.png', 'mimeType': 'image/png', 'buffer': png})
            tab.get_by_label('Légende de l’image').fill('Une image de test')
            tab.get_by_label('Disposition de l’image').select_option('narrow')
            tab.wait_for_function('document.querySelector("img")?.naturalWidth > 0')
            tab.locator('.block.image [data-move][data-dir="-1"]').click()
            assert tab.locator('.block').nth(2).get_attribute('class').find('image') >= 0
            tab.locator('[data-action="favorite"]').click()
            tab.locator('[data-action="save-page"]').click()
            tab.locator('.reader-article').wait_for()
            assert tab.locator('#view textarea, #view input').count() == 0
            assert '<script>test</script>' in tab.locator('.reading-text').inner_text()
            assert tab.locator('.reading-link').get_attribute('href') == 'https://example.com/'
            tab.wait_for_function('document.querySelector("#save-status").textContent.includes("Enregistré")')
            tab.reload()
            tab.locator('[data-page]').first.click()
            tab.locator('[data-action="edit-page"]').click()
            assert tab.get_by_label('Titre de la page', exact=True).input_value() == 'Les étoiles'
            assert '<script>test</script>' in tab.get_by_role('textbox', name='Texte', exact=True).input_value()
            tab.wait_for_function('document.querySelector("img")?.naturalWidth > 0')
            tab.screenshot(path=str(output / 'editor.png'), full_page=True)
            tab.get_by_label('Rechercher', exact=True).fill('énergie')
            assert tab.locator('[data-page]').count() == 1
            tab.locator('[data-page]').click()
            tab.locator('[data-action="edit-page"]').click()
            tab.locator('[data-action="delete-page"]').click()
            tab.locator('#home').click()
            tab.locator('[data-action="trash"]').click()
            tab.get_by_role('button', name='Restaurer').click()
            tab.locator('#favorites').click()
            assert tab.locator('[data-page]').count() == 1
            with tab.expect_download() as download:
                tab.locator('#export').click()
            backup = output / 'backup.json'
            download.value.save_as(backup)
            data = json.loads(backup.read_text(encoding='utf-8'))
            assert len(data['images']) == 1
            assert len(data['library']['pages'][0]['blocks']) == 4
            tab.on('dialog', lambda dialog: dialog.accept())
            tab.locator('#import-input').set_input_files(backup)
            tab.wait_for_function('document.querySelector("#notice").textContent.includes("Sauvegarde importée")')
            assert tab.locator('.card').count() == 2
            tab.screenshot(path=str(output / 'desktop.png'), full_page=True)
            # A stale window must not silently overwrite newer data.
            other = context.new_page()
            other.goto(url)
            other.wait_for_function('document.querySelector("#save-status").textContent.includes("Enregistré")')
            tab.locator('[data-page]').first.click()
            tab.locator('[data-action="edit-page"]').click()
            tab.get_by_label('Titre de la page', exact=True).fill('Titre depuis la première fenêtre')
            tab.wait_for_function('document.querySelector("#save-status").textContent.includes("Enregistré")')
            other.locator('[data-page]').first.click()
            other.locator('[data-action="edit-page"]').click()
            other.get_by_label('Titre de la page', exact=True).fill('Titre concurrent')
            other.wait_for_function('document.querySelector("#notice").textContent.includes("autre fenêtre")')
            other.close()
            # Three distinct formats, explicit save, reading mode and format changes.
            tab.locator('[data-action="back"]').click()
            tab.locator('[data-create-kind="quick"]').click()
            tab.get_by_label('Titre de la page', exact=True).fill('Une info en quelques mots')
            tab.get_by_role('textbox', name='Texte', exact=True).fill('Première ligne.\nDeuxième ligne.')
            tab.locator('[data-action="save-page"]').click()
            tab.locator('.reader-quick').wait_for()
            assert '\n' in tab.locator('.reading-text').inner_text()
            tab.screenshot(path=str(output / 'quick-reader.png'), full_page=True)
            tab.locator('[data-action="back"]').click()
            tab.locator('[data-create-kind="quote"]').click()
            tab.get_by_label('Titre de la page', exact=True).fill('La curiosité')
            tab.get_by_label('Auteur ou source', exact=True).fill('Mon carnet personnel')
            tab.get_by_role('textbox', name='Citation', exact=True).fill('Chaque question ouvre une nouvelle porte.')
            tab.locator('[data-action="save-page"]').click()
            tab.locator('.reader-quote').wait_for()
            assert 'Mon carnet personnel' in tab.locator('.quote-author').inner_text()
            tab.screenshot(path=str(output / 'quote-reader.png'), full_page=True)
            tab.locator('[data-action="edit-page"]').click()
            tab.get_by_label('Format', exact=True).select_option('article')
            for heading in ['Une première piste', 'Pour aller plus loin']:
                tab.locator('[data-add="heading"]').click()
                tab.get_by_label('Titre de section', exact=True).last.fill(heading)
            tab.locator('[data-action="save-page"]').click()
            tab.locator('.reader-article').wait_for()
            assert tab.locator('.reading-toc a').count() == 2
            tab.locator('.reading-toc a').last.click()
            assert '#section-' in tab.url
            tab.screenshot(path=str(output / 'article-reader.png'), full_page=True)
            tab.locator('[data-action="edit-page"]').click()
            tab.get_by_label('Format', exact=True).select_option('quote')
            assert tab.get_by_label('Auteur ou source', exact=True).input_value() == 'Mon carnet personnel'
            tab.locator('[data-action="save-page"]').click()
            tab.locator('.reader-quote').wait_for()
            tab.locator('[data-action="back"]').click()
            assert tab.locator('.knowledge-group.format-quick [data-page]').count() == 1
            assert tab.locator('.knowledge-group.format-article [data-page]').count() == 1
            assert tab.locator('.knowledge-group.format-quote [data-page]').count() == 1
            tab.screenshot(path=str(output / 'formats.png'), full_page=True)
            tab.locator('#home').click()
            tab.locator('[data-collection="quick"]').click()
            assert tab.locator('[data-page]').count() == 1
            tab.locator('[data-page]').click()
            tab.locator('.reader-quick').wait_for()
            tab.set_viewport_size({'width': 390, 'height': 844})
            assert tab.evaluate('document.documentElement.scrollWidth <= innerWidth')
            tab.screenshot(path=str(output / 'mobile.png'), full_page=True)
            # Legacy backups without a format still open as full articles.
            for old_page in data['library']['pages']:
                old_page.pop('kind', None)
                old_page.pop('author', None)
            legacy = output / 'legacy.json'
            legacy.write_text(json.dumps(data), encoding='utf-8')
            tab.locator('#import-input').set_input_files(legacy)
            tab.wait_for_function('document.querySelector("#notice").textContent.includes("Sauvegarde importée")')
            tab.locator('.card').last.click()
            assert tab.locator('.knowledge-group.format-article [data-page]').count() == 1
            tab.locator('.knowledge-group.format-article [data-page]').click()
            tab.locator('.reader-article').wait_for()
            # A save failure leaves the user in the editor with all content.
            tab.locator('[data-action="edit-page"]').click()
            tab.get_by_label('Titre de la page', exact=True).fill('À conserver malgré une erreur')
            tab.evaluate('db.close()')
            tab.locator('[data-action="save-page"]').click()
            tab.wait_for_function('document.querySelector("#notice").textContent.includes("Enregistrement impossible")')
            assert tab.get_by_label('Titre de la page', exact=True).input_value() == 'À conserver malgré une erreur'
            assert tab.locator('[data-action="save-page"]').is_enabled()
            assert not errors, errors
            browser.close()
            print('PASS: persistence, images, export/import, concurrency, three formats, save/read/edit, table of contents, author, legacy migration, save failure, mobile; no JavaScript errors.')
    finally:
        server.shutdown()


if __name__ == '__main__':
    run()
