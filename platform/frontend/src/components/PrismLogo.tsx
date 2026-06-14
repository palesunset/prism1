type Props = {
  className?: string;
  /** Show spectrum rays (inventory / LSP / IPAM). Off for very small sizes if needed. */
  showRays?: boolean;
};

/** Isometric prism with incoming light and refracted spectrum rays. */
export function PrismLogo({ className, showRays = true }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {showRays ? (
        <>
          <path
            d="M1 11 L12 14"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            opacity="0.55"
          />
          <path d="M25 12 L31 7" stroke="#34D399" strokeWidth="1.35" strokeLinecap="round" opacity="0.92" />
          <path d="M25 12 L31 13" stroke="#22D3EE" strokeWidth="1.35" strokeLinecap="round" opacity="0.98" />
          <path d="M25 12 L31 19" stroke="#A78BFA" strokeWidth="1.35" strokeLinecap="round" opacity="0.88" />
        </>
      ) : null}
      <path d="M7 23 L16 6 L16 23 Z" fill="currentColor" fillOpacity="0.42" />
      <path d="M16 6 L25 12 L16 23 Z" fill="currentColor" fillOpacity="0.88" />
      <path
        d="M7 23 L16 23 L25 12"
        stroke="currentColor"
        strokeWidth="0.75"
        strokeLinejoin="round"
        opacity="0.35"
      />
      <circle cx="16" cy="6" r="1.15" fill="currentColor" fillOpacity="0.95" />
    </svg>
  );
}
