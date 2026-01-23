// src/components/ProfileBannerBackground.jsx
// Hemos convertido el SVG a formato JSX (camelCase para los atributos)
// y añadido la capacidad de pasar props como className.
interface ProfileBannerBackgroundProps {
  className?: string;
}

// src/components/BannerBackground.jsx
const BannerBackground = ({ className }: ProfileBannerBackgroundProps) => (
  <svg
    // Quitamos width y height para que las clases de Tailwind tengan control total.
    className={className}
    viewBox="0 0 1230 193"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    // preserveAspectRatio="none" es crucial para que se estire horizontalmente
    // sin deformarse verticalmente.
    preserveAspectRatio="none"
  >
    <path
      d="M59.16 128.604C53.9977 128.66 35.0357 128.651 19.9528 128.634C8.9222 128.621 0 119.673 0 108.642V20C0 8.9543 8.95429 0 20 0H1210C1221.05 0 1230 8.95429 1230 20V109.082C1230 120.135 1221.03 129.093 1209.98 129.082L749.198 128.639C749.198 128.639 284.071 128.612 273.078 128.716C262.084 128.82 253.335 140.753 251.812 143.629C231.572 181.842 201.162 192.852 165.98 192.852C117.045 192.852 93.5497 160.962 84.0604 143.629C77.581 134.032 68.0905 128.506 59.16 128.604Z"
      fill="url(#paint0_linear_695_31679)"
    />
    <defs>
      <linearGradient
        id="paint0_linear_695_31679"
        x1="615"
        y1="0"
        x2="615"
        y2="192.852"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#191B24" />
        <stop offset="0.278846" stopColor="#222429" />
        <stop offset="0.557692" stopColor="#242D34" />
        <stop offset="0.769231" stopColor="#254248" />
        <stop offset="1" stopColor="#225659" />
      </linearGradient>
    </defs>
  </svg>
);

export default BannerBackground;
