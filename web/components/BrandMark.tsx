/** A simplified cage silhouette for small navigation and interface placements. */
export default function BrandMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 72" fill="none" aria-hidden="true" className={`brand-symbol ${className}`}>
      <path d="M32 5c-8 0-11 7-11 16 0 11-4 15-10 23-6 8-6 17 1 22 7 4 14 0 20-5 6 5 13 9 20 5 7-5 7-14 1-22-6-8-10-12-10-23C43 12 40 5 32 5Z" fill="#152d40" stroke="#bdf5ff" strokeWidth="2.5" />
      <path d="m23 30-8 17 8 16 9-8 9 8 8-16-8-17M23 30l9-9 9 9M15 47h34M32 7v30" stroke="#8dd2e2" strokeWidth="1.5" />
      <path d="M25 8c-3 12 1 20-6 35-5 11-4 16-2 21M39 8c3 12-1 20 6 35 5 11 4 16 2 21" stroke="#e6f8ff" strokeWidth="2" />
      <path d="M20 22h24v6H20z" fill="#bdf5ff" />
      <rect x="24" y="44" width="16" height="15" rx="3" fill="#bdf5ff" />
      <path d="M27 44v-4a5 5 0 0 1 10 0v4" stroke="#f3faff" strokeWidth="2.5" />
      <path d="M32 49v5" stroke="#080d18" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
