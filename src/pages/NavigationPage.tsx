import { Link } from 'react-router-dom'

function Navigation() {
  return (
    <nav>
      <Link to="/">Home</Link>
      <Link to="/login">Login</Link>
      <Link to="/admin">Admin Demo</Link>
    </nav>
  )
}

export default Navigation