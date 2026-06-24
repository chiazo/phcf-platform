import { Route, Routes } from 'react-router-dom'
import './App.css'
import LoginPage from './pages/LoginPage'
import AdminPage from './pages/AdminPage'
import Navigation from './pages/NavigationPage'

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
      <Route path="/login" element={<> <Navigation /> <LoginPage /> </>}/>
      <Route path="/admin" element={<><AdminPage/></>} />
    </Routes>
  )
}

export default App
