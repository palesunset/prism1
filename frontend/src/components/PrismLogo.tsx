/** Three cyan delta-style triangles suggesting a simple prism. */
export function PrismLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M6 25 L16 4 L10 16 Z"
        fill="currentColor"
        fillOpacity="0.9"
        stroke="currentColor"
        strokeWidth="0.5"
      />
      <path
        d="M12 25 L22 4 L16 16 Z"
        fill="currentColor"
        fillOpacity="0.75"
        stroke="currentColor"
        strokeWidth="0.5"
      />
      <path
        d="M18 25 L28 4 L22 16 Z"
        fill="currentColor"
        fillOpacity="0.6"
        stroke="currentColor"
        strokeWidth="0.5"
      />
    </svg>
  );
}
