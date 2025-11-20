// replace any static "import" / top-level await usage for the Discord SDK
// with a safe dynamic import + fallback so a failed import doesn't stop the file.
(async () => {
    let discord = null;
    try {
        // dynamic import avoids bare-specifier parse errors in the browser
        const mod = await import('@discord/embedded-app-sdk').catch(() => null);
        const DiscordSDK = mod?.DiscordSDK ?? mod?.default ?? null;
        if (DiscordSDK) {
            discord = new DiscordSDK("1309612526580928515");
            await discord.ready();
        } else {
            console.warn('Discord SDK not available in this environment — continuing without it.');
        }
    } catch (err) {
        console.warn('Failed to load Discord SDK, using stub:', err);
        // minimal stub so downstream code that calls discord.activities.send won't blow up
        discord = {
            activities: { send: () => {} },
            ready: async () => {}
        };
        await discord.ready();
    }
    // expose for debugging if needed
    window.__discord = discord;
})();

// const BACKEND_BASE = `${location.protocol}//${location.hostname}:3000`; // bad for cloudflare tunneling

async function downloadVideo(link) {
  const res = await fetch("/download", {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'    
    },
    body: JSON.stringify({ link })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error('Download failed: ' + (txt || res.status));
  }
  const data = await res.json();
  // backend returns basename only
  return data.filename;
}

function parseLink(input) {
    if (!input) return null;
    const s = input.trim();

    // common query param: ?v=ID or &v=ID
    const vMatch = s.match(/[?&]v=([^&]+)/);
    if (vMatch) return vMatch[1];

    // youtu.be shortlink
    const shortMatch = s.match(/youtu\.be\/([^?&/]+)/i);
    if (shortMatch) return shortMatch[1];

    // pathname style (some embed or other urls), take last path segment if it looks like an id
    try {
        const url = new URL(s);
        const last = url.pathname.split('/').filter(Boolean).pop();
        if (last && /^[A-Za-z0-9_-]{11}$/.test(last)) return last;
    } catch (_) {
        // not a full URL, fall through
    }

    // raw id (typical 11-char YouTube id)
    const idMatch = s.match(/^([A-Za-z0-9_-]{11})$/);
    if (idMatch) return idMatch[1];

    return null;
}

async function loadVideoFromInput() {
  const raw = document.getElementById("fileInput")?.value || '';
  const idOrUrl = parseLink(raw) ? `https://www.youtube.com/watch?v=${parseLink(raw)}` : raw.trim();
  if (!idOrUrl) throw new Error('No URL or ID provided');

  const player = document.getElementById('player');
  const status = document.getElementById('status');
  if (status) {
    status.style.display = 'block';
    status.style.color = 'green';
    status.textContent = 'Loading video...';
  }

  try {
    const filename = await downloadVideo(idOrUrl); // basename from backend
    console.log('Downloaded file (basename):', filename);

    // update UI/title with basename only (match index.html id)
    const titleEl = document.getElementById('video-title');
    if (titleEl) titleEl.textContent = filename.replace(".mp4", "");

    // build safe URL for the file — encode only the filename part
    const fileUrl = '/videos/' + encodeURIComponent(filename);

    // optional HEAD check
    const head = await fetch(fileUrl, { method: 'HEAD' });
    if (!head.ok) throw new Error('File not served: ' + fileUrl);

    player.src = fileUrl;
    await player.play().catch(()=>{});
    if (status) status.style.display = 'none';
    return filename;
  } catch (err) {
    if (status) {
      status.style.display = 'block';
      status.style.color = 'red';
      status.textContent = 'Error: ' + (err && err.message ? err.message : String(err));
      setTimeout(() => {
        status.style.display = 'none';
        status.style.color = 'green';
      }, 5000);
    }
    console.error(err);
    throw err;
  }
}

async function handleKeyInput(e){
    if(e.key !== 'Enter') return;
    // prevent default form behavior if any
    e.preventDefault();
    await loadVideoFromInput().catch(()=>{});
}

window.handleKeyInput = handleKeyInput;
window.loadVideo = loadVideoFromInput;
window.parseLink = parseLink;

// Bind input and Enter without inline handlers, plus gesture focus fallback
window.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('fileInput');
  if (inp) {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // same action as Enter handler
        loadVideoFromInput().catch((err)=>{ console.error('loadVideo error', err); });
      }
    });
    try { inp.focus(); } catch (e) {}
  }

  // If the embed blocks keyboard until a user gesture, focus on first pointerdown
  function tryFocusInput() {
    const input = document.getElementById('fileInput');
    if (!input) return;
    if (document.activeElement !== input) {
      try { input.focus({preventScroll:true}); } catch(e){ input.focus(); }
    }
  }

  // one-off gesture listener: first pointerdown focuses the input
  const onFirstGesture = (ev) => {
    tryFocusInput();
    window.removeEventListener('pointerdown', onFirstGesture, true);
  };
  window.addEventListener('pointerdown', onFirstGesture, true);

  // expose a manual activator for SDK / console
  window.activateKeyboard = () => {
    tryFocusInput();
    // return true if focused
    return document.activeElement && document.activeElement.id === 'fileInput';
  };
});

// force focus on load
window.addEventListener('load', () => {
  const inp = document.getElementById('fileInput');
  if (inp && document.activeElement !== inp) try { inp.focus(); } catch(e) {}
});

// accept enter even if the text box isnt focused
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const active = (document.activeElement && document.activeElement.tagName) || '';
  // if user is editing an input/textarea let that element's handler manage it
  if (active === 'INPUT' || active === 'TEXTAREA' || active === 'SELECT') return;
  // otherwise, focus the input and trigger load
  const fileInput = document.getElementById('fileInput');
  if (!fileInput) return;
  e.preventDefault();
  fileInput.focus();
  loadVideoFromInput().catch(()=>{});
});