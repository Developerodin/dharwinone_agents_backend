export function AxonLogo({ className }: { className?: string }) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M 256 256 L 128 256 L 0 128 L 128 128 Z" fill="#1B133C" />
      <path d="M 256 128 L 128 128 L 0 0 L 128 0 Z" fill="#1B133C" />
    </svg>
  );
}
