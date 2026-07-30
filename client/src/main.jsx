import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import 'bootstrap/dist/css/bootstrap.min.css'
import './index.css'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
  })
}

function ErrorFallback() {
  return (
    <div style={{
      maxWidth: 520, margin: '60px auto 0', textAlign: 'center', padding: '0 24px',
    }}>
      <h2 style={{
        color: 'var(--green-900)', fontFamily: 'Georgia, serif',
        marginBottom: 12, fontSize: '1.6rem',
      }}>
        Something went wrong
      </h2>
      <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 32 }}>
        We've been notified and are looking into it. Please try refreshing the page.
      </p>
      <a
        href="/"
        style={{
          background: 'var(--btn-cta-bg, var(--green-800))', color: 'var(--btn-cta-color, #fff)',
          padding: '10px 24px', borderRadius: 'var(--btn-radius, 8px)',
          textDecoration: 'none', fontSize: '0.95rem',
        }}
      >
        Back to home
      </a>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
)
