const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN) {
  // NODE_ENV is not reliable for this: Render sets it to 'production' on
  // every web service by default, including staging ones. RENDER_SERVICE_NAME
  // (set automatically by Render, e.g. "in-good-hands-api-staging" vs
  // "performance-api") actually distinguishes them.
  const environment = process.env.RENDER_SERVICE_NAME || process.env.NODE_ENV || 'development';
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment,
  });
}
