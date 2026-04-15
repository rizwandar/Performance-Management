const express = require('express');
const router = express.Router();

router.get('/search', async (req, res) => {
  const { artist } = req.query;
  if (!artist || !artist.trim()) {
    return res.status(400).json({ error: 'artist query is required' });
  }

  try {
    const url = `https://api.deezer.com/search?q=artist:"${encodeURIComponent(artist.trim())}"&limit=50`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      return res.json([]);
    }

    // Deduplicate by title + artist
    const seen = new Set();
    const tracks = [];
    for (const track of data.data) {
      const key = `${track.title}__${track.artist.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        tracks.push({
          deezer_id: String(track.id),
          title: track.title,
          artist: track.artist.name,
          album: track.album.title
        });
      }
    }

    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch from Deezer' });
  }
});

module.exports = router;
