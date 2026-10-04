// Warm, personal section header: small eyebrow, an evocative headline (optionally
// with a <mark>-highlighted word), practical subtext, and a primary CTA button.
// Shares the .hero-panel treatment (index.css) with the Dashboard's own hero, so the
// folded-corner/dashed-border Keepsake signature shows here too.
// `secondaryAction` is an optional node (e.g. a compact "Share this section" link)
// rendered beside the primary CTA, deliberately lower-key so it doesn't compete
// with the section's own primary action for attention.
// `cta.disabled` (+ optional `cta.disabledTitle`, shown as a tooltip) renders a
// real disabled button rather than hiding the CTA outright - used when a
// plan limit has been reached but the control itself should stay visible
// (see PlanLimitNotice.jsx).
// `subheadline` is optional. It sits directly under the headline for sections
// whose title is the plain name of the thing ("Trusted Contacts") and whose
// warmer phrase ("The people you trust") reads better as a second line than
// as the title itself. Sections that do not pass it are unchanged.
// `subtext` accepts a node as well as a string, so a section can give its
// header two short paragraphs, or a paragraph carrying a link, instead of one
// long sentence. A string still renders as a single paragraph exactly as before.
export default function SectionHero({ eyebrow, headline, highlight, subheadline, subtext, cta, secondaryAction }) {
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
        color: 'var(--heading-color, var(--green-900))', fontFamily: 'Georgia, serif', fontWeight: 700,
        fontSize: '1.7rem', lineHeight: 1.3, margin: '0 0 10px', maxWidth: '34ch',
      }}>
        {parts ? <>{parts[0]}<mark>{highlight}</mark>{parts[1]}</> : headline}
      </h2>
      {subheadline && (
        <p style={{
          color: 'var(--green-700)', fontFamily: 'Georgia, serif', fontStyle: 'italic',
          fontSize: '1.05rem', margin: '-4px 0 12px',
        }}>
          {subheadline}
        </p>
      )}
      {subtext && (
        typeof subtext === 'string'
          ? <p className="text-muted mb-3" style={{ maxWidth: 560, lineHeight: 1.65 }}>{subtext}</p>
          : <div className="text-muted mb-3" style={{ maxWidth: 560, lineHeight: 1.65 }}>{subtext}</div>
      )}
      {(cta || secondaryAction) && (
        <div className="d-flex align-items-center gap-3 flex-wrap">
          {cta && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={cta.disabled ? undefined : cta.onClick}
              disabled={cta.disabled}
              title={cta.disabledTitle}
              style={{ fontWeight: 600, padding: '9px 22px' }}
            >
              {cta.label}
            </button>
          )}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}
