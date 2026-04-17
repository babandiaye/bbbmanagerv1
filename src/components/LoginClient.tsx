'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import Footer from '@/components/Footer'
import {
  ComputerDesktopIcon,
  ArrowUpTrayIcon,
  ChartBarIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'

type PublicStats = { servers: number; recordings: number; publishRate: number }

const FEATURES = [
  {
    Icon: ComputerDesktopIcon,
    title: 'Multi-serveurs BBB',
    desc: "Centralisez plusieurs serveurs BBB avec test de connectivité automatique à l'ajout.",
    badge: 'Connectivité testée',
    bg: '#e8f4ff',
    iconColor: '#0065b1',
    badgeBg: '#e8f4ff',
    badgeColor: '#0065b1',
  },
  {
    Icon: ArrowUpTrayIcon,
    title: 'Publication en masse',
    desc: "Importez un CSV de record IDs depuis Moodle et publiez-les automatiquement.",
    badge: 'Import CSV',
    bg: '#e6f7eb',
    iconColor: '#16a34a',
    badgeBg: '#e6f7eb',
    badgeColor: '#16a34a',
  },
  {
    Icon: ChartBarIcon,
    title: 'Dashboard temps réel',
    desc: 'Statistiques par serveur, états des enregistrements et historique des jobs.',
    badge: 'Stats live',
    bg: '#fff3e0',
    iconColor: '#b45309',
    badgeBg: '#fff3e0',
    badgeColor: '#b45309',
  },
  {
    Icon: ShieldCheckIcon,
    title: 'Accès sécurisé SSO',
    desc: 'Authentification Keycloak UN-CHK, filtre direction DITSI, rôles admin/auditeur.',
    badge: 'Keycloak OIDC',
    bg: '#f3e8ff',
    iconColor: '#7c3aed',
    badgeBg: '#f3e8ff',
    badgeColor: '#7c3aed',
  },
]

export default function LoginClient({ error }: { error?: string }) {
  const [stats, setStats] = useState<PublicStats>({ servers: 0, recordings: 0, publishRate: 0 })

  useEffect(() => {
    fetch('/api/public-stats').then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  const handleLogin = () => signIn('keycloak', { callbackUrl: '/' })

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
          padding: 18px 20px;
          border: 1.5px solid #eef1f6;
          transition: box-shadow 0.2s, transform 0.15s, border-color 0.2s, background 0.2s;
          display: flex;
          gap: 16px;
        }
        .feature-card:hover {
          box-shadow: 0 6px 24px rgba(0,0,0,0.08);
          transform: translateY(-2px);
        }
        .feature-card-0:hover { background: #e8f4ff; border-color: #0065b1; }
        .feature-card-1:hover { background: #e6f7eb; border-color: #16a34a; }
        .feature-card-2:hover { background: #fff3e0; border-color: #b45309; }
        .feature-card-3:hover { background: #f3e8ff; border-color: #7c3aed; }
        .header-signin {
          background: #0065b1;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 9px 22px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
        }
        .header-signin:hover { background: #0051a2; }
        .main-grid {
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          gap: 48px;
          max-width: 1180px;
          width: 100%;
          margin: 0 auto;
          padding: 64px 32px 48px;
        }
        @media (max-width: 900px) {
          .main-grid { grid-template-columns: 1fr !important; gap: 32px; padding: 40px 20px; }
        }
      `}</style>

      {/* Header */}
      <header style={{
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 32px',
        height: 72,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img
            src="/logo-unchk.png"
            alt="UN-CHK"
            style={{ height: 44, objectFit: 'contain' }}
          />
          <div style={{ width: 1, height: 36, background: '#e2e8f0' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', letterSpacing: '-0.01em' }}>
              BBB Manager
            </span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              Université Numérique Cheikh Hamidou Kane
            </span>
          </div>
          <span style={{
            marginLeft: 8,
            padding: '4px 10px',
            borderRadius: 999,
            background: '#e8f4ff',
            color: '#0065b1',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}>
            DITSI
          </span>
        </div>
        <button className="header-signin" onClick={handleLogin}>
          Se connecter
        </button>
      </header>

      {/* Main grid : Hero à gauche, cartes à droite */}
      <main style={{ flex: 1 }}>
        <div className="main-grid">
          {/* Colonne gauche : Hero */}
          <div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 999,
              background: '#e8f4ff',
              color: '#0065b1',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 28,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0065b1' }} />
              Plateforme de gestion BigBlueButton
            </span>

            <h1 style={{
              fontSize: 'clamp(34px, 5vw, 52px)',
              fontWeight: 800,
              color: '#1a1a2e',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              margin: '0 0 20px',
            }}>
              Gérez vos{' '}
              <span style={{ color: '#0065b1' }}>enregistrements</span>{' '}
              BBB en un clic
            </h1>

            <p style={{
              fontSize: 16,
              color: '#6b7280',
              lineHeight: 1.7,
              margin: '0 0 32px',
              maxWidth: 520,
            }}>
              Supervisez, synchronisez et publiez les enregistrements de vos classes virtuelles
              depuis une interface centralisée. Accès réservé à la direction DITSI de l&apos;UN-CHK.
            </p>

            {/* Messages d'erreur */}
            {error === 'disabled' && (
              <div style={{
                maxWidth: 520,
                padding: '12px 16px',
                background: '#fff1f1',
                border: '1px solid #fecaca',
                borderRadius: 10,
                color: '#dc2626',
                fontSize: 14,
                marginBottom: 32,
              }}>
                Votre compte est désactivé. Contactez un administrateur.
              </div>
            )}
            {error && error !== 'disabled' && (
              <div style={{
                maxWidth: 520,
                padding: '12px 16px',
                background: '#fff1f1',
                border: '1px solid #fecaca',
                borderRadius: 10,
                color: '#dc2626',
                fontSize: 14,
                marginBottom: 32,
              }}>
                Accès refusé — vous devez appartenir à la direction DITSI.
              </div>
            )}

            {/* Stats */}
            <div style={{
              display: 'flex',
              gap: 48,
              paddingTop: 24,
              borderTop: '1px solid #e2e8f0',
            }}>
              <div>
                <p style={{ fontSize: 32, fontWeight: 800, color: '#1a1a2e', margin: 0, letterSpacing: '-0.02em' }}>
                  {stats.servers}
                </p>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
                  Serveurs BBB
                </p>
              </div>
              <div>
                <p style={{ fontSize: 32, fontWeight: 800, color: '#1a1a2e', margin: 0, letterSpacing: '-0.02em' }}>
                  {stats.recordings.toLocaleString('fr-FR')}
                </p>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
                  Enregistrements
                </p>
              </div>
              <div>
                <p style={{ fontSize: 32, fontWeight: 800, color: '#1a1a2e', margin: 0, letterSpacing: '-0.02em' }}>
                  {stats.publishRate}%
                </p>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
                  Taux publication
                </p>
              </div>
            </div>
          </div>

          {/* Colonne droite : 4 cartes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {FEATURES.map(({ Icon, title, desc, badge, bg, iconColor, badgeBg, badgeColor }, i) => (
              <div key={i} className={`feature-card feature-card-${i}`}>
                <div style={{
                  flexShrink: 0,
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon style={{ width: 22, height: 22, color: iconColor }} />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', margin: '0 0 4px' }}>
                    {title}
                  </h3>
                  <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, margin: '0 0 10px' }}>
                    {desc}
                  </p>
                  <span style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    borderRadius: 6,
                    background: badgeBg,
                    color: badgeColor,
                    fontSize: 11,
                    fontWeight: 600,
                  }}>
                    {badge}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
