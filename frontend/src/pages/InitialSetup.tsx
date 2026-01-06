import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { settingsAPI } from '../api/settings'
import { useToast } from '../components/Toast'
import './InitialSetup.css'

const InitialSetup: React.FC = () => {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // Check if system is already configured
    checkSystemStatus()
  }, [])

  const checkSystemStatus = async () => {
    try {
      // Use the dedicated check-configured endpoint
      const response = await settingsAPI.checkConfigured()
      
      // Check if app is configured
      if (response.configured) {
        // System is configured, redirect to login
        navigate('/login')
        return
      }
      
      // System not configured, show token input
      setChecking(false)
    } catch (error: any) {
      // If API call fails, show token input (expected for fresh installations)
      console.error('Error checking system status:', error)
      setChecking(false)
    }
  }

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!token.trim()) {
      showToast('Please enter a token', 'error')
      return
    }

    try {
      setLoading(true)
      
      // Verify token with backend and get temporary setup token
      const response = await settingsAPI.verifyToken(token.trim())
      
      if (response.valid && response.setup_token) {
        // Token is valid, store temporary token and redirect to settings page
        sessionStorage.setItem('setup_token', response.setup_token)
        navigate(`/settings?token=${response.setup_token}`)
      } else {
        showToast(response.message || 'Invalid token', 'error')
      }
    } catch (error: any) {
      console.error('Error verifying token:', error)
      showToast(error.response?.data?.message || 'Failed to verify token', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="initial-setup-container">
        <div className="initial-setup-card">
          <div className="initial-setup-loading">Checking system status...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="initial-setup-container">
      <div className="initial-setup-card">
        <div className="initial-setup-header">
          <h1>Initial Setup</h1>
          <p>Enter your system token to begin configuration</p>
        </div>
        
        <form onSubmit={handleTokenSubmit} className="initial-setup-form">
          <div className="initial-setup-form-group">
            <label htmlFor="token">System Token</label>
            <input
              id="token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter system token"
              required
              autoFocus
              disabled={loading}
            />
            <small className="initial-setup-hint">
              This token should match the SYSTEM_ID environment variable
            </small>
          </div>
          
          <button
            type="submit"
            className="initial-setup-submit"
            disabled={loading || !token.trim()}
          >
            {loading ? 'Verifying...' : 'Continue to Settings'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default InitialSetup

