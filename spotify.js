// Spotify playback for a static site: Authorization Code + PKCE (no client secret,
// so nothing sensitive ships in the public repo). Starting playback needs Spotify Premium.
//
// SETUP (one time) — see README "Spotify music" for screenshots of each step:
//   1. developer.spotify.com → Dashboard → Create app.
//   2. Copy its Client ID into CLIENT_ID below.
//   3. In the app's settings, add this exact Redirect URI:
//        https://mmedabo.github.io/hyrox-training/
//      and, for local testing, http://127.0.0.1:8765/ (use 127.0.0.1, not localhost).
//   4. Save. That's it — no secret, no server.
const CLIENT_ID = 'PASTE_YOUR_SPOTIFY_CLIENT_ID_HERE';

const SCOPE = 'user-modify-playback-state user-read-playback-state';
const REDIRECT = location.origin + location.pathname;   // must match a Redirect URI set on the Spotify app, trailing slash and all
const AUTH = 'https://accounts.spotify.com/authorize';
const TOKEN = 'https://accounts.spotify.com/api/token';
const LS = 'spotify.tok';   // { access_token, refresh_token, expires_at }

export const isConfigured = () => CLIENT_ID && !CLIENT_ID.startsWith('PASTE_');
export const isConnected = () => isConfigured() && !!load();

// ---- PKCE helpers ---------------------------------------------------------
const rand = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const challenge = async v => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));

// ---- token store ----------------------------------------------------------
const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || null; } catch { return null; } };
const save = t => { try { localStorage.setItem(LS, JSON.stringify(t)); } catch {} };
const clear = () => { try { localStorage.removeItem(LS); } catch {} };
const store = j => save({ access_token: j.access_token, refresh_token: j.refresh_token || load()?.refresh_token, expires_at: Date.now() + (j.expires_in - 60) * 1000 });

export function disconnect() { clear(); }

// Send the user to Spotify to sign in. Returns to REDIRECT with ?code=…
export async function login() {
  if (!isConfigured()) throw new Error('Add your Spotify Client ID in spotify.js first — see README');
  const verifier = rand(48), state = rand(8);
  sessionStorage.setItem('spotify.pkce', verifier);
  sessionStorage.setItem('spotify.state', state);
  const p = new URLSearchParams({
    client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT,
    code_challenge_method: 'S256', code_challenge: await challenge(verifier),
    scope: SCOPE, state,
  });
  location.href = `${AUTH}?${p}`;
}

// Call once on boot. If we're back from Spotify (?code=…), exchange it for tokens and
// clean the URL. Returns true when it handled a redirect, false on a normal load.
export async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  const code = q.get('code'), state = q.get('state'), error = q.get('error');
  if (!code && !error) return false;
  const verifier = sessionStorage.getItem('spotify.pkce'), expect = sessionStorage.getItem('spotify.state');
  sessionStorage.removeItem('spotify.pkce'); sessionStorage.removeItem('spotify.state');
  history.replaceState(null, '', location.pathname);   // drop ?code / ?error from the address bar
  if (error) throw new Error('Spotify sign-in cancelled');
  if (!verifier || state !== expect) throw new Error('Spotify sign-in expired — try Connect again');
  const r = await fetch(TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier }),
  });
  if (!r.ok) throw new Error('Spotify sign-in failed');
  store(await r.json());
  return true;
}

// A valid access token, refreshing if the current one has expired.
async function token() {
  const t = load();
  if (!t) throw new Error('Not connected to Spotify');
  if (Date.now() < t.expires_at) return t.access_token;
  if (!t.refresh_token) { clear(); throw new Error('Spotify session expired — reconnect'); }
  const r = await fetch(TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: t.refresh_token }),
  });
  if (!r.ok) { clear(); throw new Error('Spotify session expired — reconnect'); }
  store(await r.json());
  return load().access_token;
}

// Start a playlist on the user's active Spotify device. Premium required.
// On no active device, throws an Error with .code === 'NO_DEVICE' so the UI can fall back.
export async function play(contextUri) {
  const at = await token();
  const r = await fetch('https://api.spotify.com/v1/me/player/play', {
    method: 'PUT', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ context_uri: contextUri }),
  });
  if (r.status === 204) return;
  if (r.status === 401) { clear(); throw new Error('Spotify session expired — reconnect'); }
  if (r.status === 403) throw new Error('Spotify Premium is needed to start playback');
  const noDevice = () => Object.assign(new Error('Open Spotify on a device first, then tap play'), { code: 'NO_DEVICE' });
  if (r.status === 404) throw noDevice();
  let msg = 'Spotify playback failed';
  try { const j = await r.json(); if (j?.error?.reason === 'NO_ACTIVE_DEVICE') throw noDevice(); if (j?.error?.message) msg = j.error.message; }
  catch (e) { if (e.code === 'NO_DEVICE') throw e; }
  throw new Error(msg);
}
