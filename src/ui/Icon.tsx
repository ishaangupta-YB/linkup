import type { SVGProps } from 'react'

/** Line icons on a 24px grid, 1.75 stroke, drawn in currentColor. */
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  external: 'M14 5h5v5M19 5l-8 8M18 14v5H5V6h5',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4.2M6.6 6.6A17 17 0 002 12s3.5 7 10 7a9.7 9.7 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  share: 'M12 15V3M7 8l5-5 5 5M5 12v8h14v-8',
  pin: 'M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12zM12 11a2 2 0 100-4 2 2 0 000 4z',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  alert: 'M12 8v5M12 16h.01M12 21a9 9 0 100-18 9 9 0 000 18z',
  phone: 'M8 3h8v18H8zM11 18h2',
  monitor: 'M3 5h18v12H3zM8 21h8M12 17v4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  duplicate: 'M8 8h12v12H8zM4 16V4h12',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
  instagram: 'M7 3h10a4 4 0 014 4v10a4 4 0 01-4 4H7a4 4 0 01-4-4V7a4 4 0 014-4zM12 16a4 4 0 100-8 4 4 0 000 8zM17.5 6.5h.01',
  linkedin: 'M4 9h4v11H4zM6 4.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11 9h4v1.6c.6-1 1.8-1.8 3.3-1.8 2.4 0 3.7 1.5 3.7 4.4V20h-4v-6c0-1.4-.5-2.2-1.7-2.2S15 12.7 15 14v6h-4z',
  youtube: 'M21.5 7.2a2.6 2.6 0 00-1.8-1.8C18 5 12 5 12 5s-6 0-7.7.4a2.6 2.6 0 00-1.8 1.8C2 8.9 2 12 2 12s0 3.1.5 4.8a2.6 2.6 0 001.8 1.8C6 19 12 19 12 19s6 0 7.7-.4a2.6 2.6 0 001.8-1.8c.5-1.7.5-4.8.5-4.8s0-3.1-.5-4.8zM10 15V9l5 3z',
  whatsapp: 'M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-4-1.1zM9 9c0 3 3 6 6 6l1-1.5-2-1-1 1c-1-.4-2.1-1.5-2.5-2.5l1-1-1-2z',
  x: 'M4 4l16 16M20 4L4 20',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  layout: 'M4 4h16v16H4zM4 10h16M10 10v10',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 5v6h-6',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
