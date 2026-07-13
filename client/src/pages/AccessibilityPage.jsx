export default function AccessibilityPage() {
  const section = (id, title, children) => (
    <div key={id} style={{ marginBottom: 36 }}>
      <h4 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 12, fontSize: '1.2rem' }}>
        {title}
      </h4>
      {children}
    </div>
  )

  const p = (text) => (
    <p style={{ color: 'var(--text)', lineHeight: 1.75, marginBottom: 12 }}>{text}</p>
  )

  const li = (items) => (
    <ul style={{ lineHeight: 1.75, color: 'var(--text)', marginBottom: 12 }}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  )

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
          Accessibility Statement
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Last updated: July 2026. This statement applies to the In Good Hands web application.
        </p>
      </div>

      {section('commitment', '1. Our Commitment', <>
        {p('In Good Hands is a planning tool used at some of the most sensitive moments in a person\'s life, often by people who are older, grieving, unwell, or otherwise navigating a difficult time. We want the Service to be usable by as many people as possible, regardless of ability, and we treat accessibility as an ongoing responsibility rather than a one-time checklist.')}
        {p('We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA where practicable.')}
      </>)}

      {section('features', '2. Accessibility Features Already in Place', <>
        {p('The following measures are built into the Service today:')}
        {li([
          'A "Skip to main content" link is available at the top of every page for keyboard and screen reader users.',
          'A High Contrast theme is available and can be set as the default for all users from the Admin panel.',
          'Font size and typeface can be changed for the whole app from the Admin panel, for users who need larger or simpler text.',
          'Colour is never used as the only way to convey information (for example, locked or premium sections are marked with both an icon and text, not colour alone).',
          'Forms provide clear error messages and label every input field.',
          'The site is built with semantic HTML and standard interactive components, so it works with common screen readers such as VoiceOver and NVDA.',
          'The layout is responsive and usable when zoomed up to 200%.',
        ])}
      </>)}

      {section('known', '3. Known Limitations', <>
        {p('We are aware of areas that still need improvement, including:')}
        {li([
          'Some data tables and modal dialogs have not yet been fully audited with a screen reader.',
          'Colour contrast in the default warm themes has not been formally tested against WCAG AA ratios in every combination; the High Contrast theme is the safest choice if you rely on high contrast.',
          'Some third-party components (such as the music search) may not be fully keyboard-navigable.',
        ])}
        {p('We are working through these as part of our ongoing development.')}
      </>)}

      {section('assistive', '4. Using Assistive Technology With This Site', <>
        {p('If you use a screen reader, switch to the High Contrast theme, or rely on keyboard navigation, and something on the site does not work the way you expect, please let us know using the contact form. Tell us the page you were on and what device or software you were using. This helps us prioritise fixes.')}
      </>)}

      {section('feedback', '5. Feedback and Contact', <>
        {p('We welcome feedback on the accessibility of In Good Hands. If you encounter a barrier using this Service, please contact us via the contact form at the bottom of any page. We aim to respond within 30 days and will work with you to provide the information or functionality you need through an accessible alternative where we cannot fix the issue immediately.')}
      </>)}

      <div style={{
        background: 'var(--green-50)', border: '1px solid var(--green-100)',
        borderRadius: 10, padding: '18px 22px', marginTop: 12,
        fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7,
      }}>
        This statement describes our accessibility efforts as of the date above and will be updated as improvements are made.
        It does not constitute a legal certification of conformance with any specific standard.
      </div>
    </div>
  )
}
