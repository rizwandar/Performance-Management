export default function DeleteAccountPage() {
  const p = (text) => (
    <p style={{ color: 'var(--text)', lineHeight: 1.75, marginBottom: 12 }}>{text}</p>
  )

  const li = (items) => (
    <ul style={{ lineHeight: 1.75, color: 'var(--text)', marginBottom: 12 }}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--parchment)', padding: '48px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Georgia, serif', color: 'var(--green-900)', marginBottom: 8 }}>
          Account Deletion Request
        </h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 40 }}>In Good Hands</p>

        <div style={{ marginBottom: 36 }}>
          <h4 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 12, fontSize: '1.2rem' }}>
            How to delete your account
          </h4>
          {p('You can delete your account directly from within the In Good Hands app or website:')}
          {li([
            'Log in to your account at ingoodhands.com.au or in the mobile app.',
            'Go to My Profile (tap the profile icon or your name in the navigation).',
            'Scroll down to the Delete Account section.',
            'Enter your account password to confirm. If you have a Digital Vault set up, you will also need to enter your vault password.',
            'Tap or click Delete Account. Your account will be permanently deleted immediately.',
          ])}
          {p('If you are unable to log in to request deletion, you can email us at hello@ingoodhands.com.au with the subject line "Account Deletion Request" and the email address associated with your account. We will process the request within 30 days.')}
        </div>

        <div style={{ marginBottom: 36 }}>
          <h4 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 12, fontSize: '1.2rem' }}>
            What gets deleted
          </h4>
          {p('When your account is deleted, the following data is permanently and irreversibly removed from our systems:')}
          {li([
            'Your profile information (name, date of birth, about me, contact details).',
            'All section data you have entered (legal documents, financial affairs, medical wishes, funeral wishes, messages, bucket list, and all other sections).',
            'All uploaded files and documents stored in cloud storage.',
            'Trusted contact records and any associated access tokens.',
            'Your subscription record.',
          ])}
        </div>

        <div style={{ marginBottom: 36 }}>
          <h4 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 12, fontSize: '1.2rem' }}>
            What is retained
          </h4>
          {p('The following data is retained after account deletion:')}
          {li([
            'Security and audit logs (login history, account actions) are retained for 12 months for fraud prevention and security purposes, then automatically deleted.',
            'Anonymised, non-identifiable aggregate statistics (such as total user count) are not deleted.',
          ])}
        </div>

        <div style={{ marginBottom: 36 }}>
          <h4 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 12, fontSize: '1.2rem' }}>
            Contact us
          </h4>
          {p('If you have questions about account deletion or your data, contact us at:')}
          <p style={{ color: 'var(--text)', lineHeight: 1.75, marginBottom: 12 }}>
            <a href="mailto:hello@ingoodhands.com.au" style={{ color: 'var(--green-700)' }}>
              hello@ingoodhands.com.au
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
