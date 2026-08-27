import faqEntries from '../content/faqEntries'

// Standalone FAQ page. Content lives in client/src/content/faqEntries.js,
// grouped and rendered here by category - add new questions there, this
// file shouldn't need to change as the list grows.
//
// Each entry renders as a native <details>/<summary> with its stable id set
// on the <details> element, so a link like /faq#legacy-contact-vs-trusted-contact
// both scrolls to and opens the right entry (modern browsers auto-expand a
// <details> that a URL fragment points inside).
export default function FaqPage() {
  const categories = []
  faqEntries.forEach(entry => {
    if (!categories.includes(entry.category)) categories.push(entry.category)
  })

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ color: 'var(--heading-color, var(--green-900))', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
          Frequently Asked Questions
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Answers to common questions about how In Good Hands works. This page will keep growing.
          If you don't see what you're looking for, use the contact form at the bottom of any page.
        </p>
      </div>

      {categories.map(category => (
        <div key={category} style={{ marginBottom: 36 }}>
          <h4 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 12, fontSize: '1.2rem' }}>
            {category}
          </h4>
          {faqEntries.filter(entry => entry.category === category).map(entry => (
            <details
              key={entry.id}
              id={entry.id}
              style={{
                marginBottom: 12, padding: '14px 20px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--parchment)',
                scrollMarginTop: 24,
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--green-900)' }}>
                {entry.question}
              </summary>
              <p style={{ color: 'var(--text)', lineHeight: 1.75, marginTop: 12, marginBottom: 0 }}>
                {entry.answer}
              </p>
            </details>
          ))}
        </div>
      ))}

      <div style={{
        background: 'var(--green-50)', border: '1px solid var(--green-100)',
        borderRadius: 10, padding: '18px 22px', marginTop: 12,
        fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7,
      }}>
        Didn't find your question here? Use the contact form at the bottom of any page and we'll get back to you.
      </div>
    </div>
  )
}
