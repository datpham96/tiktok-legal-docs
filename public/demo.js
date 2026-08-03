/* AutoPublisher studio — TikTok Content Posting UX per
   https://developers.tiktok.com/doc/content-sharing-guidelines */

var creatorInfo = null;
var statusData = null;
var videoDurationSec = null;
var publishing = false;
var progressTimer = null;
var lastPublishPayload = null;

var MUSIC_URL = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
var BC_POLICY_URL = 'https://www.tiktok.com/legal/page/global/bc-policy/en';

var PRIVACY_LABELS = {
  PUBLIC_TO_EVERYONE: 'Everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends',
  FOLLOWER_OF_CREATOR: 'Followers',
  SELF_ONLY: 'Only me'
};

function $(id) {
  return document.getElementById(id);
}

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
  var log = $('activity-log');
  if (!log) return;
  var stamp = new Date().toLocaleTimeString();
  var next = '[' + stamp + '] ' + message;
  log.textContent = log.textContent && !log.textContent.startsWith('Ready.')
    ? log.textContent + '\n' + next
    : next;
  log.scrollTop = log.scrollHeight;
}

/* Keep the activity trail end-user friendly: never surface raw API lines
   (old stored logs may still contain them). */
function sanitizeLog(text) {
  return String(text)
    .split('\n')
    .filter(function (line) {
      return !/(POST |PUT |\/v2\/|->|Scope used)/.test(line);
    })
    .join('\n');
}

/* ---------------- Status pills ---------------- */

function statusToPills(status) {
  switch (status) {
    case 'PUBLISH_COMPLETE':
      return { result: ['Published', 'ok'], compose: ['Published', 'ok'], posting: ['Success', 'ok'] };
    case 'SEND_TO_USER_INBOX':
      return {
        result: ['Sent to TikTok inbox', 'ok'],
        compose: ['Sent to inbox', 'ok'],
        posting: ['Sent to inbox', 'ok']
      };
    case 'FAILED':
      return { result: ['Failed', 'off'], compose: ['Failed', 'off'], posting: ['Failed', 'off'] };
    default:
      return {
        result: ['Processing', 'busy'],
        compose: ['Processing', 'busy'],
        posting: ['Processing', 'busy']
      };
  }
}

function applyStatusPills(status) {
  var pills = statusToPills(status);
  setPill($('result-pill'), pills.result[0], pills.result[1]);
  setPill($('compose-status'), pills.compose[0], pills.compose[1]);
  setPill($('posting-status'), pills.posting[0], pills.posting[1]);
}

/* ---------------- Account / header ---------------- */

function renderAccount(data) {
  var slot = $('account-slot');
  if (!slot) return;

  if (data.connected && data.user) {
    slot.innerHTML =
      '<div class="account-chip">' +
      '<img src="' + escapeHtml(data.user.avatarUrl || '/assets/icon-192.png') + '" alt="">' +
      '<div><strong>' + escapeHtml(data.user.displayName || 'Connected user') + '</strong>' +
      '<small>TikTok connected</small></div>' +
      '<button class="chip-action" type="button" id="disconnect-btn">Disconnect</button>' +
      '</div>';
    var btn = $('disconnect-btn');
    if (btn) btn.addEventListener('click', disconnectAccount);
  } else {
    slot.innerHTML = '<a class="btn btn-connect" href="/auth/tiktok" id="connect-btn">Connect account</a>';
  }
}

var SCOPE_LABELS = {
  'user.info.basic': 'Profile info',
  'video.upload': 'Upload video',
  'video.publish': 'Post video'
};

function renderScopes(scopes) {
  var list = $('scope-list');
  if (!list) return;
  var items = scopes && scopes.length ? scopes : ['user.info.basic', 'video.upload'];
  list.innerHTML = items
    .map(function (scope) {
      var label = SCOPE_LABELS[scope] || scope;
      return '<span class="scope" title="' + escapeHtml(scope) + '">' + escapeHtml(label) + '</span>';
    })
    .join('');
}

/* ---------------- Creator info (required UX) ---------------- */

async function loadCreatorInfo() {
  var loading = $('creator-loading');
  var card = $('creator-card');
  var error = $('creator-error');

  loading.classList.remove('hidden');
  card.classList.add('hidden');
  error.classList.add('hidden');
  creatorInfo = null;
  updatePublishState();

  try {
    var res = await fetch('/api/demo/creator-info');
    if (!res.ok) throw new Error('unavailable');
    creatorInfo = await res.json();

    $('creator-avatar').src = creatorInfo.creatorAvatarUrl || '/assets/icon-192.png';
    $('creator-nickname').textContent = creatorInfo.creatorNickname || 'TikTok creator';
    $('creator-username').textContent = creatorInfo.creatorUsername
      ? '@' + creatorInfo.creatorUsername
      : '';

    loading.classList.add('hidden');
    card.classList.remove('hidden');

    renderPrivacyOptions();
    renderInteractionToggles();
    checkVideoDuration();
  } catch (e) {
    loading.classList.add('hidden');
    error.classList.remove('hidden');
  }
  updatePublishState();
}

/* Privacy: options come from creator info; the user must pick manually —
   no default selection. */
function renderPrivacyOptions() {
  var select = $('privacy-input');
  if (!select || !creatorInfo) return;

  var current = select.value;
  var options = creatorInfo.privacyLevelOptions && creatorInfo.privacyLevelOptions.length
    ? creatorInfo.privacyLevelOptions
    : Object.keys(PRIVACY_LABELS);

  // Until the app passes TikTok review, only "Only me" posts are accepted.
  var pending = statusData && statusData.appAudited === false;

  var html = '<option value="" disabled>Select who can view this video</option>';
  options.forEach(function (value) {
    var lock = pending && value !== 'SELF_ONLY';
    html +=
      '<option value="' + escapeHtml(value) + '"' +
      (lock ? ' disabled title="Available once TikTok approves this app"' : '') +
      '>' + escapeHtml(PRIVACY_LABELS[value] || value) + '</option>';
  });
  select.innerHTML = html;
  select.value = options.indexOf(current) >= 0 ? current : '';

  var note = $('privacy-note');
  if (note) {
    if (pending) {
      note.textContent =
        'While this app is pending TikTok review, TikTok only accepts posts with "Only me" ' +
        'visibility, and your TikTok account must be set to private.';
      note.classList.remove('hidden');
    } else {
      note.classList.add('hidden');
    }
  }

  applyBrandedContentPrivacyRules();
}

/* Interaction settings: all off by default; grey out any the creator has
   disabled in the TikTok app. */
function renderInteractionToggles() {
  if (!creatorInfo) return;
  var notes = [];

  configureToggle('allow-comment', creatorInfo.commentDisabled);
  configureToggle('allow-duet', creatorInfo.duetDisabled);
  configureToggle('allow-stitch', creatorInfo.stitchDisabled);

  if (creatorInfo.commentDisabled) notes.push('Comments are turned off in your TikTok settings.');
  if (creatorInfo.duetDisabled) notes.push('Duet is turned off in your TikTok settings.');
  if (creatorInfo.stitchDisabled) notes.push('Stitch is turned off in your TikTok settings.');

  var note = $('interaction-note');
  if (notes.length) {
    note.textContent = notes.join(' ');
    note.classList.remove('hidden');
  } else {
    note.classList.add('hidden');
  }
}

function configureToggle(id, disabled) {
  var input = $(id);
  var label = $(id + '-label');
  if (!input) return;
  input.disabled = Boolean(disabled);
  if (disabled) {
    input.checked = false;
    if (label) label.classList.add('toggle-disabled');
  } else if (label) {
    label.classList.remove('toggle-disabled');
  }
}

/* ---------------- Video preview ---------------- */

function formatDuration(sec) {
  if (!isFinite(sec)) return '—';
  var m = Math.floor(sec / 60);
  var s = Math.round(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function formatSize(bytes) {
  if (!bytes) return '—';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderVideoMeta() {
  if (!statusData) return;
  $('video-filename').textContent = statusData.videoFileName || '—';
  $('video-size').textContent = formatSize(statusData.videoSizeBytes);
  $('video-duration').textContent = videoDurationSec ? formatDuration(videoDurationSec) : '—';
}

function checkVideoDuration() {
  var warning = $('video-duration-warning');
  if (!warning) return;
  if (
    creatorInfo &&
    creatorInfo.maxVideoPostDurationSec > 0 &&
    videoDurationSec &&
    videoDurationSec > creatorInfo.maxVideoPostDurationSec
  ) {
    warning.textContent =
      'This video is longer than the ' +
      creatorInfo.maxVideoPostDurationSec +
      's allowed for your TikTok account. Please choose a shorter video.';
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }
  updatePublishState();
}

function videoTooLong() {
  return Boolean(
    creatorInfo &&
    creatorInfo.maxVideoPostDurationSec > 0 &&
    videoDurationSec &&
    videoDurationSec > creatorInfo.maxVideoPostDurationSec
  );
}

async function replaceVideo(file) {
  if (!file) return;
  appendLog('Uploading new video "' + file.name + '"…');
  var btn = $('replace-video-btn');
  if (btn) btn.disabled = true;

  try {
    var res = await fetch('/api/demo/video', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.message || 'Could not replace the video.');
    appendLog('Video replaced.');
    await refreshStatus();
    var preview = $('preview-video');
    if (preview) preview.src = '/media/demo.mp4?t=' + Date.now();
  } catch (error) {
    appendLog('Video upload failed: ' + error.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ---------------- Commercial content (required UX) ---------------- */

function commercialState() {
  return {
    enabled: Boolean($('commercial-toggle') && $('commercial-toggle').checked),
    yourBrand: Boolean($('your-brand') && $('your-brand').checked),
    brandedContent: Boolean($('branded-content') && $('branded-content').checked)
  };
}

function renderCommercialUI() {
  var state = commercialState();
  var options = $('commercial-options');
  var labelNote = $('commercial-label-note');
  var warning = $('commercial-warning');

  options.classList.toggle('hidden', !state.enabled);

  if (state.enabled && (state.yourBrand || state.brandedContent)) {
    labelNote.textContent = state.brandedContent
      ? "Your video will be labeled as 'Paid partnership'."
      : "Your video will be labeled as 'Promotional content'.";
    labelNote.classList.remove('hidden');
  } else {
    labelNote.classList.add('hidden');
  }

  if (state.enabled && !state.yourBrand && !state.brandedContent) {
    warning.textContent =
      'You need to indicate if your content promotes yourself, a third party, or both.';
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }

  renderDeclaration();
  applyBrandedContentPrivacyRules();
  updatePublishState();
}

/* Branded content ↔ privacy interplay per TikTok guideline. */
function applyBrandedContentPrivacyRules() {
  var state = commercialState();
  var select = $('privacy-input');
  var brandedInput = $('branded-content');
  var brandedOption = $('branded-content-option');
  if (!select) return;

  var privateSelected = select.value === 'SELF_ONLY';

  // "Only me" cannot be chosen while Branded content is on.
  for (var i = 0; i < select.options.length; i++) {
    var opt = select.options[i];
    if (opt.value === 'SELF_ONLY') {
      var lock = state.enabled && state.brandedContent;
      opt.disabled = lock;
      opt.title = lock ? 'Branded content visibility cannot be set to private' : '';
    }
  }

  // Branded content cannot be turned on while "Only me" is selected.
  if (brandedInput) {
    var disable = privateSelected;
    brandedInput.disabled = disable;
    if (disable) brandedInput.checked = false;
    if (brandedOption) {
      brandedOption.classList.toggle('toggle-disabled', disable);
      brandedOption.title = disable ? "Visibility for branded content can't be private" : '';
    }
  }
}

/* Declaration wording + links depend on the commercial selection. */
function renderDeclaration() {
  var state = commercialState();
  var el = $('declaration');
  if (!el) return;

  var music = '<a href="' + MUSIC_URL + '" target="_blank" rel="noopener">Music Usage Confirmation</a>';
  var bc = '<a href="' + BC_POLICY_URL + '" target="_blank" rel="noopener">Branded Content Policy</a>';

  el.innerHTML = state.enabled && state.brandedContent
    ? "By posting, you agree to TikTok's " + bc + ' and ' + music + '.'
    : "By posting, you agree to TikTok's " + music + '.';
}

/* ---------------- Publish enablement ---------------- */

function updatePublishState() {
  var btn = $('publish-btn');
  var hint = $('publish-hint');
  if (!btn) return;

  var caption = ($('caption-input') ? $('caption-input').value : '').trim();
  var privacy = $('privacy-input') ? $('privacy-input').value : '';
  var state = commercialState();

  var reason = '';
  if (publishing) {
    reason = 'Publishing in progress…';
  } else if (!statusData || !statusData.connected) {
    reason = 'Connect your TikTok account to publish.';
  } else if (!creatorInfo) {
    reason = 'Waiting for your TikTok account details…';
  } else if (!statusData.videoReady) {
    reason = 'Add a video before publishing.';
  } else if (videoTooLong()) {
    reason = 'This video is too long for your TikTok account.';
  } else if (!caption) {
    reason = 'Write a caption to continue.';
  } else if (!privacy) {
    reason = 'Select who can view this video to continue.';
  } else if (state.enabled && !state.yourBrand && !state.brandedContent) {
    reason = 'You need to indicate if your content promotes yourself, a third party, or both.';
  }

  btn.disabled = Boolean(reason);
  btn.title = reason;
  if (hint) {
    hint.textContent = reason;
    hint.classList.toggle('hidden', !reason);
  }
}

function updateCaptionCounter() {
  var input = $('caption-input');
  var counter = $('caption-count');
  if (input && counter) counter.textContent = String(input.value.length);
}

/* ---------------- Panels / status ---------------- */

function renderPanels(data) {
  var gate = $('gate-panel');
  var studio = $('studio-panel');
  var videoReady = $('video-ready');
  var videoHint = $('video-hint');
  var preview = $('preview-video');

  if (data.connected) {
    gate.classList.add('hidden');
    studio.classList.remove('hidden');
    setPill($('login-kit-status'), 'Connected', 'ok');
  } else {
    gate.classList.remove('hidden');
    studio.classList.add('hidden');
    setPill($('login-kit-status'), 'Not connected', 'wait');
    setPill($('posting-status'), 'Idle', 'wait');
  }

  if (data.videoReady) {
    setPill(videoReady, 'Ready', 'ok');
    videoHint.textContent = 'This is the video that will be posted.';
    if (preview && !preview.src.includes('/media/demo.mp4')) {
      preview.src = '/media/demo.mp4?t=' + Date.now();
    }
  } else {
    setPill(videoReady, 'Missing', 'off');
    videoHint.textContent = 'No video yet. Use "Replace video" to add one.';
  }

  renderVideoMeta();

  if (data.lastPublish) {
    var log = $('activity-log');
    if (log && (!log.textContent || log.textContent.startsWith('Ready.'))) {
      log.textContent = sanitizeLog(data.lastPublish);
    }
    applyStatusPills(data.lastPublishStatus || 'UNKNOWN');
  }

  updatePublishState();
}

async function fetchStatus() {
  var res = await fetch('/api/demo/status');
  if (!res.ok) throw new Error('Failed to load status');
  return res.json();
}

async function refreshStatus() {
  try {
    statusData = await fetchStatus();
    renderAccount(statusData);
    renderScopes(statusData.scopes);
    renderPanels(statusData);
    return statusData;
  } catch (error) {
    appendLog('Could not refresh: ' + error.message);
    return null;
  }
}

async function disconnectAccount() {
  try {
    appendLog('Disconnecting TikTok account…');
    var res = await fetch('/api/demo/logout', { method: 'POST' });
    if (!res.ok) {
      var data = await res.json().catch(function () { return {}; });
      throw new Error(data.message || 'Disconnect failed');
    }
    $('activity-log').textContent = 'TikTok account disconnected.';
    setPill($('result-pill'), 'Waiting', 'wait');
    setPill($('compose-status'), 'Draft', 'wait');
    setPill($('posting-status'), 'Idle', 'wait');
    creatorInfo = null;
    await refreshStatus();
  } catch (error) {
    appendLog('Disconnect error: ' + error.message);
  }
}

/* ---------------- Progress steps ---------------- */

var STEP_ORDER = ['uploading', 'publishing', 'processing', 'done'];

function setProgressStage(stage) {
  var idx = STEP_ORDER.indexOf(stage);
  STEP_ORDER.forEach(function (name, i) {
    var el = $('step-' + name);
    if (!el) return;
    el.classList.remove('step-active', 'step-complete');
    if (idx >= 0 && i < idx) el.classList.add('step-complete');
    if (i === idx) el.classList.add('step-active');
  });
}

function completeAllSteps() {
  STEP_ORDER.forEach(function (name) {
    var el = $('step-' + name);
    if (!el) return;
    el.classList.remove('step-active');
    el.classList.add('step-complete');
  });
}

function startProgressPolling() {
  stopProgressPolling();
  progressTimer = setInterval(async function () {
    try {
      var res = await fetch('/api/demo/publish/progress');
      if (!res.ok) return;
      var p = await res.json();
      if (p.active && p.stage && p.stage !== 'idle') {
        setProgressStage(p.stage);
      }
    } catch (e) {
      /* polling is best-effort */
    }
  }, 1500);
}

function stopProgressPolling() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

/* ---------------- Publish ---------------- */

function showPanel(which) {
  $('result-panel').classList.toggle('hidden', which !== 'result');
  $('success-panel').classList.toggle('hidden', which !== 'success');
  $('error-panel').classList.toggle('hidden', which !== 'error');
}

function renderSuccess(data) {
  var isInbox = data.status === 'SEND_TO_USER_INBOX';
  var isComplete = data.status === 'PUBLISH_COMPLETE';

  $('success-title').textContent = isComplete
    ? '✔ Published'
    : isInbox
      ? '✔ Sent to TikTok inbox'
      : '⏳ Processing';
  $('success-publish-id').textContent = data.publishId || '—';
  $('success-time').textContent = data.publishedAt
    ? new Date(data.publishedAt).toLocaleString()
    : new Date().toLocaleString();
  $('success-privacy').textContent = data.privacy || '—';
  $('success-caption').textContent = data.caption || '—';
  $('success-inbox-note').classList.toggle('hidden', !isInbox);
  showPanel('success');
}

async function publishVideo() {
  if (publishing) return;

  var payload = {
    caption: ($('caption-input') ? $('caption-input').value : '').trim(),
    privacy: $('privacy-input') ? $('privacy-input').value : '',
    allowComment: Boolean($('allow-comment') && $('allow-comment').checked),
    allowDuet: Boolean($('allow-duet') && $('allow-duet').checked),
    allowStitch: Boolean($('allow-stitch') && $('allow-stitch').checked)
  };
  var state = commercialState();
  payload.commercialContent = state.enabled;
  payload.yourBrand = state.enabled && state.yourBrand;
  payload.brandedContent = state.enabled && state.brandedContent;
  payload.isAigc = Boolean($('aigc-toggle') && $('aigc-toggle').checked);
  lastPublishPayload = payload;

  publishing = true;
  updatePublishState();
  showPanel('result');
  $('progress-steps').classList.remove('hidden');
  setProgressStage('uploading');
  setPill($('compose-status'), 'Publishing', 'busy');
  setPill($('posting-status'), 'Uploading', 'busy');
  setPill($('result-pill'), 'In progress', 'busy');
  appendLog('Publishing to TikTok…');
  startProgressPolling();

  try {
    var res = await fetch('/api/demo/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    var data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Publish failed');

    stopProgressPolling();
    completeAllSteps();

    $('activity-log').textContent = sanitizeLog(data.log || 'Upload finished.');
    if (data.publishId) appendLog('Publish ID: ' + data.publishId);

    applyStatusPills(data.status || 'UNKNOWN');
    renderSuccess(data);
  } catch (error) {
    stopProgressPolling();
    $('progress-steps').classList.add('hidden');
    appendLog('Publish failed: ' + error.message);
    setPill($('compose-status'), 'Failed', 'off');
    setPill($('posting-status'), 'Failed', 'off');
    setPill($('result-pill'), 'Failed', 'off');
    $('error-message').textContent = error.message;
    showPanel('error');
  } finally {
    publishing = false;
    await refreshStatus();
    updatePublishState();
  }
}

function retryPublish() {
  showPanel('result');
  $('progress-steps').classList.add('hidden');
  if (lastPublishPayload) {
    publishVideo();
  }
}

/* ---------------- Boot ---------------- */

document.addEventListener('DOMContentLoaded', async function () {
  var publishBtn = $('publish-btn');
  if (publishBtn) publishBtn.addEventListener('click', publishVideo);
  var refreshBtn = $('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async function () {
      await refreshStatus();
      if (statusData && statusData.connected) await loadCreatorInfo();
    });
  }
  var retryBtn = $('error-retry-btn');
  if (retryBtn) retryBtn.addEventListener('click', retryPublish);
  var creatorRetry = $('creator-retry-btn');
  if (creatorRetry) creatorRetry.addEventListener('click', loadCreatorInfo);

  var captionInput = $('caption-input');
  if (captionInput) {
    captionInput.addEventListener('input', function () {
      updateCaptionCounter();
      updatePublishState();
    });
    updateCaptionCounter();
  }

  var privacySelect = $('privacy-input');
  if (privacySelect) {
    privacySelect.addEventListener('change', function () {
      applyBrandedContentPrivacyRules();
      renderCommercialUI();
      updatePublishState();
    });
  }

  ['commercial-toggle', 'your-brand', 'branded-content'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('change', renderCommercialUI);
  });

  ['allow-comment', 'allow-duet', 'allow-stitch', 'aigc-toggle'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('change', updatePublishState);
  });

  var replaceBtn = $('replace-video-btn');
  var fileInput = $('video-file-input');
  if (replaceBtn && fileInput) {
    replaceBtn.addEventListener('click', function () {
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) {
        replaceVideo(fileInput.files[0]);
        fileInput.value = '';
      }
    });
  }

  var preview = $('preview-video');
  if (preview) {
    var captureDuration = function () {
      videoDurationSec = preview.duration;
      renderVideoMeta();
      checkVideoDuration();
    };
    preview.addEventListener('loadedmetadata', captureDuration);
    if (preview.readyState >= 1 && preview.duration) captureDuration();
  }

  var params = new URLSearchParams(window.location.search);
  if (params.get('connected') === '1') {
    appendLog('TikTok account connected.');
    window.history.replaceState({}, '', '/studio');
  }

  await refreshStatus();
  if (statusData && statusData.connected) {
    await loadCreatorInfo();
  }
  renderDeclaration();
  renderCommercialUI();
  updatePublishState();
});
