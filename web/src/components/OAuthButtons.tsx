import type { OAuthProviderInfo } from '../types/api'

interface Props {
  providers: OAuthProviderInfo[]
  intent: 'login' | 'link'
  onStart: (providerId: string) => void
  showDivider?: boolean
}

export function OAuthButtons({
  providers,
  intent,
  onStart,
  showDivider = true,
}: Props) {
  if (providers.length === 0) return null

  const label = intent === 'link' ? 'Link' : 'Continue with'

  return (
    <div className="oauth-block">
      <div className="oauth-buttons">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn oauth oauth-${p.id}`}
            onClick={() => onStart(p.id)}
          >
            {label} {p.name}
          </button>
        ))}
      </div>
      {showDivider && (
        <div className="oauth-divider" role="separator">
          <span>or</span>
        </div>
      )}
    </div>
  )
}
