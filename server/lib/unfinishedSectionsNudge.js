const { queryAll, query } = require('../db/database');
const { sendEmail } = require('./sendEmail');
const { unfinishedSectionsNudgeEmail } = require('./emailTemplates');

const APP_NAME = 'In Good Hands';

// IDEA-02: a single, one-time "smart nudge" email for accounts that started
// their plan but haven't finished every section.
//
// This idea was scoped once (2026-08-05) and paused pending three unanswered
// product decisions - trigger condition, cadence, and audience - which the
// user re-raised the feature without ever explicitly answering. The
// defaults below are reasonable choices made to unblock the build; they are
// genuinely product decisions, not implementation details, so they're
// called out prominently in this feature's PR description rather than
// buried here. Summary (see the PR for full reasoning):
//   - Trigger:  registered >= 7 days AND has started at least one section
//               but not all 21 (i.e. "started but unfinished", not simply
//               "has any unfinished section" - a brand-new account with
//               zero sections started is deliberately excluded; nudging
//               someone about sections they haven't finished reads oddly
//               when they haven't started anything, and a zero-progress
//               account is arguably better served by separate onboarding
//               nurture, not this feature).
//   - Cadence:  one-time only per account (not recurring), the safer,
//               less spammy default. Dedupe column: users.nudge_sent_at.
//   - Audience: email_verified accounts only, excluding anyone who has
//               already fully completed onboarding (all 21 sections
//               started). Also excludes is_admin accounts (same convention
//               inactivityTimer.js already uses) - the seeded admin@igh.local
//               account, and any other admin, is not a real end-user going
//               through the section-by-section onboarding funnel, so a
//               "finish your plan" nudge would be nonsensical for them. This
//               wasn't in the original suggested defaults but follows an
//               existing precedent in this codebase, found while verifying
//               the query against real local data.
//
// TOTAL_SECTIONS below must be kept in sync with the 21 keys returned by
// GET /api/sections/completion (server/routes/sections.js) and with
// client/src/pages/DashboardPage.jsx's SECTIONS array, which is the
// client-side source of truth this mirrors server-side (this cron job has
// no browser context to reuse the client's own isStarted()/completion
// logic from, so the same per-section "at least one row exists" signal is
// reimplemented here as SQL instead).
const TOTAL_SECTIONS = 21;

// One single aggregate query across the whole users table, rather than
// looping per-user and re-running sections.js's 19-query /completion logic
// for each one (which would be a genuine N+1 at scale). Each section table
// is aggregated once via a LEFT JOIN sub-select keyed on user_id, and the
// per-user "sections started" count is summed in SQL. The two profile-field
// sections (how_to_be_remembered, emergency_contact) are computed directly
// from columns already on the users row, exactly as /completion does.
//
// None of these section tables currently have an index on user_id (a
// pre-existing gap, not introduced here - see /completion's identical
// per-table COUNT(*) pattern). Fine for a single daily sweep at current
// scale; if this table set or the user base grows large enough for that to
// matter, adding covering indexes on each table's user_id column would be
// the natural next step, decoupled from this feature.
const ELIGIBLE_USERS_SQL = `
  WITH section_counts AS (
    SELECT
      u.id, u.name, u.email, u.created_at,
      (
        (CASE WHEN COALESCE(ld.c, 0)  > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(fi.c, 0)  > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(fw.c, 0)  > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(ptn.c, 0) > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(pi.c, 0)  > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(pm.c, 0)  > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(dc.c, 0)  > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(stm.c, 0) > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(lw.c, 0)  > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(hi.c, 0)  > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(cd.c, 0)  > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(pet.c, 0) > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(ins.c, 0) > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(ub.c, 0)  > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(lm.c, 0)  > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(doc.c, 0) > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(mr.c, 0)  > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(db.c, 0)  > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(tc.c, 0)  > 0 THEN 1 ELSE 0 END) +
        (CASE WHEN (
          COALESCE(u.about_me, '') <> '' OR COALESCE(u.legacy_message, '') <> '' OR
          COALESCE(u.life_story, '') <> '' OR COALESCE(u.remembered_for, '') <> ''
        ) THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(u.emergency_contact_name, '') <> '' THEN 1 ELSE 0 END)
      ) AS started_count
    FROM users u
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM legal_documents     GROUP BY user_id) ld  ON ld.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM financial_items     GROUP BY user_id) fi  ON fi.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM funeral_wishes      GROUP BY user_id) fw  ON fw.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM people_to_notify    GROUP BY user_id) ptn ON ptn.user_id = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM property_items      GROUP BY user_id) pi  ON pi.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM personal_messages   GROUP BY user_id) pm  ON pm.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM digital_credentials GROUP BY user_id) dc  ON dc.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM songs_that_define_me GROUP BY user_id) stm ON stm.user_id = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM life_wishes         GROUP BY user_id) lw  ON lw.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM household_info      GROUP BY user_id) hi  ON hi.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM children_dependants GROUP BY user_id) cd  ON cd.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM pets                GROUP BY user_id) pet ON pet.user_id = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM insurance_items     GROUP BY user_id) ins ON ins.user_id = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM unfinished_business GROUP BY user_id) ub  ON ub.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM last_moments        GROUP BY user_id) lm  ON lm.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM doctors             GROUP BY user_id) doc ON doc.user_id = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM medical_records     GROUP BY user_id) mr  ON mr.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM donation_bank       GROUP BY user_id) db  ON db.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM trusted_contacts    GROUP BY user_id) tc  ON tc.user_id  = u.id
    WHERE u.email_verified = 1
      AND u.is_admin = 0
      AND u.nudge_sent_at IS NULL
      AND u.created_at <= NOW() - INTERVAL '7 days'
  )
  SELECT id, name, email, started_count
  FROM section_counts
  WHERE started_count > 0 AND started_count < $1
`;

async function sendUnfinishedSectionsNudges() {
  const users = await queryAll(ELIGIBLE_USERS_SQL, [TOTAL_SECTIONS]);

  for (const user of users) {
    try {
      await sendEmail({
        to:      user.email,
        subject: `Pick up where you left off on ${APP_NAME}`,
        html:    unfinishedSectionsNudgeEmail({
          name:         user.name,
          startedCount: user.started_count,
          totalCount:   TOTAL_SECTIONS,
        }),
      });

      await query(`UPDATE users SET nudge_sent_at = NOW() WHERE id = $1`, [user.id]);
      console.log(`[nudge] Unfinished-sections nudge sent to ${user.email} (${user.started_count}/${TOTAL_SECTIONS} started)`);
    } catch (err) {
      console.error(`[nudge] Unfinished-sections nudge failed for user ${user.id}:`, err.message);
    }
  }
}

module.exports = { sendUnfinishedSectionsNudges, TOTAL_SECTIONS };
