// Each workout section gets an official Spotify playlist that fits its energy.
// Playlist IDs are Spotify-owned editorial playlists. They're stable, but you can
// swap any of them for your own: open a playlist in Spotify → Share → Copy link,
// and paste the id (the bit after /playlist/) below. See README "Spotify music".
const P = {
  beast:  { name: 'Beast Mode',     id: '37i9dQZF1DX76Wlfdnj7AP' },  // heavy lifting energy
  power:  { name: 'Power Workout',  id: '37i9dQZF1DX70RN3TfWWJh' },  // arms + core pump
  cardio: { name: 'Cardio',         id: '37i9dQZF1DWSJHnPb1f0X3' },  // high-BPM warm-up
  calm:   { name: 'Peaceful Piano', id: '37i9dQZF1DX4sWSpwq3LiO' },  // recovery, rehab, stretch
};

// Section name (lower-cased) → tier. First match wins, so order matters:
// "Legs · knee safe" must hit the strength rule before the knee/rehab rule.
const RULES = [
  [/cardio/,                  'cardio'],
  [/light|stretch|rehab|recover/, 'calm'],
  [/chest|back|push|pull|leg/, 'beast'],
  [/knee/,                    'calm'],
  [/arm|core/,                'power'],
];

/** The playlist for a section: { name, uri (for playback), url (to open in Spotify) }. */
export function playlistFor(sectionName) {
  const s = String(sectionName || '').toLowerCase();
  const hit = RULES.find(([re]) => re.test(s));
  const p = P[hit ? hit[1] : 'beast'];   // default: lift hard
  return { name: p.name, uri: `spotify:playlist:${p.id}`, url: `https://open.spotify.com/playlist/${p.id}` };
}
