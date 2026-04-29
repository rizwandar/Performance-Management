import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, TextInput, Image,
} from 'react-native'
import { songsApi, deezerApi } from '../lib/api'
import { THEME } from '../lib/theme'
import ItemCard from '../components/ItemCard'
import EmptyState from '../components/EmptyState'

export default function SongsScreen() {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [query, setQuery]             = useState('')
  const [searching, setSearching]     = useState(false)
  const [artistResults, setArtistResults] = useState([])
  const [selectedArtist, setSelectedArtist] = useState(null)
  const [artistTracks, setArtistTracks] = useState([])
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [saving, setSaving]           = useState(false)

  const searchTimeout = useRef(null)

  const load = useCallback(async () => {
    try { setItems(await songsApi.getAll()) } catch {}
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  function handleQueryChange(val) {
    setQuery(val)
    setSearchError('')
    setArtistResults([])
    setSelectedArtist(null)
    setArtistTracks([])
    clearTimeout(searchTimeout.current)
    if (!val.trim()) return
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await deezerApi.searchArtists(val)
        setArtistResults(results)
        if (!results.length) setSearchError('No artists found. Try a different name.')
      } catch {
        setSearchError('Search failed. Please check your connection.')
      }
      setSearching(false)
    }, 500)
  }

  async function selectArtist(artist) {
    setSelectedArtist(artist)
    setArtistResults([])
    setArtistTracks([])
    setLoadingTracks(true)
    setSearchError('')
    try {
      const tracks = await deezerApi.getArtistTracks(artist.id)
      setArtistTracks(tracks)
      if (!tracks.length) setSearchError('No tracks found for this artist.')
    } catch {
      setSearchError("Couldn't load songs for this artist. Please try again.")
    }
    setLoadingTracks(false)
  }

  async function addSong(track) {
    if (items.length >= 60) return
    if (items.some(i => i.deezer_id === track.deezer_id)) {
      setSearchError(`"${track.title}" is already in your list.`)
      return
    }
    setSaving(true)
    setSearchError('')
    try {
      await songsApi.add({
        deezer_id: track.deezer_id,
        title:     track.title,
        artist:    track.artist,
        album:     track.album,
      })
      load()
    } catch (err) {
      setSearchError(err.response?.data?.error || "Couldn't add this song. Please try again.")
    }
    setSaving(false)
  }

  function clearSearch() {
    clearTimeout(searchTimeout.current)
    setQuery('')
    setArtistResults([])
    setSelectedArtist(null)
    setArtistTracks([])
    setSearchError('')
  }

  async function remove(id) {
    try { await songsApi.remove(id); load() }
    catch { Alert.alert('Could not remove song.') }
  }

  if (loading) return <ActivityIndicator size="large" color={THEME.primary} style={{ marginTop: 40 }} />

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={THEME.primary} />}
    >
      <Text style={styles.intro}>
        Search for an artist or band and pick the songs that have shaped who you are. Up to 60 songs.
      </Text>

      {/* Search panel */}
      {items.length < 60 && (
        <View style={styles.searchPanel}>
          <Text style={styles.searchLabel}>Search for an artist or band</Text>

          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={handleQueryChange}
              placeholder="e.g. Queen, The Beatles, Adele..."
              placeholderTextColor={THEME.textMuted}
              autoCapitalize="words"
              returnKeyType="search"
            />
            {searching && <ActivityIndicator size="small" color={THEME.primary} style={styles.searchSpinner} />}
            {query.length > 0 && !searching && (
              <TouchableOpacity onPress={clearSearch} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {searchError ? <Text style={styles.errorText}>{searchError}</Text> : null}

          {/* Artist results */}
          {artistResults.length > 0 && !selectedArtist && (
            <View style={styles.resultsBox}>
              <Text style={styles.resultsHint}>Select an artist:</Text>
              {artistResults.map(artist => (
                <TouchableOpacity
                  key={artist.id}
                  style={styles.artistRow}
                  onPress={() => selectArtist(artist)}
                  activeOpacity={0.7}
                >
                  {artist.picture_small
                    ? <Image source={{ uri: artist.picture_small }} style={styles.artistPic} />
                    : <View style={[styles.artistPic, styles.artistPicPlaceholder]}><Text style={styles.artistPicIcon}>♪</Text></View>
                  }
                  <View style={styles.artistInfo}>
                    <Text style={styles.artistName}>{artist.name}</Text>
                    {artist.nb_album > 0 && <Text style={styles.artistMeta}>{artist.nb_album} albums</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Selected artist + tracks */}
          {selectedArtist && (
            <View>
              <View style={styles.selectedArtistRow}>
                {selectedArtist.picture_small
                  ? <Image source={{ uri: selectedArtist.picture_small }} style={styles.artistPic} />
                  : null
                }
                <Text style={styles.selectedArtistName}>{selectedArtist.name}</Text>
                <TouchableOpacity onPress={clearSearch} style={styles.changeBtn}>
                  <Text style={styles.changeBtnText}>Change</Text>
                </TouchableOpacity>
              </View>

              {loadingTracks ? (
                <View style={styles.tracksLoading}>
                  <ActivityIndicator size="small" color={THEME.primary} />
                  <Text style={styles.tracksLoadingText}>Loading songs...</Text>
                </View>
              ) : artistTracks.length > 0 ? (
                <View style={styles.tracksBox}>
                  <Text style={styles.resultsHint}>{artistTracks.length} songs — tap to add:</Text>
                  {artistTracks.map(track => {
                    const alreadyAdded = items.some(i => i.deezer_id === track.deezer_id)
                    return (
                      <TouchableOpacity
                        key={track.deezer_id}
                        style={[styles.trackRow, alreadyAdded && styles.trackRowAdded]}
                        onPress={() => !alreadyAdded && !saving && addSong(track)}
                        activeOpacity={alreadyAdded ? 1 : 0.7}
                        disabled={alreadyAdded || saving}
                      >
                        <View style={styles.trackInfo}>
                          <Text style={[styles.trackTitle, alreadyAdded && styles.trackTitleDim]}>{track.title}</Text>
                          {track.album ? <Text style={styles.trackAlbum}>{track.album}</Text> : null}
                        </View>
                        <Text style={[styles.trackAction, alreadyAdded && styles.trackActionAdded]}>
                          {alreadyAdded ? '✓' : '+ Add'}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              ) : null}
            </View>
          )}
        </View>
      )}

      {/* Song list */}
      {items.length === 0 ? (
        <EmptyState message="No songs added yet. Search for an artist above to get started." />
      ) : (
        <View>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Your songs</Text>
            <Text style={styles.listCount}>{items.length} / 60</Text>
          </View>
          {items.map(item => (
            <ItemCard
              key={item.id}
              title={item.title}
              subtitle={`${item.artist}${item.album ? ` — ${item.album}` : ''}`}
              onDelete={() => remove(item.id)}
              deleteConfirmMessage={`Remove "${item.title}"?`}
            />
          ))}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  content:   { padding: 16, paddingBottom: 32 },
  intro:     { fontSize: 14, color: THEME.textMuted, lineHeight: 22, marginBottom: 16 },

  searchPanel: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  searchLabel: { fontSize: 14, fontWeight: '600', color: THEME.text, marginBottom: 10 },
  searchRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: THEME.text,
    backgroundColor: THEME.background,
  },
  searchSpinner: { marginLeft: 10 },
  clearBtn:      { marginLeft: 10, padding: 6 },
  clearBtnText:  { fontSize: 16, color: THEME.textMuted },
  errorText:     { fontSize: 13, color: '#DC2626', marginBottom: 8 },

  resultsBox: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 4,
    backgroundColor: THEME.background,
  },
  resultsHint: { fontSize: 12, color: THEME.textMuted, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },

  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    gap: 10,
  },
  artistPic:         { width: 36, height: 36, borderRadius: 18 },
  artistPicPlaceholder: { backgroundColor: THEME.border, alignItems: 'center', justifyContent: 'center' },
  artistPicIcon:     { fontSize: 16, color: THEME.textMuted },
  artistInfo:        { flex: 1 },
  artistName:        { fontSize: 14, fontWeight: '600', color: THEME.text },
  artistMeta:        { fontSize: 12, color: THEME.textMuted },

  selectedArtistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  selectedArtistName: { flex: 1, fontSize: 15, fontWeight: '700', color: THEME.text },
  changeBtn:          { paddingHorizontal: 10, paddingVertical: 4 },
  changeBtnText:      { fontSize: 13, color: THEME.primary, fontWeight: '600' },

  tracksLoading:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  tracksLoadingText: { fontSize: 13, color: THEME.textMuted },

  tracksBox:  { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, overflow: 'hidden', backgroundColor: THEME.background },
  trackRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: THEME.border },
  trackRowAdded: { opacity: 0.5 },
  trackInfo:  { flex: 1, paddingRight: 8 },
  trackTitle: { fontSize: 14, fontWeight: '500', color: THEME.text },
  trackTitleDim: { color: THEME.textMuted },
  trackAlbum: { fontSize: 12, color: THEME.textMuted, marginTop: 1 },
  trackAction:      { fontSize: 13, color: THEME.primary, fontWeight: '600' },
  trackActionAdded: { color: '#16A34A' },

  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  listTitle:  { fontSize: 15, fontWeight: '700', color: THEME.text },
  listCount:  { fontSize: 13, color: THEME.textMuted },
})
