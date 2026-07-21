function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setPill(el, text, kind) {
  if (!el) return;
  el.textContent = text;
  el.className = 'pill pill-' + kind;
}

function appendLog(message) {
  const log = document.getElementById('activity-log');
  if (!log) return;
  const stamp = new Date().toLocaleTimeString();
  const next = `[${stamp}] ${message}`;
  log.textContent = log.textContent && !log.textContent.startsWith('Ready.')
    ? `${log.textContent}\n${next}`
    : next;
  log.scrollTop = log.scrollHeight;
}

function renderAccount(data) {
  const slot = document.getElementById('account-slot');
  if (!slot) return;

  if (data.connected && data.user) {
    slot.innerHTML = `
      <div class="account-chip">
        <img src="${escapeHtml(data.user.avatarUrl || '/assets/icon-192.png')}" alt="">
        <div>
          <strong>${escapeHtml(data.user.displayName || 'Connected user')}</strong>
          <small>Login Kit connected</small>
        </div>
      </div>`;
  } else {
    slot.innerHTML = `<a class="btn btn-connect" href="/auth/tiktok" id="connect-btn">Connect account</a>`;
  }
}

function renderScopes(scopes) {
  const list = document.getElementById('scope-list');
  if (!list) return;
  const items = (scopes && scopes.length ? scopes : ['user.info.basic', 'video.upload']);
  list.innerHTML = items.map((scope) => `<span class="scope">${escapeHtml(scope)}</span>`).join('');
}

function renderPanels(data) {
  const gate = document.getElementById('gate-panel');
  const studio = document.getElementById('studio-panel');
  const publishBtn = document.getElementById('publish-btn');
  const videoReady = document.getElementById('video-ready');
  const videoHint = document.getElementById('video-hint');
  const preview = document.getElementById('preview-video');

  if (data.connected) {
    gate.classList.add('hidden');
    studio.classList.remove('hidden');
    setPill(document.getElementById('login-kit-status'), 'Connected', 'ok');
  } else {
    gate.classList.remove('hidden');
    studio.classList.add('hidden');
    setPill(document.getElementById('login-kit-status'), 'Not connected', 'wait');
    setPill(document.getElementById('posting-status'), 'Idle', 'wait');
  }

  if (data.videoReady) {
    setPill(videoReady, 'Ready', 'ok');
    videoHint.textContent = 'Preview loaded from AutoPublisher studio.';
    if (preview) preview.src = '/media/demo.mp4?t=' + Date.now();
  } else {
    setPill(videoReady, 'Missing', 'off');
    videoHint.textContent = 'Demo video missing. Run npm run generate-video before recording.';
  }

  if (publishBtn) {
    publishBtn.disabled = !(data.connected && data.videoReady);
  }

  if (data.lastPublish) {
    const log = document.getElementById('activity-log');
    if (log && (!log.textContent || log.textContent.startsWith('Ready.'))) {
      log.textContent = data.lastPublish;
    }
    setPill(document.getElementById('result-pill'), 'Published', 'ok');
    setPill(document.getElementById('compose-status'), 'Published', 'ok');
    setPill(document.getElementById('posting-status'), 'Success', 'ok');
  }
}

async function fetchStatus() {
  const res = await fetch('/api/demo/status');
  if (!res.ok) throw new Error('Failed to load status');
  return res.json();
}

async function refreshStatus() {
  try {
    const data = await fetchStatus();
    renderAccount(data);
    renderScopes(data.scopes);
    renderPanels(data);
    return data;
  } catch (error) {
    appendLog('Status error: ' + error.message);
    return null;
  }
}

async function publishVideo() {
  const publishBtn = document.getElementById('publish-btn');
  const caption = document.getElementById('caption-input')?.value.trim() || '';
  const privacy = document.getElementById('privacy-input')?.value || 'SELF_ONLY';
  const disableComment = document.getElementById('disable-comment')?.checked ?? true;
  const disableDuet = document.getElementById('disable-duet')?.checked ?? true;
  const disableStitch = document.getElementById('disable-stitch')?.checked ?? true;

  if (!publishBtn) return;

  publishBtn.disabled = true;
  setPill(document.getElementById('compose-status'), 'Publishing', 'busy');
  setPill(document.getElementById('posting-status'), 'Uploading', 'busy');
  setPill(document.getElementById('result-pill'), 'In progress', 'busy');
  appendLog('Starting Content Posting API publish…');
  appendLog('Init upload → upload file → fetch status');

  try {
    const res = await fetch('/api/demo/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption,
        privacy,
        disableComment,
        disableDuet,
        disableStitch
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Publish failed');

    document.getElementById('activity-log').textContent = data.log || 'Published successfully.';
    document.getElementById('result-text').textContent =
      'Publish completed. Open the connected TikTok account on mobile and confirm the private video appears in the profile/inbox.';
    setPill(document.getElementById('compose-status'), 'Published', 'ok');
    setPill(document.getElementById('posting-status'), 'Success', 'ok');
    setPill(document.getElementById('result-pill'), 'Success', 'ok');
  } catch (error) {
    appendLog('Error: ' + error.message);
    setPill(document.getElementById('compose-status'), 'Failed', 'off');
    setPill(document.getElementById('posting-status'), 'Failed', 'off');
    setPill(document.getElementById('result-pill'), 'Failed', 'off');
    document.getElementById('result-text').textContent = error.message;
  } finally {
    await refreshStatus();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('publish-btn')?.addEventListener('click', publishVideo);
  document.getElementById('refresh-btn')?.addEventListener('click', refreshStatus);

  const params = new URLSearchParams(window.location.search);
  if (params.get('connected') === '1') {
    appendLog('Login Kit OAuth completed. Account connected.');
    window.history.replaceState({}, '', '/studio');
  }

  await refreshStatus();
});
