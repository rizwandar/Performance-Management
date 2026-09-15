// Client-facing mirror of server/lib/planLimits.js's free-vs-premium
// item-count caps, for the PlanLimitNotice upgrade-prompt component. The
// server is the real enforcement point - these numbers are for display/
// copy only and must be kept in sync with server/lib/planLimits.js by
// hand, since this project has no cross-runtime shared module for
// server-only values today (shared/package.json only exports "./format").
//
// itemLabel/itemLabelPlural drive PlanLimitNotice's copy ("You've reached
// the Free plan limit of 2 trusted contacts...").
export const PLAN_LIMITS = {
  trusted_contacts:       { free: 2, premium: 3,    itemLabel: 'trusted contact',  itemLabelPlural: 'trusted contacts' },
  personal_messages:      { free: 2, premium: null, itemLabel: 'message',          itemLabelPlural: 'messages' },
  unfinished_business:    { free: 2, premium: null, itemLabel: 'entry',            itemLabelPlural: 'entries' },
  people_to_notify:       { free: 2, premium: null, itemLabel: 'person',           itemLabelPlural: 'people' },
  funeral_gallery_photos: { free: 5, premium: 20,   itemLabel: 'photo',            itemLabelPlural: 'photos' },
  message_audio_clips:    { free: 1, premium: 3,    itemLabel: 'voice clip',       itemLabelPlural: 'voice clips' },
}
