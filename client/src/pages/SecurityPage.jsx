export default function SecurityPage() {
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
          Security
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Last updated: August 2026. This page describes the security measures protecting your data in In Good Hands.
        </p>
      </div>

      {section('why', '1. Why Security Matters Here', <>
        {p('In Good Hands stores some of the most sensitive information a person has: legal documents, financial details, medical wishes, and account credentials for other services. We designed the Service around that responsibility from the ground up, rather than adding security as an afterthought.')}
      </>)}

      {section('transit', '2. Encryption in Transit', <>
        {p('All communication between your browser and our servers is encrypted using TLS (HTTPS). Unencrypted HTTP connections are not supported.')}
      </>)}

      {section('vault', '3. The Digital Vault', <>
        {p('Your digital credentials, legal document records, financial affairs, property and possessions, and practical household information are all protected by a separate vault password, in addition to your account password. These sections use field-level encryption:')}
        {li([
          'Vault data is encrypted with AES-256-GCM, an authenticated encryption algorithm that detects tampering as well as protecting confidentiality.',
          'The encryption key is derived from your vault password using scrypt, a memory-hard key derivation function designed to resist brute-force attacks.',
          'Your vault password itself is never transmitted to us in a form we store, and it is never saved in our database, not even hashed. It exists only for the moment it is needed to derive the encryption key.',
          'Each encrypted value has its own random initialisation vector and authentication tag, so identical values do not produce identical ciphertext.',
        ])}
        {p('When you set up your vault, you choose what happens if you ever forget the password, and you can change this choice any time from Profile > Vault Settings:')}
        {li([
          'Full reset only (default): we never store your vault password, so we cannot recover it for you. If it is lost, your vault must be reset, which permanently deletes vault-protected content. This is the strongest guarantee: a breach of our database alone can never expose your vault data.',
          'Recovery via security questions (optional): you set up 3-5 vault-specific security questions. If you forget your password, answering at least 2 of them correctly recovers access without deleting anything. Choosing this option means your vault confidentiality is only as strong as those answers, not "even we cannot read it" - a database breach combined with guessable or known answers could expose your vault data. We never store the answers themselves, only encrypted material that can only be unlocked by supplying at least 2 correct answers.',
        ])}
        {p('This field-level encryption applies to the text you enter directly (credentials, document details, notes). Files you upload as attachments (for example, a scanned document or photo) are handled differently: see "Infrastructure" below for how those are protected.')}
      </>)}

      {section('vaultattempts', '4. Vault Attempt Protection', <>
        {p('Failed vault password attempts are tracked per account. Each failed attempt triggers a security email so you know if someone is trying to access your vault. After 3 consecutive failed attempts you are signed out and must log in again before trying more. Every 5 failed attempts, the vault is temporarily locked for 15 minutes as protection against sustained guessing.')}
        {p('Unlike earlier versions of this page, incorrect attempts can eventually result in permanent deletion. Every vault has an auto-destroy threshold (default 100 consecutive wrong attempts, adjustable down to a minimum of 3 or up to 1000 from Profile > Vault Settings): once reached, all vault-protected data is automatically and permanently deleted, regardless of which forgot-password option you chose. This is a deliberate safety measure against someone with access to your account, but not your vault password, guessing indefinitely - not a hidden change in behavior. A correct password always unlocks the vault immediately, even mid-lockout, and resets the attempt count to zero.')}
      </>)}

      {section('accounts', '5. Account Security', <>
        {li([
          'Account passwords are hashed with bcrypt before storage; we never store or log plaintext passwords.',
          'Authentication uses JSON Web Tokens (JWT) that expire after 8 hours, limiting how long a stolen token remains useful.',
          'Login and password-reset endpoints are rate-limited to slow down automated guessing attacks.',
          'General API traffic is also rate-limited to reduce the impact of abuse or scripting against the Service.',
        ])}
      </>)}

      {section('infra', '6. Infrastructure', <>
        {p('Application data is stored in a managed PostgreSQL database. Uploaded documents and photos, including attachments in vault-protected sections, are stored in Cloudflare R2 object storage.')}
        {li([
          'Files are never publicly accessible. Every download is authenticated, checked against your account, and served through a short-lived signed URL (valid for one hour) generated on demand, rather than a permanent link.',
          'Cloudflare R2 encrypts all stored files at rest by default, as a standard feature of the storage platform.',
          'Unlike vault text fields (see "The Digital Vault" above), uploaded files are not additionally encrypted with a key derived from your vault password. This means file contents, while access-controlled and encrypted at rest by our storage provider, do not carry the same "even we cannot read it" guarantee that applies to vault text data. We may revisit this in a future update.',
        ])}
        {p('Access to production infrastructure and environment credentials is restricted to those operating the Service.')}
      </>)}

      {section('monitoring', '7. Monitoring and Audit Trails', <>
        {p('We keep security-relevant logs, including login attempts and vault access attempts, to help detect and investigate suspicious activity. These logs are retained for a limited period and then deleted, as described in our Privacy Policy.')}
      </>)}

      {section('scope', '8. What Security Does Not Cover', <>
        {p('No system is completely immune to failure or attack, and we do not claim In Good Hands is unbreakable. We have not undergone a formal third-party security audit or certification (such as SOC 2 or ISO 27001) at this time. If that level of assurance is important for your use case, please factor that into your decision to use the Service.')}
      </>)}

      {section('report', '9. Reporting a Security Issue', <>
        {p('If you believe you have found a security vulnerability in In Good Hands, please report it to us using the contact form at the bottom of any page, marked as a security concern. Please do not attempt to access other users\' data, run automated scanning tools against the Service, or publicly disclose a vulnerability before we have had a reasonable opportunity to address it.')}
        {p('We will acknowledge reports and keep you informed as we investigate and resolve confirmed issues.')}
      </>)}

      <div style={{
        background: 'var(--green-50)', border: '1px solid var(--green-100)',
        borderRadius: 10, padding: '18px 22px', marginTop: 12,
        fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7,
      }}>
        This page describes our security practices as of the date above and is provided for transparency.
        It does not constitute a warranty or guarantee of security, and it does not constitute legal or professional security advice.
      </div>
    </div>
  )
}
