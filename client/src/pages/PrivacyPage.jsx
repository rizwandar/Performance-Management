export default function PrivacyPage() {
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

  const jurisdiction = (flag, title, content) => (
    <div style={{
      background: 'var(--parchment)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '18px 22px', marginBottom: 16,
    }}>
      <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 8, fontSize: '0.95rem' }}>
        {flag} {title}
      </p>
      <div style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.7 }}>
        {content}
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
          Privacy Policy
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Last updated: April 2026. This policy applies to all users of In Good Hands.
        </p>
      </div>

      {section('intro', '1. Introduction', <>
        {p('In Good Hands ("we", "us", "our") is committed to protecting your personal information and respecting your privacy. This Privacy Policy explains what data we collect, how we use it, where it is stored, and what rights you have.')}
        {p('This policy is written to meet the requirements of the General Data Protection Regulation (GDPR, EU/UK), the Personal Information Protection and Electronic Documents Act (PIPEDA, Canada), Quebec Law 25, the Australian Privacy Act 1988, the New Zealand Privacy Act 2020, and applicable US state privacy laws including the California Consumer Privacy Act (CCPA).')}
        {p('By creating an account, you confirm that you have read this policy and agree to the collection and use of your information as described here.')}
      </>)}

      {section('data', '2. What Data We Collect', <>
        {p('We collect the following categories of personal information:')}
        {li([
          'Account information: your name, email address, date of birth (optional), and country of residence.',
          'Profile and planning information: everything you record in the app — your wishes, contacts, documents, messages, and other plans.',
          'Vault-protected data: digital credentials and legal document records, encrypted with AES-256-GCM. The vault password is never stored on our servers.',
          'Consent records: the date and time you agreed to this Privacy Policy.',
          'Usage and security logs: login events, failed login attempts, and vault access attempts. Used to protect your account.',
          'Communications: messages you send via the contact form.',
        ])}
        {p('We do not collect payment card data. We do not sell or share your personal information with third parties for marketing purposes.')}
      </>)}

      {section('use', '3. How We Use Your Data', <>
        {p('We use your personal information solely to:')}
        {li([
          'Provide and operate the In Good Hands service.',
          'Send you transactional emails (welcome, password reset, inactivity reminders, security alerts).',
          'Protect your account and detect security threats.',
          'Comply with our legal obligations.',
          'Respond to support requests.',
        ])}
      </>)}

      {section('residency', '4. Data Storage and Residency', <>
        {p('Your data is stored in the following infrastructure:')}
        {jurisdiction('🗄️', 'Database', <p style={{ margin: 0 }}>Your account and planning data is stored in a SQLite database on <strong>Render.com</strong> infrastructure, hosted in <strong>Oregon, United States (US West)</strong>. This means your data is processed in the United States, regardless of where you are located. For Canadian users, this constitutes a cross-border transfer under PIPEDA. For EU/UK users, this is a restricted transfer under GDPR. We apply equivalent privacy protections in all cases.</p>)}
        {jurisdiction('📁', 'File Storage', <p style={{ margin: 0 }}>Uploaded files (such as document attachments) are stored on <strong>Cloudflare R2</strong>, with the bucket location set to <strong>Eastern North America (ENAM)</strong>, which corresponds to US East Coast infrastructure. Cloudflare does not currently offer a Canadian or EU-specific R2 region for this configuration. Files are therefore stored in the United States.</p>)}
        {p('If you are in Canada, please note that your data may be stored on servers located outside Canada, specifically in the United States. Under PIPEDA, you retain your privacy rights regardless of where data is stored, and we apply equivalent protections.')}
        {p('If you are in the EU or UK, please note that your data may be transferred outside the European Economic Area. We apply GDPR-standard contractual protections.')}
      </>)}

      {section('rights', '5. Your Rights', <>
        {p('You have the following rights regarding your personal information. To exercise any of these, use the self-service tools in your account or contact us at the address below.')}

        {jurisdiction('🇪🇺 🇬🇧', 'GDPR (EU and UK)', <>
          <p style={{ margin: 0 }}>
            <strong>Right of access:</strong> Request a copy of your data.<br/>
            <strong>Right to rectification:</strong> Correct inaccurate data via your Profile page.<br/>
            <strong>Right to erasure:</strong> Delete your account and all data using the "Delete My Account" option in Profile Settings.<br/>
            <strong>Right to portability:</strong> Export your data as a PDF using the Export feature.<br/>
            <strong>Right to object:</strong> Contact us to object to any processing.<br/>
            <strong>Right to lodge a complaint:</strong> Contact your national data protection authority (e.g. ICO in the UK, CNIL in France).
          </p>
        </>)}

        {jurisdiction('🇨🇦', 'PIPEDA and Quebec Law 25 (Canada)', <>
          <p style={{ margin: 0 }}>
            <strong>Right of access:</strong> Request a copy of your personal information by contacting us.<br/>
            <strong>Right to correction:</strong> Update your information via your Profile page.<br/>
            <strong>Right to deletion:</strong> Use "Delete My Account" in Profile Settings. Data stored outside Canada is subject to the laws of that country; however, we apply PIPEDA-equivalent protections.<br/>
            <strong>Complaints:</strong> Contact the Office of the Privacy Commissioner of Canada (OPC) at priv.gc.ca.
          </p>
        </>)}

        {jurisdiction('🇺🇸', 'California Consumer Privacy Act (CCPA)', <>
          <p style={{ margin: 0 }}>
            <strong>Right to know:</strong> You may request details of what personal information we collect and how we use it.<br/>
            <strong>Right to deletion:</strong> Use "Delete My Account" in Profile Settings to permanently delete all your data.<br/>
            <strong>Right to opt out of sale:</strong> We do not sell personal information. This right is not applicable.<br/>
            <strong>Non-discrimination:</strong> Exercising these rights will not affect your service.
          </p>
        </>)}

        {jurisdiction('🇦🇺', 'Australian Privacy Act 1988', <>
          <p style={{ margin: 0 }}>
            <strong>Access and correction:</strong> Update your information via your Profile page or contact us.<br/>
            <strong>Complaints:</strong> Contact the Office of the Australian Information Commissioner (OAIC) at oaic.gov.au.
          </p>
        </>)}

        {jurisdiction('🇳🇿', 'New Zealand Privacy Act 2020', <>
          <p style={{ margin: 0 }}>
            <strong>Access and correction:</strong> Update your information via your Profile page or contact us.<br/>
            <strong>Complaints:</strong> Contact the Office of the Privacy Commissioner at privacy.org.nz.
          </p>
        </>)}
      </>)}

      {section('retention', '6. Data Retention', <>
        {p('We retain your data for as long as your account is active. When you delete your account, all personal data is permanently deleted from our systems, including uploaded files from cloud storage. Anonymised aggregated statistics (e.g. total user count) are not deleted.')}
        {p('Security and audit logs are retained for 12 months and then automatically deleted.')}
      </>)}

      {section('security', '7. Security', <>
        {p('We use the following security measures to protect your data:')}
        {li([
          'All data in transit is encrypted with TLS (HTTPS).',
          'Passwords are hashed using bcrypt with a cost factor of 10.',
          'Vault-protected data (credentials and legal documents) is encrypted at rest with AES-256-GCM using a key derived from your vault password via scrypt. Your vault password is never sent to or stored on our servers.',
          'Failed vault password attempts are monitored and trigger automatic security emails. After 5 failed attempts, vault data is permanently deleted as a security measure.',
          'JWT authentication tokens expire after 8 hours.',
          'Rate limiting is applied to all authentication endpoints.',
        ])}
      </>)}

      {section('cookies', '8. Cookies and Tracking', <>
        {p('In Good Hands uses no advertising cookies, tracking pixels, or third-party analytics. We store a JWT authentication token in your browser\'s localStorage to keep you signed in. This token contains only your user ID, email, and admin status. It is not used for tracking.')}
        {p('We use ipapi.co to detect your country when you register, to pre-fill the country selector. No personally identifiable data is sent to ipapi.co.')}
      </>)}

      {section('children', '9. Children', <>
        {p('In Good Hands is intended for adults. We do not knowingly collect information from children under 16. If you are under 16, please do not use this service. If you believe a child has provided us with personal information, please contact us and we will delete it promptly.')}
      </>)}

      {section('changes', '10. Changes to This Policy', <>
        {p('We may update this Privacy Policy from time to time. We will notify registered users by email if we make material changes. The "last updated" date at the top of this page reflects the most recent revision.')}
      </>)}

      {section('contact', '11. Contact and Data Deletion Requests', <>
        {p('To exercise your privacy rights, request a copy of your data, or request deletion of your account:')}
        {li([
          'Self-service: Use the "Delete My Account" option in Profile Settings to immediately and permanently delete all your data.',
          'Email: Use the contact form at the bottom of any page, or email us directly.',
          'Telephone: If you would prefer to speak with an administrator before deletion, you can request this via the contact form. An administrator will call you to confirm the deletion.',
        ])}
        {p('We aim to respond to all privacy requests within 30 days.')}
      </>)}

      <div style={{
        background: 'var(--green-50)', border: '1px solid var(--green-100)',
        borderRadius: 10, padding: '18px 22px', marginTop: 12,
        fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7,
      }}>
        This Privacy Policy is provided for informational purposes and does not constitute legal advice.
        If you have specific legal concerns, please consult a qualified privacy lawyer in your jurisdiction.
      </div>
    </div>
  )
}
