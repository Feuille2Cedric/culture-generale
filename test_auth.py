"""Real SDK auth UI tests with simulated endpoints; never sends real email."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys, threading, json, base64, time
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.test-tools'))
from playwright.sync_api import sync_playwright
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT.parent)))
threading.Thread(target=server.serve_forever,daemon=True).start()
def b64(v): return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
user={'id':'test-owner','email':'test@example.test','aud':'authenticated'}
jwt=b64({'alg':'HS256'})+'.'+b64({'sub':user['id'],'exp':int(time.time())+3600,'role':'authenticated'})+'.test'
session={'user':user,'access_token':jwt,'refresh_token':'fake-refresh','expires_in':3600,'token_type':'bearer'}
requests=[];quota=[False];password=['InitialPassword123!']
def handler(route):
    req=route.request;url=req.url;headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-expose-headers':'x-supabase-api-version','x-supabase-api-version':'2024-01-01'}
    if req.method=='OPTIONS': return route.fulfill(status=200,headers=headers)
    body=req.post_data_json if req.post_data else {};requests.append((url,body))
    if '/auth/v1/signup' in url:
        assert len(body['password'])>=8
        return route.fulfill(json={'user':user,'session':None},headers=headers)
    if '/auth/v1/token' in url:
        assert 'grant_type=password' in url
        if body['password']!=password[0]: return route.fulfill(status=400,json={'code':'invalid_credentials','msg':'Invalid login credentials'},headers=headers)
        return route.fulfill(json=session,headers=headers)
    if '/auth/v1/user' in url:
        if req.method=='PUT': password[0]=body['password']
        return route.fulfill(json=user,headers=headers)
    if '/auth/v1/recover' in url:
        if quota[0]: return route.fulfill(status=429,json={'code':'over_email_send_rate_limit','msg':'email rate limit exceeded'},headers=headers)
        return route.fulfill(json={},headers=headers)
    if '/auth/v1/logout' in url: return route.fulfill(status=204,headers=headers)
    if '/rpc/' in url: return route.fulfill(json={'revision':1},headers=headers)
    if '/rest/' in url: return route.fulfill(json=[],headers=headers)
    raise AssertionError(url)
try:
 with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
    for repo,var in [('culture-generale','curioSync'),('mes-apps','mesAppsSync')]:
        password[0]='InitialPassword123!';requests.clear();errors=[]
        ctx=browser.new_context(viewport={'width':390,'height':844});ctx.route('https://*.supabase.co/**',handler)
        p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
        base='http://127.0.0.1:%s/%s/'%(server.server_port,repo)
        p.goto(base);p.wait_for_function('window.'+var+'?.client');p.locator('#sync-account').click()
        p.locator('[data-auth-mode=signup]').click();p.locator('#sync-email').fill(user['email'])
        p.locator('#auth-password').fill(password[0]);p.locator('#auth-confirm').fill('Mismatch123')
        p.locator('#auth-submit').click();assert 'correspondent' in p.locator('#auth-message').inner_text()
        assert not any('/signup' in url for url,_ in requests)
        p.locator('#auth-confirm').fill(password[0]);p.locator('#auth-submit').click()
        p.wait_for_function("document.querySelector('#auth-message').textContent.includes('confirmer')")
        assert not p.evaluate('Boolean(window.'+var+'.user)')
        p.locator('[data-auth-mode=login]').click();p.locator('#auth-password').fill('WrongPassword')
        p.locator('#auth-submit').click();p.wait_for_function("document.querySelector('#auth-message').textContent.includes('incorrect')")
        p.locator('#auth-password').fill(password[0]);p.locator('#auth-submit').click()
        p.wait_for_function('window.'+var+'.user && !window.'+var+'.busy')
        assert p.locator('#auth-password').input_value()==''
        assert 'InitialPassword' not in p.evaluate('JSON.stringify(localStorage)')
        p.locator('#auth-security summary').click()
        p.locator('#auth-new-password').fill('ChangedPassword123!');p.locator('#auth-new-confirm').fill('ChangedPassword123!')
        p.locator('#auth-password-form button').click()
        p.wait_for_function("document.querySelector('#auth-message').textContent.includes('enregistr')")
        assert password[0]=='ChangedPassword123!'
        p.wait_for_function('!window.'+var+'.busy');p.locator('#sync-logout').click()
        p.wait_for_function('!window.'+var+'.user')
        # Ordinary password login uses no OTP or recovery email endpoint.
        before=len([u for u,_ in requests if '/signup' in u or '/recover' in u or '/otp' in u])
        p.locator('#auth-password').fill(password[0]);p.locator('#auth-submit').click()
        p.wait_for_function('window.'+var+'.user && !window.'+var+'.busy')
        assert before==len([u for u,_ in requests if '/signup' in u or '/recover' in u or '/otp' in u])
        p.locator('#sync-logout').click();p.wait_for_function('!window.'+var+'.user')
        p.locator('#auth-forgot').click();quota[0]=True;p.locator('#auth-submit').click()
        p.wait_for_function("document.querySelector('#auth-message').textContent.includes('limite')")
        quota[0]=False;p.locator('#auth-submit').click()
        p.wait_for_function("document.querySelector('#auth-message').textContent.includes('Si un compte')")
        # The actual recovery redirect is consumed by the SDK and opens password setup.
        p.goto('about:blank')
        p.goto(base+'#access_token='+jwt+'&refresh_token=fake-refresh&expires_in=3600&token_type=bearer&type=recovery')
        p.wait_for_function('window.'+var+'?.auth.recovery && window.'+var+'.user')
        assert p.locator('#auth-new-password').is_visible()
        p.locator('#auth-new-password').fill('RecoveredPassword123!');p.locator('#auth-new-confirm').fill('RecoveredPassword123!')
        p.locator('#auth-password-form button').click();p.wait_for_function('!window.'+var+'.auth.recovery')
        assert password[0]=='RecoveredPassword123!'
        assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        print('PASS '+repo+': signup, password login, invalid credentials, password change, logout/relogin without email, quota error, recovery redirect, no password persistence, mobile')
        ctx.close()
    browser.close()
finally: server.shutdown()
