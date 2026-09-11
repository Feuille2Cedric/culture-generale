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
            tab.get_by_role('button', name='Nouvelle page', exact=False).click()
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
            tab.wait_for_function('document.querySelector("#save-status").textContent.includes("Enregistré")')
            tab.reload()
            tab.locator('[data-page]').first.click()
            assert tab.get_by_label('Titre de la page', exact=True).input_value() == 'Les étoiles'
            assert '<script>test</script>' in tab.get_by_role('textbox', name='Texte', exact=True).input_value()
            tab.wait_for_function('document.querySelector("img")?.naturalWidth > 0')
            tab.screenshot(path=str(output / 'editor.png'), full_page=True)
            tab.get_by_label('Rechercher', exact=True).fill('énergie')
            assert tab.locator('[data-page]').count() == 1
            tab.locator('[data-page]').click()
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
            tab.get_by_label('Titre de la page', exact=True).fill('Titre depuis la première fenêtre')
            tab.wait_for_function('document.querySelector("#save-status").textContent.includes("Enregistré")')
            other.locator('[data-page]').first.click()
            other.get_by_label('Titre de la page', exact=True).fill('Titre concurrent')
            other.wait_for_function('document.querySelector("#notice").textContent.includes("autre fenêtre")')
            other.close()
            tab.locator('#home').click()
            tab.set_viewport_size({'width': 390, 'height': 844})
            assert tab.evaluate('document.documentElement.scrollWidth <= innerWidth')
            tab.screenshot(path=str(output / 'mobile.png'), full_page=True)
            assert not errors, errors
            browser.close()
            print('PASS: subpath, subjects, editing, images, reorder, persistence, search, favorites, trash, export/import, conflict prevention, mobile layout; no JavaScript errors.')
    finally:
        server.shutdown()


if __name__ == '__main__':
    run()
