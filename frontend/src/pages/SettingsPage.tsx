import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FiX, FiSave, FiPlus, FiTrash2 } from 'react-icons/fi'
import { settingsAPI, SettingsRequest } from '../api/settings'
import { useToast } from '../components/Toast'
import '../components/SettingsModal.css'
import './SettingsPage.css'

const SettingsPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tokenValid, setTokenValid] = useState(false)
  const [checkingToken, setCheckingToken] = useState(true)
  
  // Admin credentials
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  
  // Cloud settings
  const [cloudProvider, setCloudProvider] = useState('')
  const [cloudRegion, setCloudRegion] = useState('')
  const [cloudAccessKey, setCloudAccessKey] = useState('')
  const [cloudSecretKey, setCloudSecretKey] = useState('')
  
  // Database credentials
  const [databaseType, setDatabaseType] = useState('')
  const [databaseUsername, setDatabaseUsername] = useState('')
  const [databasePassword, setDatabasePassword] = useState('')
  const [databaseHost, setDatabaseHost] = useState('localhost')
  const [databasePort, setDatabasePort] = useState('')
  const [databaseName, setDatabaseName] = useState('')
  
  // Apps environment variables
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string; isPublic: boolean }>>([
    { key: '', value: '', isPublic: false }
  ])
  
  useEffect(() => {
    // Get token from URL or sessionStorage
    const tokenFromUrl = searchParams.get('token')
    const tokenFromStorage = sessionStorage.getItem('setup_token')
    const setupToken = tokenFromUrl || tokenFromStorage
    
    if (!setupToken) {
      // No token, redirect to initial setup
      navigate('/initial-setup')
      return
    }
    
    // Validate token with backend
    validateToken(setupToken)
  }, [navigate, searchParams])
  
  const validateToken = async (token: string) => {
    try {
      setCheckingToken(true)
      const response = await settingsAPI.validateSetupToken(token)
      
      if (response.valid) {
        setTokenValid(true)
        // Store token in sessionStorage if from URL
        if (searchParams.get('token')) {
          sessionStorage.setItem('setup_token', token)
        }
        // Load settings
        loadSettings()
        
        // Set up token expiry check (check every 30 seconds)
        const checkInterval = setInterval(async () => {
          const isValid = await settingsAPI.validateSetupToken(token)
          if (!isValid.valid) {
            clearInterval(checkInterval)
            showToast('Your session has expired. Please start over.', 'error')
            sessionStorage.removeItem('setup_token')
            navigate('/initial-setup')
          }
        }, 30000) // Check every 30 seconds
        
        // Cleanup interval on unmount
        return () => clearInterval(checkInterval)
      } else {
        // Token invalid or expired
        showToast(response.message || 'Token expired. Please start over.', 'error')
        sessionStorage.removeItem('setup_token')
        navigate('/initial-setup')
      }
    } catch (error: any) {
      console.error('Error validating token:', error)
      showToast('Failed to validate token', 'error')
      sessionStorage.removeItem('setup_token')
      navigate('/initial-setup')
    } finally {
      setCheckingToken(false)
    }
  }
  
  const loadSettings = async () => {
    try {
      setLoading(true)
      const settings = await settingsAPI.getSettings()
      
      // Load admin credentials
      setAdminEmail(settings.admin_email || '')
      setAdminPassword('') // Don't load password for security
      
      // Load cloud settings
      setCloudProvider(settings.cloud_provider || '')
      setCloudRegion(settings.cloud_region || '')
      setCloudAccessKey(settings.cloud_access_key || '')
      setCloudSecretKey(settings.cloud_secret_key || '')
      
      // Load database credentials
      setDatabaseType(settings.database_type || '')
      setDatabaseUsername(settings.database_username || '')
      setDatabasePassword('') // Don't load password for security
      setDatabaseHost(settings.database_host || 'localhost')
      setDatabasePort(settings.database_port || '')
      setDatabaseName(settings.database_name || '')
      
      // Set default port based on database type if not set
      if (!settings.database_port && settings.database_type) {
        const defaultPorts: Record<string, string> = {
          'postgresql': '5432',
          'mysql': '3306',
          'mongodb': '27017',
          'sqlite': ''
        }
        setDatabasePort(defaultPorts[settings.database_type] || '')
      }
      
      // Load apps environment variables
      if (settings.environment_variables && Object.keys(settings.environment_variables).length > 0) {
        setEnvVars(
          Object.entries(settings.environment_variables).map(([key, value]) => {
            if (typeof value === 'object' && value !== null && 'value' in value) {
              return { 
                key, 
                value: (value as any).value || '', 
                isPublic: (value as any).isPublic || false 
              }
            }
            return { key, value: String(value), isPublic: false }
          })
        )
      } else {
        setEnvVars([{ key: '', value: '', isPublic: false }])
      }
    } catch (error: any) {
      console.error('Error loading settings:', error)
      if (error.response?.status !== 404) {
        showToast('Failed to load settings', 'error')
      }
    } finally {
      setLoading(false)
    }
  }
  
  const handleSave = async () => {
    try {
      setSaving(true)
      
      // Validate admin email and password if this is initial setup
      if (!adminEmail || !adminPassword) {
        showToast('Please provide admin email and password', 'error')
        return
      }
      
      // Filter out empty env vars and include public flag
      const filteredEnvVars = envVars
        .filter(env => env.key.trim() !== '')
        .reduce((acc, env) => {
          acc[env.key.trim()] = {
            value: env.value.trim(),
            isPublic: env.isPublic
          }
          return acc
        }, {} as Record<string, { value: string; isPublic: boolean }>)
      
      const request: SettingsRequest = {
        admin_email: adminEmail || undefined,
        admin_password: adminPassword || undefined,
        cloud_provider: cloudProvider || undefined,
        cloud_region: cloudRegion || undefined,
        cloud_access_key: cloudAccessKey || undefined,
        cloud_secret_key: cloudSecretKey || undefined,
        database_type: databaseType || undefined,
        database_username: databaseUsername || undefined,
        database_password: databasePassword || undefined,
        database_host: databaseHost || undefined,
        database_port: databasePort || undefined,
        database_name: databaseName || undefined,
        environment_variables: Object.keys(filteredEnvVars).length > 0 ? filteredEnvVars : undefined
      }
      
      const response = await settingsAPI.saveSettings(request)
      
      if (response.success) {
        showToast('Settings saved successfully', 'success')
        // Clear setup token and redirect to login
        sessionStorage.removeItem('setup_token')
        // Clear token from backend
        const token = searchParams.get('token') || sessionStorage.getItem('setup_token')
        if (token) {
          try {
            await settingsAPI.invalidateSetupToken(token)
          } catch (e) {
            // Ignore errors
          }
        }
        setTimeout(() => {
          navigate('/login')
        }, 1500)
      } else {
        showToast(response.message || 'Failed to save settings', 'error')
      }
    } catch (error: any) {
      console.error('Error saving settings:', error)
      showToast(error.response?.data?.detail || 'Failed to save settings', 'error')
    } finally {
      setSaving(false)
    }
  }
  
  const handleAddEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '', isPublic: false }])
  }
  
  const handleRemoveEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index))
  }
  
  const handleEnvVarChange = (index: number, field: 'key' | 'value' | 'isPublic', value: string | boolean) => {
    const updated = [...envVars]
    updated[index] = { ...updated[index], [field]: value }
    setEnvVars(updated)
  }
  
  return (
    <div className="settings-page-container">
      <div className="settings-modal" style={{ maxWidth: '100%', height: '90vh', margin: '20px' }}>
        <div className="settings-modal-header">
          <h2>No-Code Application Settings</h2>
          <button className="settings-modal-close" onClick={() => navigate('/initial-setup')}>
            <FiX />
          </button>
        </div>
        
        <div className="settings-modal-body">
          {loading ? (
            <div className="settings-loading">Loading settings...</div>
          ) : (
            <div className="settings-groups-container">
              {/* Admin Credentials Section */}
              <div className="settings-group">
                <h3 className="settings-group-title">Admin</h3>
                <div className="settings-group-content">
                  <div className="settings-form-group">
                    <label>Admin Email</label>
                    <input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="Enter admin email"
                      required
                    />
                  </div>
                  
                  <div className="settings-form-group">
                    <label>Admin Password</label>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Enter admin password"
                      required
                    />
                  </div>
                </div>
              </div>
              
              {/* Cloud Settings Section */}
              <div className="settings-group">
                <h3 className="settings-group-title">Cloud</h3>
                <div className="settings-group-content">
                  <div className="settings-form-group">
                    <label>Cloud Provider</label>
                    <select
                      value={cloudProvider}
                      onChange={(e) => setCloudProvider(e.target.value)}
                      className="settings-select"
                    >
                      <option value="">Select Provider</option>
                      <option value="aws">AWS</option>
                      <option value="azure">Azure</option>
                      <option value="gcp">Google Cloud Platform</option>
                      <option value="digitalocean">DigitalOcean</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  
                  <div className="settings-form-group">
                    <label>Cloud Region</label>
                    <input
                      type="text"
                      value={cloudRegion}
                      onChange={(e) => setCloudRegion(e.target.value)}
                      placeholder="e.g., us-east-1, eu-west-1"
                    />
                  </div>
                  
                  <div className="settings-form-group">
                    <label>Access Key</label>
                    <input
                      type="text"
                      value={cloudAccessKey}
                      onChange={(e) => setCloudAccessKey(e.target.value)}
                      placeholder="Enter cloud access key"
                    />
                  </div>
                  
                  <div className="settings-form-group">
                    <label>Secret Key</label>
                    <input
                      type="password"
                      value={cloudSecretKey}
                      onChange={(e) => setCloudSecretKey(e.target.value)}
                      placeholder="Enter cloud secret key"
                    />
                  </div>
                </div>
              </div>
              
              {/* Database Credentials Section */}
              <div className="settings-group">
                <h3 className="settings-group-title">Database</h3>
                <div className="settings-group-content">
                  <div className="settings-form-group">
                    <label>Database Type</label>
                    <select
                      value={databaseType}
                      onChange={(e) => {
                        setDatabaseType(e.target.value)
                        const defaultPorts: Record<string, string> = {
                          'postgresql': '5432',
                          'mysql': '3306',
                          'mongodb': '27017',
                          'sqlite': ''
                        }
                        if (defaultPorts[e.target.value] && !databasePort) {
                          setDatabasePort(defaultPorts[e.target.value])
                        }
                      }}
                      className="settings-select"
                    >
                      <option value="">Select Database</option>
                      <option value="postgresql">PostgreSQL</option>
                      <option value="mysql">MySQL</option>
                      <option value="mongodb">MongoDB</option>
                      <option value="sqlite">SQLite</option>
                      <option value="mssql">Microsoft SQL Server</option>
                      <option value="oracle">Oracle</option>
                    </select>
                  </div>
                  
                  {databaseType && databaseType !== 'sqlite' && (
                    <>
                      <div className="settings-form-group">
                        <label>Database Username</label>
                        <input
                          type="text"
                          value={databaseUsername}
                          onChange={(e) => setDatabaseUsername(e.target.value)}
                          placeholder="Enter database username"
                        />
                      </div>
                      
                      <div className="settings-form-group">
                        <label>Database Password</label>
                        <input
                          type="password"
                          value={databasePassword}
                          onChange={(e) => setDatabasePassword(e.target.value)}
                          placeholder="Enter database password"
                        />
                      </div>
                      
                      <div className="settings-form-group">
                        <label>Database Host</label>
                        <input
                          type="text"
                          value={databaseHost}
                          onChange={(e) => setDatabaseHost(e.target.value)}
                          placeholder="localhost"
                        />
                      </div>
                      
                      <div className="settings-form-group">
                        <label>Database Port</label>
                        <input
                          type="text"
                          value={databasePort}
                          onChange={(e) => setDatabasePort(e.target.value)}
                          placeholder="5432, 3306, 27017, etc."
                        />
                      </div>
                    </>
                  )}
                  
                  <div className="settings-form-group">
                    <label>Database Name</label>
                    <input
                      type="text"
                      value={databaseName}
                      onChange={(e) => setDatabaseName(e.target.value)}
                      placeholder={databaseType === 'sqlite' ? "Enter database file path" : "Enter database name"}
                    />
                  </div>
                </div>
              </div>
              
              {/* Apps Environment Variables Section */}
              <div className="settings-group">
                <div className="settings-section-header">
                  <h3 className="settings-group-title">Apps</h3>
                  <button
                    type="button"
                    onClick={handleAddEnvVar}
                    className="settings-add-env-btn"
                  >
                    <FiPlus /> Add Variable
                  </button>
                </div>
                <div className="settings-group-content">
                  <div className="env-vars-list">
                    {envVars.map((env, index) => (
                      <div key={index} className="env-var-row">
                        <input
                          type="text"
                          value={env.key}
                          onChange={(e) => handleEnvVarChange(index, 'key', e.target.value)}
                          placeholder="Variable name (e.g., API_KEY)"
                          className="env-var-key"
                        />
                        <input
                          type="text"
                          value={env.value}
                          onChange={(e) => handleEnvVarChange(index, 'value', e.target.value)}
                          placeholder="Variable value"
                          className="env-var-value"
                        />
                        <label className="env-var-public-checkbox">
                          <input
                            type="checkbox"
                            checked={env.isPublic}
                            onChange={(e) => handleEnvVarChange(index, 'isPublic', e.target.checked)}
                          />
                          <span>Public</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveEnvVar(index)}
                          className="env-var-remove"
                          disabled={envVars.length === 1}
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  <small className="settings-hint">
                    Environment variables will be saved to .env file in the project root. 
                    Public variables can be accessed by frontend applications.
                  </small>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="settings-modal-footer">
          <button
            className="settings-btn-cancel"
            onClick={() => navigate('/initial-setup')}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="settings-btn-save"
            onClick={handleSave}
            disabled={saving || loading}
          >
            <FiSave /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage

