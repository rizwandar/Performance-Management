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
          Last updated: July 2026. This page describes the security measures protecting your data in In Good Hands.
        </p>
      </div>

      {section('why', '1. Why Security Matters Here', <>
        {p('In Good Hands stores some of the most sensitive information a person has: legal documents, financial details, medical wishes, and account credentials for other services. We designed the Service around that responsibility from the ground up, rather than adding security as an afterthought.')}
      </>)}

      {section('transit', '2. Encryption in Transit', <>
        {p('All communication between your browser and our servers is encrypted using TLS (HTTPS). Unencrypted HTTP connections are not supported.')}
      </>)}

      {section('vault', '3. The Digital Vault', <>
        {p('Your digital credentials and legal document records are protected by a separate vault password, in addition to your account password. This section uses field-level encryption designed so that even we cannot read your vault contents:')}
        {li([
          'Vault data is encrypted with AES-256-GCM, an authenticated encryption algorithm that detects tampering as well as protecting confidentiality.',
          'The encryption key is derived from your vault password using scrypt, a memory-hard key derivation function designed to resist brute-force attacks.',
          'Your vault password itself is never transmitted to us in a form we store, and it is never saved in our database, not even hashed. It exists only for the moment it is needed to derive the encryption key.',
          'Each encrypted value has its own random initialisation vector and authentication tag, so identical values do not produce identical ciphertext.',
        ])}
        {p('Because we never store your vault password, we cannot recover it for you. If it is lost, your vault must be reset, which permanently deletes vault-protected content. This trade-off is deliberate: it means a breach of our database alone cannot expose your vault data.')}
      </>)}

      {section('vaultattempts', '4. Vault Attempt Protection', <>
        {p('Failed vault password attempts are tracked per account. Each failed attempt triggers a security email so you know if someone is trying to access your vault. After 5 consecutive failed attempts, the vault data is permanently deleted as a last-resort protection against sustained guessing attacks.')}
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
        {p('Application data is stored in a managed PostgreSQL database. Uploaded documents and photos are stored in Cloudflare R2 object storage, accessed only through short-lived, signed URLs generated on demand, rather than being made publicly accessible.')}
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
