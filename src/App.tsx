import { Link, Route, Routes } from 'react-router-dom'
import './App.css'
import LoginPage from './pages/LoginPage'

function Navigation() {
  return (
    <nav>
      <Link to="/">Home</Link>
      <Link to="/login">Login</Link>
    </nav>
  )
}

function HomePage() {
  return (
    <>
      <Navigation />
      <h1>Prospect Heights Community Farm</h1>
    </>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/login"
        element={
          <>
            <Navigation />
            <LoginPage />
          </>
        }
      />
    </Routes>
  )
}

export default App
