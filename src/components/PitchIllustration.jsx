/**
 * Terrain vu du dessus, dessiné en SVG : net à toutes les tailles, aucun octet
 * à télécharger, et rien à recadrer sur un petit écran. Il sert d'image
 * d'accueil tant qu'aucune photo du vrai terrain n'a été fournie.
 */
export default function PitchIllustration({ className = 'pitch' }) {
  const stripes = Array.from({ length: 8 }, (_, index) => index);

  return (
    <svg
      className={className}
      viewBox="0 0 400 250"
      role="img"
      aria-label="Terrain de football en gazon synthétique, vu du dessus"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <clipPath id="pitch-area">
          <rect x="20" y="20" width="360" height="210" rx="6" />
        </clipPath>
        <radialGradient id="pitch-light" cx="50%" cy="0%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Abords du terrain */}
      <rect width="400" height="250" fill="#0c3320" />

      {/* Bandes de tonte : le motif qui fait lire « terrain » au premier coup d'œil */}
      <g clipPath="url(#pitch-area)">
        {stripes.map((index) => (
          <rect
            key={index}
            x={20 + index * 45}
            y="20"
            width="45"
            height="210"
            fill={index % 2 === 0 ? '#1a7b46' : '#15683b'}
          />
        ))}
        <rect x="20" y="20" width="360" height="210" fill="url(#pitch-light)" />
      </g>

      {/* Tracés */}
      <g fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="2">
        <rect x="20" y="20" width="360" height="210" rx="6" />
        <line x1="200" y1="20" x2="200" y2="230" />
        <circle cx="200" cy="125" r="34" />

        <rect x="20" y="60" width="52" height="130" />
        <rect x="20" y="95" width="22" height="60" />
        <path d="M72 95.6 A34 34 0 0 1 72 154.4" />

        <rect x="328" y="60" width="52" height="130" />
        <rect x="358" y="95" width="22" height="60" />
        <path d="M328 95.6 A34 34 0 0 0 328 154.4" />

        <path d="M20 30 A10 10 0 0 0 30 20" />
        <path d="M370 20 A10 10 0 0 0 380 30" />
        <path d="M20 220 A10 10 0 0 1 30 230" />
        <path d="M380 220 A10 10 0 0 0 370 230" />
      </g>

      <g fill="#ffffff" fillOpacity="0.85">
        <circle cx="200" cy="125" r="3" />
        <circle cx="55" cy="125" r="3" />
        <circle cx="345" cy="125" r="3" />
      </g>

      {/* Le ballon, posé hors des tracés pour rester lisible */}
      <g transform="translate(268 176)">
        <ellipse cx="1" cy="11" rx="11" ry="3" fill="#062015" fillOpacity="0.35" />
        <circle r="10" fill="#ffffff" />
        <path
          d="M0 -6.2 5.9 -1.9 3.6 5.1 -3.6 5.1 -5.9 -1.9Z"
          fill="#16211c"
          fillOpacity="0.9"
        />
      </g>
    </svg>
  );
}
