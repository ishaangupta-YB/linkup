import { useEffect, useState, type MouseEvent } from 'react'

const SECTIONS = [
  { id: 'ed-sec-profile', heading: 'ed-profile', label: 'Profile' },
  { id: 'ed-sec-links', heading: 'ed-links', label: 'Links' },
  { id: 'ed-sec-social', heading: 'ed-social', label: 'Socials' },
  { id: 'ed-sec-look', heading: 'ed-look', label: 'Look' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

/** Where a section counts as "current": just under the top bar and this strip. */
const LINE = 140

function currentSection(): SectionId {
  const doc = document.documentElement
  if (window.scrollY + window.innerHeight >= doc.scrollHeight - 4) return SECTIONS[SECTIONS.length - 1].id
  let current: SectionId = SECTIONS[0].id
  for (const s of SECTIONS) {
    const el = document.getElementById(s.id)
    if (el && el.getBoundingClientRect().top <= LINE) current = s.id
  }
  return current
}

/** Phones and narrow windows: a sticky strip under the top bar that jumps between the four panels. */
export function SectionJump() {
  const [active, setActive] = useState<SectionId>(SECTIONS[0].id)

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setActive(currentSection())
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  function jump(e: MouseEvent<HTMLAnchorElement>, s: (typeof SECTIONS)[number]) {
    const section = document.getElementById(s.id)
    if (!section) return
    e.preventDefault()
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    section.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
    document.getElementById(s.heading)?.focus({ preventScroll: true })
    setActive(s.id)
  }

  return (
    <nav className="editor__jump" aria-label="Editor sections">
      <ul className="editor__jump-list">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a className="editor__jump-link" href={`#${s.id}`} aria-current={active === s.id ? 'true' : undefined} onClick={(e) => jump(e, s)}>
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
