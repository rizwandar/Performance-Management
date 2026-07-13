export default function DebugSentryPage() {
  return (
    <div style={{ maxWidth: 520, margin: '60px auto 0', textAlign: 'center', padding: '0 24px' }}>
      <p style={{ marginBottom: 24 }}>Temporary Sentry verification page.</p>
      <button
        onClick={() => {
          throw new Error('Sentry client verification test - temporary debug page, safe to ignore')
        }}
        style={{
          background: 'var(--green-800)', color: '#fff',
          padding: '10px 24px', borderRadius: 8, border: 'none', fontSize: '0.95rem',
        }}
      >
        Break the world
      </button>
    </div>
  )
}
