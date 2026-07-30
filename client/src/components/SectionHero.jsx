// Warm, personal section header: small eyebrow, an evocative headline (optionally
// with a <mark>-highlighted word), practical subtext, and a primary CTA button.
// Shares the .hero-panel treatment (index.css) with the Dashboard's own hero, so the
// folded-corner/dashed-border Keepsake signature shows here too.
export default function SectionHero({ eyebrow, headline, highlight, subtext, cta }) {
  const parts = highlight ? headline.split(highlight) : null

  return (
    <div className="hero-panel mb-4">
      <span style={{
        display: 'block', marginBottom: 8,
        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--green-700)',
      }}>
        {eyebrow}
      </span>
      <h2 style={{
        color: 'var(--green-900)', fontFamily: 'Georgia, serif', fontWeight: 700,
        fontSize: '1.7rem', lineHeight: 1.3, margin: '0 0 10px', maxWidth: '34ch',
      }}>
        {parts ? <>{parts[0]}<mark>{highlight}</mark>{parts[1]}</> : headline}
      </h2>
      {subtext && (
        <p className="text-muted mb-3" style={{ maxWidth: 560, lineHeight: 1.65 }}>{subtext}</p>
      )}
      {cta && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={cta.onClick}
          style={{ fontWeight: 600, padding: '9px 22px' }}
        >
          {cta.label}
        </button>
      )}
    </div>
  )
}
