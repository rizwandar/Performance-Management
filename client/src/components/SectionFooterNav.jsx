import { Link, useNavigate } from 'react-router-dom'
import { SECTIONS } from '../constants/sections'

// IDEA-39: sequential prev/next "journey" navigation between section pages.
// Replaces the old plain "Back to my plans" footer at the bottom of every
// section page with a three-part wayfinding row: previous section (left),
// back to the dashboard (center), next section (right).
//
// Order follows the flat SECTIONS array (client/src/constants/sections.js),
// the same order the Dashboard itself lists sections in, group by group.
// No wraparound: the first section has no previous, the last has no next.
// Neighbors are shown regardless of Premium-lock status, exactly like the
// Dashboard lists every section, locked or not - clicking through behaves
// exactly as it already does on that page (its own gate/upsell logic is
// untouched here).
//
// `sectionId` is the current section's `id` from SECTIONS.
export default function SectionFooterNav({ sectionId }) {
  const navigate = useNavigate()
  const index = SECTIONS.findIndex(s => s.id === sectionId)
  const previous = index > 0 ? SECTIONS[index - 1] : null
  const next = index >= 0 && index < SECTIONS.length - 1 ? SECTIONS[index + 1] : null

  const linkStyle = {
    display: 'flex',
    flexDirection: 'column',
    textDecoration: 'none',
    color: 'var(--text-muted)',
    fontFamily: 'var(--ui-font, inherit)',
    minWidth: 0,
  }

  const captionStyle = {
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: 2,
  }

  const labelStyle = {
    fontSize: '0.88rem',
    fontWeight: 600,
    color: 'var(--green-800)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }

  return (
    <div
      className="mt-4 pt-3"
      style={{ borderTop: '1px solid var(--border)' }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        {/* Previous section (left) */}
        <div style={{ flex: '1 1 160px', minWidth: 0, order: 1 }}>
          {previous && (
            <Link to={previous.route} style={{ ...linkStyle, textAlign: 'left', alignItems: 'flex-start' }}>
              <span style={captionStyle}>← Previous</span>
              <span style={labelStyle}>{previous.label}</span>
            </Link>
          )}
        </div>

        {/* Back to my plans (center) */}
        <div style={{ flex: '0 1 auto', order: 2, marginTop: 0 }}>
          <button
            type="button"
            className="btn btn-link p-0"
            style={{
              color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem',
              fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'var(--ui-font, inherit)',
            }}
            onClick={() => navigate('/profile')}
          >
            ← Back to my plans
          </button>
        </div>

        {/* Next section (right) */}
        <div style={{ flex: '1 1 160px', minWidth: 0, order: 3, textAlign: 'right' }}>
          {next && (
            <Link to={next.route} style={{ ...linkStyle, textAlign: 'right', alignItems: 'flex-end' }}>
              <span style={captionStyle}>Next →</span>
              <span style={labelStyle}>{next.label}</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
