import { DiscordSDK } from "@discord/embedded-app-sdk";

const discord = new DiscordSDK("1309612526580928515");
await discord.ready();

// discord.activities.send("state_update", { filename: name })


async function downloadVideo(link) {
    const res = await fetch('http://localhost:3000/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error('Download failed: ' + txt);
    }
    const data = await res.json();
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

async function loadVideo() { // called externally in index.html
    const name = document.getElementById("fileInput").value.trim();
    if (!name) return;

    const player = document.getElementById("player");

    const file = await downloadVideo(parseLink(name));

    let videoTitle = document.getElementById("video-title");
    videoTitle.textContent = file.replace(".mp4", "");

    console.log('Downloaded file:', file);

    player.src = `./videos/${file}`; // corrected path, no extra quotes
    player.play().catch(() => {});
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