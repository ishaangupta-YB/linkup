import { useLocation } from 'react-router'
import { useTitle } from '../../ui/hooks'
import { Missing } from './Missing'

/** Any path the app does not know. */
export default function NotFoundPage() {
  useTitle('Page not found - LinkUp')
  const { pathname } = useLocation()
  return (
    <Missing title="Nothing at this address" primary={{ to: '/', label: 'Go to the home page' }} secondary={{ to: '/signup', label: 'Make your own page' }}>
      <span className="mono">{pathname}</span> is not a page on LinkUp. The link may be mistyped, or the page may have moved.
    </Missing>
  )
}
