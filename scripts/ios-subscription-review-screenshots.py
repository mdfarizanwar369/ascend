"""Capture subscription services with existing fictional review accounts.

These are simulator UI screenshots, not evidence of a physical-device purchase.
The login helper uses form controls and never changes app content or StoreKit.

Only PNGs are exported. Passwords, auth tokens and Maestro debug logs stay in
the temporary runner directory, never in the public screenshot artifact.
"""
import json
import os
import pathlib
import plistlib
import secrets
import time
import subprocess
import urllib.request
import urllib.error

temp = pathlib.Path(os.environ['RUNNER_TEMP'])
output = temp / 'store-screenshots'
output.mkdir(exist_ok=True)
config = plistlib.loads(pathlib.Path('ios/App/App/GoogleService-Info.plist').read_bytes())
assert config['PROJECT_ID'] == 'ascend-b2850'
# Existing fictional review users only; no customer data is used.
account = json.loads(os.environ['IOS_SUBSCRIPTION_REVIEW_ACCOUNTS'])[os.environ['CAPTURE_PLAN']]
email, password = account['email'], account['password']
print('::add-mask::' + password, flush=True)
print('Using fictional review account for ' + os.environ['CAPTURE_PLAN'], flush=True)

def run(*args):
    print('Simulator command: ' + ' '.join(args), flush=True)
    return subprocess.check_output(args, text=True, timeout=240).strip()

runtimes = json.loads(run('xcrun', 'simctl', 'list', 'runtimes', '-j'))['runtimes']
runtime = max((r for r in runtimes if r.get('isAvailable') and r['name'].startswith('iOS ')),
              key=lambda r: tuple(int(n) for n in r['version'].split('.')))['identifier']
print('Selected runtime: ' + runtime, flush=True)
types = json.loads(run('xcrun', 'simctl', 'list', 'devicetypes', '-j'))['devicetypes']
app = temp / 'ios-derived/Build/Products/Debug-iphonesimulator/App.app'
# These credentials and the helper exist only in the disposable simulator app.
# Only screenshot PNGs are exported by the workflow.
login_script = '''(() => {
  const credentials = CREDENTIALS;
  const target = TARGET;
  const readyText = target === '/coach' ? /Coach Zoe/ : /All Clients/;
  if (location.pathname === target && readyText.test(document.body.innerText)) {
    window.scrollTo(0, 0);
    return 'READY';
  }
  if ((location.pathname === '/dashboard' || location.pathname === '/trainer') && location.pathname !== target) {
    location.assign(target);
    return 'Opening review feature';
  }
  const toggle = document.getElementById('ascend-auth-toggle');
  if (toggle && /Already have an account/.test(toggle.textContent)) {
    toggle.click();
    return 'Opening login';
  }
  const button = document.getElementById('ascend-auth-action');
  if (!button || !/Log in/.test(button.textContent)) return 'Waiting for login form';
  const email = document.querySelector('input[type="email"]');
  const password = document.querySelector('input[type="password"]');
  if (!email || !password) return 'Waiting for form fields';
  const enter = (input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
  };
  if (email.value !== credentials.email) { enter(email, credentials.email); return 'Entering email'; }
  if (password.value !== credentials.password) { enter(password, credentials.password); return 'Entering password'; }
  if (!button.disabled && (!window.__captureLastClick || Date.now() - window.__captureLastClick > 15000)) {
    window.__captureLastClick = Date.now();
    button.click();
  }
  return 'Waiting for dashboard';
})()'''.replace('CREDENTIALS', json.dumps({'email': email, 'password': password})).replace('TARGET', json.dumps('/coach' if os.environ['CAPTURE_PLAN'] == 'premium' else '/trainer'))
(app / 'capture-login.js').write_text(login_script)
failures = []
for label, prefix in [('iphone', 'iPhone 14 Plus'), ('ipad', 'iPad Pro 13-inch (M4)')]:
    if label != os.environ['SCREENSHOT_DEVICE']:
        continue
    device_type = next(t['identifier'] for t in types if t['name'].startswith(prefix))
    device = run('xcrun', 'simctl', 'create', 'Ascend Store ' + label, device_type, runtime)
    folder = output / label
    folder.mkdir(exist_ok=True)
    try:
        run('xcrun', 'simctl', 'boot', device)
        subprocess.run(['xcrun', 'simctl', 'bootstatus', device, '-b'], check=True, timeout=600)
        run('xcrun', 'simctl', 'status_bar', device, 'override', '--time', '9:41',
            '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3',
            '--batteryState', 'charged', '--batteryLevel', '100')
        run('xcrun', 'simctl', 'install', device, str(app))
        container = pathlib.Path(run('xcrun', 'simctl', 'get_app_container', device, 'fit.getascend.app', 'data'))
        ready = container / 'Documents/capture-ready.txt'
        status_file = container / 'Documents/capture-status.txt'
        for attempt in range(2):
            try:
                subprocess.run(['xcrun', 'simctl', 'launch', device, 'fit.getascend.app'], check=False, timeout=90)
            except subprocess.TimeoutExpired:
                print('Launch command is slow; checking app readiness.', flush=True)
            deadline = time.monotonic() + 180
            last_status = None
            while time.monotonic() < deadline and not ready.exists():
                status = status_file.read_text() if status_file.exists() else 'Waiting for app startup'
                if status != last_status:
                    print(status, flush=True)
                    last_status = status
                time.sleep(3)
            if ready.exists():
                break
        if ready.exists():
            run('xcrun', 'simctl', 'io', device, 'screenshot', str(folder / (os.environ['CAPTURE_PLAN'] + '-service.png')))
        else:
            failures.append(label)
            run('xcrun', 'simctl', 'io', device, 'screenshot', str(folder / 'capture-failed.png'))
    except subprocess.TimeoutExpired:
        failures.append(label)
        print('Simulator command timed out for ' + label, flush=True)
        subprocess.run(['xcrun', 'simctl', 'io', device, 'screenshot',
                        str(folder / 'capture-failed.png')], check=False, timeout=30)
    finally:
        try:
            subprocess.run(['xcrun', 'simctl', 'shutdown', device], check=False, timeout=30)
        except subprocess.TimeoutExpired:
            print('Runner cleanup will stop the simulator.', flush=True)
if failures:
    raise SystemExit('Capture needs adjustment on: ' + ', '.join(failures))
