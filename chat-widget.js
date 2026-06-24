// web/chat-widget.js
// Floating "Ask my Resume" chat. Fetches responses from /api/chat.

(function () {
  const API = '/api/chat'; // SWA proxies /api/* to your Function App

  const fab = document.createElement('button');
  fab.id = 'cj-chat-fab';
  fab.title = 'Ask my resume';
  fab.setAttribute('aria-label', 'Open chat');
  fab.textContent = '💬';

  const panel = document.createElement('div');
  panel.id = 'cj-chat-panel';
  panel.innerHTML = `
    <div id="cj-chat-header">
      <span>Ask my Resume</span>
      <button id="cj-chat-close" aria-label="Close">×</button>
    </div>
    <div id="cj-chat-log" role="log" aria-live="polite"></div>
    <form id="cj-chat-form">
      <input id="cj-chat-input" type="text" maxlength="500" autocomplete="off"
             placeholder="e.g. What's Christian's Azure experience?" />
      <button id="cj-chat-send" type="submit">Send</button>
    </form>`;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const log = panel.querySelector('#cj-chat-log');
  const form = panel.querySelector('#cj-chat-form');
  const input = panel.querySelector('#cj-chat-input');
  const send = panel.querySelector('#cj-chat-send');

  fab.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      input.focus();
      if (!log.children.length) addMsg('bot', "Hi! Ask me anything about Christian's experience. Try \"What Azure work has he done?\"");
    }
  });
  panel.querySelector('#cj-chat-close').addEventListener('click', () => panel.classList.remove('open'));

  function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = `cj-msg ${role}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    addMsg('user', q);
    input.value = '';
    send.disabled = true;
    const botEl = addMsg('bot', '');
    botEl.classList.add('cj-typing');

    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      
      if (!res.ok) {
        botEl.classList.remove('cj-typing');
        botEl.textContent = res.status === 429
          ? 'Rate limit reached — try again in a minute.'
          : `Sorry, something went wrong (${res.status}).`;
        return;
      }

      // 🎯 THE FIX: Parse standard JSON payload directly instead of reading a stream loop
      const data = await res.json();
      botEl.classList.remove('cj-typing');
      
      if (data && data.answer) {
        botEl.textContent = data.answer;
        log.scrollTop = log.scrollHeight;
      } else {
        botEl.textContent = 'Sorry, received an unexpected response format.';
      }

    } catch (err) {
      botEl.classList.remove('cj-typing');
      botEl.textContent = 'Network error — please try again.';
    } finally {
      send.disabled = false;
      input.focus();
    }
  });
})();
