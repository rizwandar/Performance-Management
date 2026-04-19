const express = require('express');
const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/deezer/search?q=...
// General track/song search
// ---------------------------------------------------------------------------
router.get('/search', async (req, res) => {
  const query = (req.query.q || req.query.artist || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'q query parameter is required' });
  }

  try {
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=50`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.data || data.data.length === 0) return res.json([]);

    // Deduplicate by title + artist
    const seen = new Set();
    const tracks = [];
    for (const track of data.data) {
      const key = `${track.title}__${track.artist.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        tracks.push({
          deezer_id: String(track.id),
          title:     track.title,
          artist:    track.artist.name,
          artist_id: String(track.artist.id),
          album:     track.album.title,
        });
      }
    }

    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch from Deezer' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/deezer/artists?q=...
// Search for artists/bands by name, returns list of matching artists
// ---------------------------------------------------------------------------
router.get('/artists', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) return res.status(400).json({ error: 'q is required' });

  try {
    const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=20`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.data || data.data.length === 0) return res.json([]);

    const artists = data.data.map(a => ({
      id:           String(a.id),
      name:         a.name,
      picture_small: a.picture_small,
      nb_album:     a.nb_album,
    }));

    res.json(artists);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch artists from Deezer' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/deezer/artist/:id/tracks
// Returns all top tracks for an artist, sorted alphabetically by title
// ---------------------------------------------------------------------------
router.get('/artist/:id/tracks', async (req, res) => {
  const artistId = req.params.id;

  try {
    // Fetch top 100 tracks for the artist
    const url = `https://api.deezer.com/artist/${encodeURIComponent(artistId)}/top?limit=100`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.data || data.data.length === 0) return res.json([]);

    // Also get artist info for the name
    const artistUrl = `https://api.deezer.com/artist/${encodeURIComponent(artistId)}`;
    const artistRes = await fetch(artistUrl);
    const artistData = await artistRes.json();

    const tracks = data.data
      .map(track => ({
        deezer_id: String(track.id),
        title:     track.title_short || track.title,
        artist:    artistData.name || track.artist?.name || '',
        artist_id: String(artistId),
        album:     track.album?.title || '',
      }))
      .sort((a, b) => a.title.localeCompare(b.title));

    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tracks from Deezer' });
  }
});

module.exports = router;
