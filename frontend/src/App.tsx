import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from './hooks/redux'
import { getCurrentUser } from './store/slices/authSlice'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import ProtectedRoute from './components/ProtectedRoute'
import { ToastProvider } from './components/Toast'
import { ConfirmationProvider } from './components/ConfirmationModal'

function App() {
  const dispatch = useAppDispatch()
  const { isAuthenticated } = useAppSelector((state) => state.auth)

  useEffect(() => {
    console.log('App component mounted')
    // Fetch current user if token exists
    if (localStorage.getItem('token')) {
      dispatch(getCurrentUser())
    }
  }, [dispatch])

  console.log('Rendering App, isAuthenticated:', isAuthenticated)

  return (
    <ToastProvider>
      <ConfirmationProvider>
        <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f5f5f5' }}>
          <Navbar />
          <div style={{ flex: 1, overflow: 'hidden' }}>
          <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
        />
        <Route
          path="/register"
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />}
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/editor/:projectId?"
          element={
            <ProtectedRoute>
              <Editor />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
        </Routes>
        </div>
        </div>
      </ConfirmationProvider>
    </ToastProvider>
  )
}

export default App
