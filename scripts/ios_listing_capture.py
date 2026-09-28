"""Capture real native UI with fictional data, without changing rendered content.

Used only by the disposable simulator screenshot workflow. Every AI result comes
from the normal app flow and production provider, never a screenshot mock.
"""
import base64
import json
from pathlib import Path
import subprocess
import time


def capture_listing(device, container, folder):
    documents = container / 'Documents'
    sequence = 0
    helpers = """
      const text = document.body.innerText;
      const button = label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label);
      const heading = label => [...document.querySelectorAll('h1,h2,h3,p')].find(e => e.textContent.trim() === label);
      const enter = (input, value) => {
        const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', {bubbles:true}));
        input.dispatchEvent(new Event('change', {bubbles:true}));
      };
    """

    def command(code, label, timeout=180):
        nonlocal sequence
        sequence += 1
        identifier = str(sequence)
        payload = {'id': identifier, 'script': '(() => {' + helpers + code + '})()'}
        pending = documents / 'listing-command.pending'
        pending.write_text(json.dumps(payload))
        pending.replace(documents / 'listing-command.json')
        deadline = time.monotonic() + timeout
        last = None
        while time.monotonic() < deadline:
            try:
                result = json.loads((documents / 'listing-status.json').read_text())
            except (FileNotFoundError, json.JSONDecodeError):
                time.sleep(2)
                continue
            if result.get('id') != identifier:
                time.sleep(2)
                continue
            status = result.get('status', '')
            if status == 'READY':
                print('Ready: ' + label, flush=True)
                time.sleep(4)
                return
            if status != last:
                print(label + ': ' + status[:500], flush=True)
                last = status
            if status.startswith('ERROR:'):
                break
            time.sleep(2)
        screenshot('failed-' + label)
        raise RuntimeError('Native screenshot step failed: ' + label + ': ' + str(last))

    def screenshot(name):
        subprocess.run(['xcrun', 'simctl', 'io', device, 'screenshot', str(folder / (name + '.png'))], check=True, timeout=30)

    def navigate(path, ready_text):
        command('''
          if (location.pathname !== PATH) { location.assign(PATH); return 'Opening screen'; }
          if (!text.includes(EXPECTED)) return 'Waiting for screen';
          window.scrollTo(0,0); return 'READY';
        '''.replace('PATH', json.dumps(path)).replace('EXPECTED', json.dumps(ready_text)), path.strip('/'))

    command("window.scrollTo(0,0); return 'READY';", 'dashboard')
    screenshot('04-dashboard')

    navigate('/food-log', 'Log a meal')
    meal = base64.b64encode(Path('scripts/fixtures/listing-meal.jpg').read_bytes()).decode()
    command('''
      if (text.includes('AI estimate ready.')) {
        const result = document.querySelector('form.ascend-food-result');
        if (!result) return 'Waiting for meal result';
        result.scrollIntoView({block:'start'});
        return 'READY';
      }
      if (text.includes("couldn't estimate") || text.includes('AI data sharing is off')) return 'ERROR: ' + text.slice(-1800);
      if (!window.__listingFoodSubmitted) {
        const input = document.querySelector('input[type="file"][accept="image/*"]');
        if (!input) return 'Waiting for file control';
        const bytes = Uint8Array.from(atob(MEAL), c => c.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], 'chicken-rice-bowl.jpg', {type:'image/jpeg'}));
        input.files = transfer.files;
        window.__listingFoodSubmitted = true;
        input.dispatchEvent(new Event('change', {bubbles:true}));
      }
      return 'Waiting for real meal estimate: ' + text.slice(-400);
    '''.replace('MEAL', json.dumps(meal)), 'food-estimate')
    screenshot('01-food-estimate')
    command("const save = button('Save meal'); if (save && !save.disabled) {save.click(); return 'Saving';} if (text.includes('Meal saved')) return 'READY'; return 'Waiting for saved meal';", 'save-meal')
    screenshot('07-meal-saved')

    navigate('/coach', 'Quick Coach Actions')
    command('''
      const result = [...document.querySelectorAll('section')].find(e => e.innerText.includes("Today's workout") && e.innerText.includes('Warm'));
      if (result) { result.scrollIntoView({block:'start'}); return 'READY'; }
      if (text.includes('Where are you training?')) { button('Home')?.click(); return 'Choosing home'; }
      if (text.includes('How much time do you have?')) { button('20 minutes')?.click(); return 'Choosing 20 minutes'; }
      if (text.includes("Today's goal?")) { button('General Fitness')?.click(); return 'Choosing general fitness'; }
      if (text.includes('Equipment available?')) { button('Bodyweight')?.click(); return 'Choosing bodyweight'; }
      if (text.includes('Building today')) return 'Waiting for real workout';
      if (!window.__listingWorkoutStarted) {
        const start = button("Generate Today's Workout") || button("Open Today's Workout");
        if (start && !start.disabled) { window.__listingWorkoutStarted = true; start.click(); }
      }
      return 'Waiting for planner: ' + text.slice(-600);
    ''', 'workout')
    screenshot('02-workout')

    # Reopening hides the workout panel without replacing conversation content.
    navigate('/dashboard', 'essentials')
    navigate('/coach', 'Quick Coach Actions')
    command('''
      const input = document.querySelector('input[placeholder="Ask Coach Zoe"]');
      const conversation = document.querySelector('section[aria-label="Conversation"]');
      if (!input || !conversation) return 'Waiting for conversation';
      if (!window.__listingChatSent) {
        const prompt = 'What is one easy way to add protein to breakfast? Keep it to two short sentences.';
        if (input.value !== prompt) { enter(input,prompt); return 'Entering question'; }
        const send = document.querySelector('button[aria-label="Send message"]');
        if (send && !send.disabled) {window.__listingChatSent=true; send.click();}
        return 'Sending question';
      }
      if (text.includes('Coach is thinking...')) return 'Waiting for real Zoe reply';
      if (conversation.children.length < 3) return 'Waiting for reply';
      input.blur(); conversation.scrollIntoView({block:'start'}); return 'READY';
    ''', 'zoe-chat')
    screenshot('03-zoe')

    navigate('/journey', 'Journey')
    screenshot('05-journey')
    navigate('/water-log', 'Water')
    screenshot('06-water')
    navigate('/food-log', 'Log a meal')
    command("const history = button('Meal History'); if (history) history.click(); if (text.includes('Meal history filters')) {window.scrollTo(0,0); return 'READY';} return 'Opening history';", 'food-history')
    screenshot('08-food-history')
    print('Native listing gallery complete. All values are fictional demonstration records.', flush=True)
