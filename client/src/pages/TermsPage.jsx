export default function TermsPage() {
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
          Terms of Service
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Last updated: April 2026. These terms apply to all users of In Good Hands.
        </p>
      </div>

      {section('intro', '1. About These Terms', <>
        {p('These Terms of Service govern your use of In Good Hands ("the Service", "we", "us", "our"). By creating an account or using the Service, you agree to these terms. Please read them carefully.')}
        {p('If you do not agree with these terms, please do not use the Service.')}
      </>)}

      {section('service', '2. What the Service Is', <>
        {p('In Good Hands is a personal planning tool designed to help you document your wishes, organise important information, and make it available to trusted people when the time comes.')}
        {p('The Service is intended for adults aged 16 and over. It is a personal planning record, not a legal service. Nothing recorded in In Good Hands constitutes a legally binding will, power of attorney, advance directive, or any other legal document. For binding legal instruments, please consult a qualified legal professional in your jurisdiction.')}
      </>)}

      {section('account', '3. Your Account', <>
        {p('You are responsible for maintaining the security of your account, including your password and your vault password. We are not liable for any loss or damage resulting from unauthorised access to your account.')}
        {p('You must provide accurate information when registering. You may not create an account on behalf of someone else without their consent.')}
        {p('You may only hold one account per person. Accounts are personal and non-transferable.')}
      </>)}

      {section('content', '4. Your Content', <>
        {p('You retain ownership of all information and content you enter into the Service. By using the Service, you grant us a limited licence to store, process, and display your content solely for the purpose of providing the Service to you.')}
        {p('You are responsible for the accuracy of the information you provide. We do not verify or validate the content you enter.')}
        {p('You must not use the Service to store content that is unlawful, harmful, or that infringes the rights of others.')}
      </>)}

      {section('vault', '5. The Vault and Encryption', <>
        {p('Certain sections of the Service (Digital Life and Personal and Legal Documents) are protected by a vault password that you set. Your vault password is never stored on our servers. It is derived client-side and used to encrypt your data before storage.')}
        {p('This means that if you lose or forget your vault password, we cannot recover your vault-protected data on your behalf. You will need to reset your vault, which will permanently delete the vault-protected content. Your other plans and information will remain safe.')}
        {p('After 5 consecutive failed vault password attempts, your vault data will be permanently deleted as a security measure. You will be notified by email at each failed attempt.')}
      </>)}

      {section('trusted', '6. Trusted Contacts and Access Links', <>
        {p('You may designate trusted contacts and grant them read-only access to selected sections of your plans. When you send an access link, a time-limited secure link is emailed to your contact. Links expire after 72 hours.')}
        {p('You are responsible for choosing who you share access with. We are not responsible for how your trusted contacts use the information you share with them.')}
        {p('If your inactivity period expires, the Service may automatically notify your trusted contacts in accordance with the settings you have configured.')}
      </>)}

      {section('availability', '7. Service Availability', <>
        {p('We aim to keep the Service available at all times, but we do not guarantee uninterrupted access. Maintenance, outages, or circumstances beyond our control may cause temporary unavailability.')}
        {p('We reserve the right to modify, suspend, or discontinue the Service at any time. Where possible, we will give reasonable notice of any significant changes.')}
      </>)}

      {section('deletion', '8. Account Deletion and Data', <>
        {p('You may delete your account at any time from your Profile Settings. Account deletion is permanent and irreversible. All your data, including plans, documents, vault data, and uploaded files, will be deleted from our systems.')}
        {p('We may also suspend or delete accounts that violate these Terms, after giving reasonable notice where appropriate.')}
        {p('For more information about how your data is handled, please see our Privacy Policy.')}
      </>)}

      {section('liability', '9. Limitation of Liability', <>
        {p('To the fullest extent permitted by law, In Good Hands is provided "as is" without warranties of any kind. We do not warrant that the Service is error-free, secure, or fit for any particular purpose.')}
        {p('We are not liable for any loss, damage, or harm arising from your use of the Service, including loss of data, decisions made based on information stored in the Service, or access by unauthorised third parties.')}
        {p('Nothing in these Terms limits liability for death or personal injury caused by negligence, fraud, or any other liability that cannot lawfully be excluded.')}
      </>)}

      {section('legal', '10. This Is Not Legal Advice', <>
        {p('In Good Hands is a personal planning and information storage tool. It does not provide legal, financial, medical, or estate planning advice. Nothing in the Service or these Terms should be relied upon as legal advice.')}
        {p('We strongly encourage you to consult qualified professionals, including a solicitor or estate planning lawyer, when making decisions about your will, powers of attorney, advance care directives, and other legal matters.')}
      </>)}

      {section('changes', '11. Changes to These Terms', <>
        {p('We may update these Terms from time to time. If we make material changes, we will notify registered users by email. Continued use of the Service after changes are posted constitutes acceptance of the revised Terms.')}
      </>)}

      {section('law', '12. Governing Law', <>
        {p('These Terms are governed by applicable law in the jurisdiction where the Service is operated. Any disputes will be subject to the exclusive jurisdiction of the relevant courts, unless otherwise required by local consumer protection law in your country.')}
      </>)}

      {section('contact', '13. Contact', <>
        {p('If you have any questions about these Terms, please use the contact form at the bottom of any page. We aim to respond within 30 days.')}
      </>)}

      <div style={{
        background: 'var(--green-50)', border: '1px solid var(--green-100)',
        borderRadius: 10, padding: '18px 22px', marginTop: 12,
        fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7,
      }}>
        These Terms of Service are provided in plain language for clarity and do not constitute legal advice.
        If you have specific legal concerns, please consult a qualified legal professional in your jurisdiction.
      </div>
    </div>
  )
}
