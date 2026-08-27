// Version-1 seed content for the policy_versions table (FEAT-04/05). This is a
// verbatim HTML conversion of the content that used to be hardcoded in
// client/src/pages/TermsPage.jsx and PrivacyPage.jsx before those pages became
// database-driven - wording is unchanged, only the JSX/inline-style structure
// became semantic HTML + CSS classes (see client/src/index.css, .legal-doc).
// Only used once, at first migration, to seed version 1 so existing users
// aren't asked to "re-consent" to content they already agreed to.
//
// REV-22 (2026-08-26) is the first edit to this file that is NOT a verbatim
// carry-over: the vault-attempt paragraphs claimed "no data is ever deleted
// for incorrect attempts", which stopped being true once auto-destruction
// shipped, and the lockout duration moved from 15 minutes to 3. The text here
// now describes the shipped behavior (destruction off unless explicitly opted
// in). Editing this file does NOT change what any existing install serves:
// database.js only inserts this content when the module has no version rows at
// all, so live databases keep serving their published version until an admin
// publishes a new one from the admin panel. That republish is deliberately a
// human decision, since it triggers re-consent for every user.
//
// REV-35/REV-36 (2026-08-27), same "does not affect any live install" rule as
// REV-22 above: corrected four stale/inaccurate claims. (1) The deletion-rights
// text claimed data is "immediately and permanently" deleted with no mention of
// the 14-day encrypted database backups kept by server/lib/backup.js - added a
// plain disclosure that a residual copy can persist in a backup for up to 14
// days after account deletion. (2) The Cookies and Tracking section claimed the
// session token lives in browser localStorage, stale since SEC-09 moved it to
// an httpOnly cookie, and claimed no PII is sent to ipapi.co, when the browser
// in fact calls ipapi.co directly and discloses the visitor's IP address -
// both corrected to describe actual behavior. (3) The sensitive-data and
// vault-protected-sections lists still referenced the old combined "Medical
// Wishes" section (split into Doctors/Medical Records/Donation Bank, IDEA-32)
// and omitted Donation Bank from the vault-protected list even though it holds
// sensitive organ-donation health data and is vault-protected in
// lib/vaultSections.js - both lists corrected against the live SECTIONS array
// in client/src/pages/DashboardPage.jsx. (4) The access-link expiry claim
// ("expire after 72 hours") no longer held for the Legacy Contact/executor
// link (always non-expiring) or, since REV-14, for other trusted contacts'
// links once a death is confirmed - wording corrected to describe all three
// cases (see lib/inactivityTimer.js).

const TOS_V1_HTML = `
<div class="legal-header">
  <h2>Terms of Service</h2>
  <p class="legal-updated">Last updated: April 2026. These terms apply to all users of In Good Hands.</p>
</div>

<section>
  <h4>1. About These Terms</h4>
  <p>These Terms of Service govern your use of In Good Hands ("the Service", "we", "us", "our"). By creating an account or using the Service, you agree to these terms. Please read them carefully.</p>
  <p>If you do not agree with these terms, please do not use the Service.</p>
</section>

<section>
  <h4>2. What the Service Is</h4>
  <p>In Good Hands is a personal planning tool designed to help you document your wishes, organise important information, and make it available to trusted people when the time comes.</p>
  <p>The Service is intended for adults aged 16 and over. It is a personal planning record, not a legal service. Nothing recorded in In Good Hands constitutes a legally binding will, power of attorney, advance directive, or any other legal document. For binding legal instruments, please consult a qualified legal professional in your jurisdiction.</p>
</section>

<section>
  <h4>3. Your Account</h4>
  <p>You are responsible for maintaining the security of your account, including your password and your vault password. We are not liable for any loss or damage resulting from unauthorised access to your account.</p>
  <p>You must provide accurate information when registering. You may not create an account on behalf of someone else without their consent.</p>
  <p>You may only hold one account per person. Accounts are personal and non-transferable.</p>
</section>

<section>
  <h4>4. Your Content</h4>
  <p>You retain ownership of all information and content you enter into the Service. By using the Service, you grant us a limited licence to store, process, and display your content solely for the purpose of providing the Service to you.</p>
  <p>You are responsible for the accuracy of the information you provide. We do not verify or validate the content you enter.</p>
  <p>You must not use the Service to store content that is unlawful, harmful, or that infringes the rights of others.</p>
</section>

<section>
  <h4>5. The Vault and Encryption</h4>
  <p>Certain sections of the Service (Digital Life, Personal and Legal Documents, Financial Affairs, Property and Possessions, Practical Household Information, and Donation Bank) are protected by a vault password that you set. Your vault password is never stored on our servers. It is derived client-side and used to encrypt the text you enter directly (credentials, document details, financial and property details, donation preferences, and notes) before storage.</p>
  <p>Files you upload as attachments within these sections (for example, a scanned document or photo) are stored securely and access-controlled, but are not encrypted using your vault password. See our Security page for the full technical detail on how uploaded files are protected.</p>
  <p>This means that if you lose or forget your vault password, we cannot recover your vault-protected data on your behalf. You will need to reset your vault, which will permanently delete the vault-protected content. Your other plans and information will remain safe.</p>
  <p>After 5 consecutive failed vault password attempts, you are signed out of your account and your vault is temporarily locked for 3 minutes as a security measure. The lock clears on its own, and entering the correct password unlocks the vault immediately. You will be notified by email at each failed attempt.</p>
  <p>By default, no vault data is ever deleted because of incorrect attempts. There is an optional "maximum security" setting, switched off unless you turn it on yourself in Profile, Vault Settings, which permanently deletes all of your vault-protected data once a chosen number of consecutive incorrect attempts is reached. If you choose to turn that setting on, we show you a warning first, and the deletion it causes is permanent and cannot be undone by you or by us. You can switch it off again at any time.</p>
</section>

<section>
  <h4>6. Trusted Contacts and Access Links</h4>
  <p>You may designate trusted contacts and grant them read-only access to selected sections of your plans. When you send an access link, a secure link is emailed to your contact. For most trusted contacts, this link expires after 72 hours if unused. Your designated Legacy Contact's access link does not expire, since they may need it after you are no longer able to resend one. Once your death has been confirmed in the Service, access links sent to your other trusted contacts also stop expiring, for the same reason.</p>
  <p>You are responsible for choosing who you share access with. We are not responsible for how your trusted contacts use the information you share with them.</p>
  <p>If your inactivity period expires, the Service may automatically notify your trusted contacts in accordance with the settings you have configured.</p>
</section>

<section>
  <h4>7. Service Availability</h4>
  <p>We aim to keep the Service available at all times, but we do not guarantee uninterrupted access. Maintenance, outages, or circumstances beyond our control may cause temporary unavailability.</p>
  <p>We reserve the right to modify, suspend, or discontinue the Service at any time. Where possible, we will give reasonable notice of any significant changes.</p>
</section>

<section>
  <h4>8. Account Deletion and Data</h4>
  <p>You may delete your account at any time from your Profile Settings. Account deletion is permanent and irreversible. All your data, including plans, documents, vault data, and uploaded files, will be deleted from our systems.</p>
  <p>We may also suspend or delete accounts that violate these Terms, after giving reasonable notice where appropriate.</p>
  <p>For more information about how your data is handled, please see our Privacy Policy.</p>
</section>

<section>
  <h4>9. Limitation of Liability</h4>
  <p>To the fullest extent permitted by law, In Good Hands is provided "as is" without warranties of any kind. We do not warrant that the Service is error-free, secure, or fit for any particular purpose.</p>
  <p>We are not liable for any loss, damage, or harm arising from your use of the Service, including loss of data, decisions made based on information stored in the Service, or access by unauthorised third parties.</p>
  <p>Nothing in these Terms limits liability for death or personal injury caused by negligence, fraud, or any other liability that cannot lawfully be excluded.</p>
</section>

<section>
  <h4>10. This Is Not Legal Advice</h4>
  <p>In Good Hands is a personal planning and information storage tool. It does not provide legal, financial, medical, or estate planning advice. Nothing in the Service or these Terms should be relied upon as legal advice.</p>
  <p>We strongly encourage you to consult qualified professionals, including a solicitor or estate planning lawyer, when making decisions about your will, powers of attorney, advance care directives, and other legal matters.</p>
</section>

<section>
  <h4>11. Changes to These Terms</h4>
  <p>We may update these Terms from time to time. If we make material changes, we will notify registered users by email. Continued use of the Service after changes are posted constitutes acceptance of the revised Terms.</p>
</section>

<section>
  <h4>12. Governing Law</h4>
  <p>These Terms are governed by applicable law in the jurisdiction where the Service is operated. Any disputes will be subject to the exclusive jurisdiction of the relevant courts, unless otherwise required by local consumer protection law in your country.</p>
</section>

<section>
  <h4>13. Contact</h4>
  <p>If you have any questions about these Terms, please use the contact form at the bottom of any page. We aim to respond within 30 days.</p>
</section>

<div class="legal-footer-note">
  These Terms of Service are provided in plain language for clarity and do not constitute legal advice.
  If you have specific legal concerns, please consult a qualified legal professional in your jurisdiction.
</div>
`.trim();

const PRIVACY_V1_HTML = `
<div class="legal-header">
  <h2>Privacy Policy</h2>
  <p class="legal-updated">Last updated: July 2026. This policy applies to all users of In Good Hands.</p>
</div>

<section>
  <h4>1. Introduction</h4>
  <p>In Good Hands ("we", "us", "our") is committed to protecting your personal information and respecting your privacy. This Privacy Policy explains what data we collect, how we use it, where it is stored, and what rights you have.</p>
  <p>In Good Hands currently launches and is marketed to users in the United States. This policy is written to meet the requirements of applicable US state privacy laws, including the California Consumer Privacy Act as amended by the California Privacy Rights Act (CCPA/CPRA), as well as the General Data Protection Regulation (GDPR, EU/UK), the Personal Information Protection and Electronic Documents Act (PIPEDA, Canada), Quebec Law 25, the Australian Privacy Act 1988, and the New Zealand Privacy Act 2020, for users who access the service from those regions.</p>
  <p>By creating an account, you confirm that you have read this policy and agree to the collection and use of your information as described here.</p>
</section>

<section>
  <h4>2. What Data We Collect</h4>
  <p>We collect the following categories of personal information:</p>
  <ul>
    <li>Account information: your name, email address, date of birth (optional), and country of residence.</li>
    <li>Profile and planning information: everything you record in the app, your wishes, contacts, documents, messages, and other plans.</li>
    <li>Vault-protected data: digital credentials and legal document records, encrypted with AES-256-GCM. The vault password is never stored on our servers.</li>
    <li>Consent records: the date and time you agreed to this Privacy Policy.</li>
    <li>Usage and security logs: login events, failed login attempts, and vault access attempts. Used to protect your account.</li>
    <li>Communications: messages you send via the contact form.</li>
  </ul>
  <p>Some of what you choose to record falls under "sensitive personal information" as defined by California law, specifically medical/health information (Medical Records and Donation Bank) and financial account information (Financial Affairs). We collect this only because you choose to record it as part of your own planning, and we use it solely to provide the service, never to analyze or infer anything about you, and never for advertising.</p>
  <p>We do not collect payment card data (Stripe, our payment processor, handles that directly). We do not sell or share your personal information with third parties for marketing purposes.</p>
</section>

<section>
  <h4>3. How We Use Your Data</h4>
  <p>We use your personal information solely to:</p>
  <ul>
    <li>Provide and operate the In Good Hands service.</li>
    <li>Send you transactional emails (welcome, password reset, inactivity reminders, security alerts).</li>
    <li>Protect your account and detect security threats.</li>
    <li>Comply with our legal obligations.</li>
    <li>Respond to support requests.</li>
  </ul>
</section>

<section>
  <h4>4. Data Storage and Residency</h4>
  <p>Your data is stored in the following infrastructure:</p>
  <div class="legal-jurisdiction">
    <p class="legal-jurisdiction-title">🗄️ Database</p>
    <p>Your account and planning data is stored in a PostgreSQL database on <strong>Render.com</strong> infrastructure, hosted in <strong>Oregon, United States (US West)</strong>. This means your data is processed in the United States, regardless of where you are located. For Canadian users, this constitutes a cross-border transfer under PIPEDA. For EU/UK users, this is a restricted transfer under GDPR. We apply equivalent privacy protections in all cases.</p>
  </div>
  <div class="legal-jurisdiction">
    <p class="legal-jurisdiction-title">📁 File Storage</p>
    <p>Uploaded files (such as document attachments) are stored on <strong>Cloudflare R2</strong>, with the bucket location set to <strong>Eastern North America (ENAM)</strong>, which corresponds to US East Coast infrastructure. Cloudflare does not currently offer a Canadian or EU-specific R2 region for this configuration. Files are therefore stored in the United States.</p>
  </div>
  <p>If you are in Canada, please note that your data may be stored on servers located outside Canada, specifically in the United States. Under PIPEDA, you retain your privacy rights regardless of where data is stored, and we apply equivalent protections.</p>
  <p>If you are in the EU or UK, please note that your data may be transferred outside the European Economic Area. We apply GDPR-standard contractual protections.</p>
</section>

<section>
  <h4>5. Your Rights</h4>
  <p>You have the following rights regarding your personal information. To exercise any of these, use the self-service tools in your account or contact us at the address below. In Good Hands currently launches and is marketed to users in the United States; the sections below apply to all users regardless of location.</p>

  <div class="legal-jurisdiction">
    <p class="legal-jurisdiction-title">🇺🇸 US State Privacy Laws, including California (CCPA/CPRA)</p>
    <p>
      <strong>Right to know:</strong> You may request details of what personal information we collect, the sources it comes from, and how we use and disclose it.<br/>
      <strong>Right to correct:</strong> Update inaccurate information via your Profile page, or contact us for data we hold that isn't self-editable.<br/>
      <strong>Right to delete:</strong> Use "Delete My Account" in Profile Settings to delete all your data from our live systems immediately. See Section 6 (Data Retention) below for how long a residual copy may briefly remain in encrypted backups.<br/>
      <strong>Right to limit use of sensitive personal information:</strong> Some of what you record here (medical/health information, financial account details) qualifies as "sensitive personal information" under California law. We only use it to provide the service you asked for, never to infer characteristics about you or for advertising. Because we don't use it for anything beyond that, there is nothing further to limit, but you may still contact us with questions.<br/>
      <strong>Right to opt out of sale or sharing:</strong> We do not sell personal information, and we do not share it for cross-context behavioral advertising (the kind of "sharing" CPRA also covers). If this ever changes, for example if ad campaigns begin using retargeting pixels, we will update this policy first and provide a "Do Not Sell or Share My Personal Information" option before doing so.<br/>
      <strong>Right to non-discrimination:</strong> Exercising any of these rights will not result in denial of service, a different price, or a different quality of service.<br/>
      <strong>Authorized agents:</strong> You may designate an authorized agent to make a request on your behalf; we will verify the agent's authority before responding.<br/>
      <strong>Verification:</strong> To protect your data, most requests must be made from your logged-in account. Requests made by email are verified by matching the details you provide against your account.<br/>
      <strong>Response time:</strong> California law allows up to 45 days to respond (extendable by another 45 days for complex requests); we aim to respond well within that window.<br/>
      <strong>Complaints:</strong> Contact the California Privacy Protection Agency (CPPA) at cppa.ca.gov, or your state Attorney General if you are in another US state with its own privacy law.
    </p>
  </div>

  <div class="legal-jurisdiction">
    <p class="legal-jurisdiction-title">🇪🇺 🇬🇧 GDPR (EU and UK)</p>
    <p>
      <strong>Right of access:</strong> Request a copy of your data.<br/>
      <strong>Right to rectification:</strong> Correct inaccurate data via your Profile page.<br/>
      <strong>Right to erasure:</strong> Delete your account and all data using the "Delete My Account" option in Profile Settings.<br/>
      <strong>Right to portability:</strong> Export your data as a PDF using the Export feature.<br/>
      <strong>Right to object:</strong> Contact us to object to any processing.<br/>
      <strong>Right to lodge a complaint:</strong> Contact your national data protection authority (e.g. ICO in the UK, CNIL in France).
    </p>
  </div>

  <div class="legal-jurisdiction">
    <p class="legal-jurisdiction-title">🇨🇦 PIPEDA and Quebec Law 25 (Canada)</p>
    <p>
      <strong>Right of access:</strong> Request a copy of your personal information by contacting us.<br/>
      <strong>Right to correction:</strong> Update your information via your Profile page.<br/>
      <strong>Right to deletion:</strong> Use "Delete My Account" in Profile Settings. Data stored outside Canada is subject to the laws of that country; however, we apply PIPEDA-equivalent protections.<br/>
      <strong>Complaints:</strong> Contact the Office of the Privacy Commissioner of Canada (OPC) at priv.gc.ca.
    </p>
  </div>

  <div class="legal-jurisdiction">
    <p class="legal-jurisdiction-title">🇦🇺 Australian Privacy Act 1988</p>
    <p>
      <strong>Access and correction:</strong> Update your information via your Profile page or contact us.<br/>
      <strong>Complaints:</strong> Contact the Office of the Australian Information Commissioner (OAIC) at oaic.gov.au.
    </p>
  </div>

  <div class="legal-jurisdiction">
    <p class="legal-jurisdiction-title">🇳🇿 New Zealand Privacy Act 2020</p>
    <p>
      <strong>Access and correction:</strong> Update your information via your Profile page or contact us.<br/>
      <strong>Complaints:</strong> Contact the Office of the Privacy Commissioner at privacy.org.nz.
    </p>
  </div>
</section>

<section>
  <h4>6. Data Retention</h4>
  <p>We retain your data for as long as your account is active. When you delete your account, your personal data is deleted from our live systems immediately. Anonymised aggregated statistics (e.g. total user count) are not deleted.</p>
  <p>We also keep encrypted daily backups of our database for disaster-recovery purposes, retained on a rolling basis for up to 14 days. Because a deleted account may already be captured in a backup taken before you deleted it, a residual copy of your data can remain in these backups for up to 14 days after deletion, until the backup containing it is rotated out and purged. We do not restore individual accounts from backups after deletion; backups exist solely to recover from a system-wide failure or data loss event.</p>
  <p>Security and audit logs are retained for 12 months and then automatically deleted.</p>
</section>

<section>
  <h4>7. Security</h4>
  <p>We use the following security measures to protect your data:</p>
  <ul>
    <li>All data in transit is encrypted with TLS (HTTPS).</li>
    <li>Passwords are hashed using bcrypt with a cost factor of 10.</li>
    <li>Vault-protected text (digital credentials, legal document details, financial affairs, property and possessions, practical household information, donation and organ-donation preferences, and notes) is encrypted at rest with AES-256-GCM using a key derived from your vault password via scrypt. Your vault password is never sent to or stored on our servers.</li>
    <li>Uploaded files (such as document scans or photos) are stored in Cloudflare R2, encrypted at rest by the storage provider, and only ever accessible through short-lived signed URLs tied to your authenticated account, never a public link. Files are not additionally encrypted with your vault password.</li>
    <li>Failed vault password attempts are monitored and trigger automatic security emails. After 5 failed attempts, you are signed out and your vault is temporarily locked for 3 minutes as a security measure. No data is deleted for incorrect attempts unless you have turned on the optional "maximum security" auto-delete setting yourself, which is switched off by default for every account.</li>
    <li>JWT authentication tokens expire after 8 hours.</li>
    <li>Rate limiting is applied to all authentication endpoints.</li>
  </ul>
</section>

<section>
  <h4>8. Cookies and Tracking</h4>
  <p>In Good Hands uses no advertising cookies, tracking pixels, or third-party analytics. We keep you signed in using an httpOnly authentication cookie set by our server: this cookie cannot be read by JavaScript running in your browser, and our own client-side code never reads or stores your session token directly. It contains only your user ID, email, and admin status, and is used solely to keep you signed in, not for tracking. We also set a separate, non-sensitive cookie that our client-side code reads and echoes back as a security header on requests that change your data, a standard technique to help confirm requests are genuinely coming from you. That cookie is likewise not used for tracking.</p>
  <p>When you register, your browser contacts ipapi.co directly to detect your country and pre-fill the country selector. This discloses your IP address to ipapi.co, a third-party geolocation service, for that purpose only. We do not send ipapi.co your name, email address, or anything else you have entered into In Good Hands.</p>
</section>

<section>
  <h4>9. Children</h4>
  <p>In Good Hands is intended for adults. We do not knowingly collect information from children under 16. If you are under 16, please do not use this service. If you believe a child has provided us with personal information, please contact us and we will delete it promptly.</p>
</section>

<section>
  <h4>10. Changes to This Policy</h4>
  <p>We may update this Privacy Policy from time to time. We will notify registered users by email if we make material changes. The "last updated" date at the top of this page reflects the most recent revision.</p>
</section>

<section>
  <h4>11. Contact and Data Deletion Requests</h4>
  <p>To exercise your privacy rights, request a copy of your data, or request deletion of your account:</p>
  <ul>
    <li>Self-service: Use the "Delete My Account" option in Profile Settings to delete all your data from our live systems immediately. See Section 6 (Data Retention) above for how long a residual copy may briefly remain in encrypted backups.</li>
    <li>Email: Use the contact form at the bottom of any page, or email us directly.</li>
    <li>Telephone: If you would prefer to speak with an administrator before deletion, you can request this via the contact form. An administrator will call you to confirm the deletion.</li>
  </ul>
  <p>We aim to respond to all privacy requests within 30 days. California residents are entitled to up to 45 days under state law (extendable once by another 45 days for complex requests); we aim to respond well within that window in all cases.</p>
</section>

<div class="legal-footer-note">
  This Privacy Policy is provided for informational purposes and does not constitute legal advice.
  If you have specific legal concerns, please consult a qualified privacy lawyer in your jurisdiction.
</div>
`.trim();

module.exports = { TOS_V1_HTML, PRIVACY_V1_HTML };
