import { Link, Route, Routes } from 'react-router-dom'
import './App.css'
import LoginPage from './pages/LoginPage'
import UserDataFullDisplay from './pages/userDataFullDisplay'

function Navigation() {
  return (
    <nav>
      <Link to="/">Home</Link>
      <Link to="/login">Login</Link>
      <Link to="/userData">All Users</Link>
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
      <Route
        path="/userData"
        element={
          <>
            <Navigation />
            <UserDataFullDisplay />
          </>
        }
      />
    </Routes>
  )
}

export default App
