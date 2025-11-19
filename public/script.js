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

const BACKEND_BASE = `${location.protocol}//${location.hostname}:3000`;

async function downloadVideo(link) {
  const res = await fetch(`${BACKEND_BASE}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ link })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Download failed: ' + txt);
  }
  const data = await res.json();
  // backend now returns basename only
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

async function loadVideo() {
  const filename = await downloadVideo(parseLink(document.getElementById("fileInput").value.trim()));
  const fileUrl = '/videos/' + encodeURIComponent(filename);
  // optional HEAD check:
  const head = await fetch(fileUrl, { method: 'HEAD' });
  if (!head.ok) throw new Error('File not served: ' + fileUrl);
  const player = document.getElementById('player');
  player.src = fileUrl;
  await player.play().catch(()=>{});
}

async function handleKeyInput(e){
    if(e.key !== 'Enter') return;

    const status = document.getElementById('status');

    if(status) {
        status.style.color = 'green';
        status.textContent = 'Loading Video';
        status.style.display = 'block';
    }

    try{
        await loadVideo();
        if(status) status.style.display = 'none';
    } catch (err){
        if(status){
            status.style.color = 'red';
            status.textContent = 'Error: ' + (err && err.message ? err.message : String(err));
            setTimeout(() => {
                status.style.display = 'none';
                status.style.color = 'green';
            }, 5000);
        }
        console.error(err)
    }
}

window.handleKeyInput = handleKeyInput;
window.loadVideo = loadVideo;
window.parseLink = parseLink;