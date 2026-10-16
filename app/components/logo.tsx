export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="2.75"
          y="2.75"
          width="18.5"
          height="18.5"
          rx="6.5"
          className="text-line-strong"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M12 6.9v5.1l3.3 2"
          className="text-accent"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="12"
          cy="12"
          r="1.2"
          className="text-accent"
          fill="currentColor"
        />
      </svg>
      <span className="font-display text-[16px] font-semibold tracking-tight">
        termin
      </span>
    </span>
  );
}
