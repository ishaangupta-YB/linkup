import { useTitle } from '../../ui/hooks'
import { AskRows } from './AskRows'
import { Close } from './Close'
import { CountsTable } from './CountsTable'
import { Footer } from './Footer'
import { Hero } from './Hero'
import { LandingNav } from './LandingNav'
import { LookTray } from './LookTray'
import { MapSection } from './MapSection'
import './landing.css'

export default function LandingPage() {
  useTitle('LinkUp, one address for every link you share')
  return (
    <div className="landing grain">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <LandingNav />
      <main id="main">
        <Hero />
        <MapSection />
        <AskRows />
        <LookTray />
        <CountsTable />
        <section className="quiet" aria-labelledby="quiet-title">
          <div className="container">
            <h2 id="quiet-title" className="quiet__line">
              Your own visits are not counted unless you ask.
            </h2>
            <p className="lead quiet__sub">LinkUp also respects Do Not Track and Global Privacy Control.</p>
          </div>
        </section>
        <Close />
      </main>
      <Footer />
    </div>
  )
}
