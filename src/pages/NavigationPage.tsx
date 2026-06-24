import { Link } from 'react-router-dom'

function Navigation() {
  return (
    <nav>
      <Link to="/">Home</Link>
      <Link to="/login">Login</Link>
      <Link to="/admin">AdminDemo</Link>
    </nav>
  )
}

export default Navigation