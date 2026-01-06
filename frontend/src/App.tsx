import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from './hooks/redux'
import { getCurrentUser } from './store/slices/authSlice'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import InitialSetup from './pages/InitialSetup'
import SettingsPage from './pages/SettingsPage'
import ProtectedRoute from './components/ProtectedRoute'
import { ToastProvider } from './components/Toast'
import { ConfirmationProvider } from './components/ConfirmationModal'
import { MessageBoxProvider } from './components/MessageBox'
import { settingsAPI } from './api/settings'

// Component to handle root route redirect based on system configuration
const RootRedirect = () => {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkConfiguration = async () => {
      try {
        const response = await settingsAPI.checkConfigured()
        // Use the dedicated check-configured endpoint
        if (response.configured) {
          navigate('/login', { replace: true })
        } else {
          navigate('/initial-setup', { replace: true })
        }
      } catch (error) {
        // If API call fails, assume not configured and go to initial setup
        console.error('Error checking configuration:', error)
        navigate('/initial-setup', { replace: true })
      } finally {
        setChecking(false)
      }
    }

    checkConfiguration()
  }, [navigate])

  if (checking) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px'
      }}>
        Loading...
      </div>
    )
  }

  return null
}

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
        <MessageBoxProvider>
          <Routes>
            {/* Public routes without navbar */}
            <Route path="/initial-setup" element={<InitialSetup />} />
            <Route path="/settings" element={<SettingsPage />} />
            
            {/* Root route - redirect based on configuration */}
            <Route path="/" element={<RootRedirect />} />
            
            {/* Routes with navbar */}
            <Route
              path="/*"
              element={
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
                    </Routes>
                  </div>
                </div>
              }
            />
          </Routes>
        </MessageBoxProvider>
      </ConfirmationProvider>
    </ToastProvider>
  )
}

export default App
