'use client'

import { signIn } from 'next-auth/react'
import Footer from '@/components/Footer'

const FEATURES = [
  {
    icon: '🖥️',
    title: 'Multi-serveurs BBB',
    desc: "Centralisez la gestion de tous vos serveurs BigBlueButton avec une connectivité testée automatiquement à l'ajout.",
    accent: '#0065b1',
    bg: '#e8f4ff',
    border: '#b8d9f8',
  },
  {
    icon: '📹',
    title: 'Enregistrements synchronisés',
    desc: "Récupérez automatiquement tous les enregistrements (processing, processed, published, unpublished) depuis l'API BBB.",
    accent: '#16a34a',
    bg: '#e6f7eb',
    border: '#a8ddb5',
  },
  {
    icon: '⚡',
    title: 'Publication en masse',
    desc: "Importez un CSV de record IDs depuis Moodle et publiez-les automatiquement sur le bon serveur BBB.",
    accent: '#b45309',
    bg: '#fff3e0',
    border: '#ffcc80',
  },
  {
    icon: '📊',
    title: 'Tableau de bord',
    desc: "Suivez en temps réel les statistiques par serveur, les états d'enregistrements et l'historique des publications.",
    accent: '#0065b1',
    bg: '#e8f4ff',
    border: '#90caf9',
  },
]

export default function LoginClient({ error }: { error?: string }) {
  const handleLogin = () => {
    signIn('keycloak', { callbackUrl: '/' })
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f8fafd',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      <style>{`
        .feature-card {
          background: white;
          border-radius: 14px;
          padding: 24px 20px;
          cursor: default;
          transition: box-shadow 0.2s, transform 0.15s, background 0.2s, border-color 0.2s;
          border: 1.5px solid #f0f0f0;
        }
        .feature-card:hover {
          box-shadow: 0 6px 24px rgba(0,0,0,0.09);
          transform: translateY(-2px);
        }
        .feature-card-0:hover { background: #dceefb; border-color: #b8d9f8; }
        .feature-card-1:hover { background: #d4f0dc; border-color: #a8ddb5; }
        .feature-card-2:hover { background: #ffe0b2; border-color: #ffcc80; }
        .feature-card-3:hover { background: #dceefb; border-color: #90caf9; }
        .signin-btn {
          background: #0065b1;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 10px 28px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
        }
        .signin-btn:hover {
          background: #0051a2;
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
        }
        @media (max-width: 900px) {
          .features-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 560px) {
          .features-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header */}
      <header style={{
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 32px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src="/logo-unchk.png"
            alt="UN-CHK"
            width={56}
            height={56}
            style={{ objectFit: 'contain' }}
          />
          <div style={{ width: 1, height: 32, background: '#e2e8f0' }} />
          <span style={{
            fontSize: 15,
            fontWeight: 700,
            color: '#1a1a2e',
            letterSpacing: '-0.01em',
          }}>
            BBB Manager — UN-CHK
          </span>
        </div>
        <button className="signin-btn" onClick={handleLogin}>
          S&apos;identifier
        </button>
      </header>

      {/* Hero */}
      <main style={{ flex: 1, padding: '60px 32px 48px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center', marginBottom: 52 }}>
          <h1 style={{
            fontSize: 'clamp(28px, 5vw, 40px)',
            fontWeight: 700,
            color: '#1a1a2e',
            lineHeight: 1.2,
            margin: '0 0 16px',
          }}>
            Plateforme de gestion<br />des serveurs BigBlueButton
          </h1>
          <p style={{
            fontSize: 16,
            color: '#6b7280',
            lineHeight: 1.7,
            margin: '0 auto',
            maxWidth: 600,
          }}>
            BBB Manager centralise l&apos;administration de votre cluster BigBlueButton :
            synchronisation des enregistrements, publication automatisée et supervision
            multi-serveurs pour l&apos;Université Numérique Cheikh Hamidou Kane.
          </p>

          {/* Messages d'erreur */}
          {error === 'disabled' && (
            <div style={{
              maxWidth: 600,
              margin: '24px auto 0',
              padding: '12px 16px',
              background: '#fff1f1',
              border: '1px solid #fecaca',
              borderRadius: 8,
              color: '#dc2626',
              fontSize: 14,
            }}>
              Votre compte est désactivé. Contactez un administrateur.
            </div>
          )}
          {error && error !== 'disabled' && (
            <div style={{
              maxWidth: 600,
              margin: '24px auto 0',
              padding: '12px 16px',
              background: '#fff1f1',
              border: '1px solid #fecaca',
              borderRadius: 8,
              color: '#dc2626',
              fontSize: 14,
            }}>
              Accès refusé — vous devez appartenir à la direction DITSI.
            </div>
          )}
        </div>

        {/* Features */}
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={{
            textAlign: 'center',
            fontSize: 12,
            fontWeight: 600,
            color: '#9ca3af',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 24,
          }}>
            Principales fonctionnalités
          </p>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <div key={i} className={`feature-card feature-card-${i}`}>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: 12,
                  background: f.bg,
                  border: `1.5px solid ${f.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  marginBottom: 16,
                }}>
                  {f.icon}
                </div>
                <h3 style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: f.accent,
                  margin: '0 0 10px',
                }}>
                  {f.title}
                </h3>
                <p style={{
                  fontSize: 14,
                  color: '#6b7280',
                  lineHeight: 1.6,
                  margin: 0,
                }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
