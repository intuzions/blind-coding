import React, { useState, useEffect } from 'react'
import { FiX, FiSave, FiPlus, FiTrash2 } from 'react-icons/fi'
import { settingsAPI, SettingsRequest } from '../api/settings'
import { useToast } from './Toast'
import './SettingsModal.css'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
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
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])
  
  const loadSettings = async () => {
    try {
      setLoading(true)
      const settings = await settingsAPI.getSettings()
      
      // Load cloud settings
      setCloudProvider(settings.cloud_provider || '')
      setCloudRegion(settings.cloud_region || '')
      setCloudAccessKey(settings.cloud_access_key || '')
      setCloudSecretKey(settings.cloud_secret_key || '')
      
      // Load database credentials
      setDatabaseType(settings.database_type || '')
      setDatabaseUsername(settings.database_username || '')
      setDatabasePassword(settings.database_password || '')
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
            // Check if value is an object with value and isPublic
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
      // If settings don't exist yet, start with empty values
      if (error.response?.status !== 404) {
        // Handle FastAPI validation errors (array of error objects)
        let errorMessage = 'Failed to load settings'
        if (error.response?.data?.detail) {
          const detail = error.response.data.detail
          if (Array.isArray(detail)) {
            // FastAPI validation errors are arrays
            errorMessage = detail.map((err: any) => {
              const field = err.loc ? err.loc.join('.') : 'field'
              return `${field}: ${err.msg || 'Invalid value'}`
            }).join(', ')
          } else if (typeof detail === 'string') {
            errorMessage = detail
          } else if (typeof detail === 'object') {
            // Try to extract a meaningful message
            errorMessage = detail.message || detail.msg || JSON.stringify(detail)
          }
        } else if (error.message) {
          errorMessage = error.message
        }
        
        showToast(errorMessage, 'error')
      }
    } finally {
      setLoading(false)
    }
  }
  
  const handleSave = async () => {
    try {
      setSaving(true)
      
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
      
      // Send all values, including empty strings, to properly update/clear fields
      // Ensure database_port is always a string (convert number to string if needed)
      const request: SettingsRequest = {
        cloud_provider: cloudProvider || '',
        cloud_region: cloudRegion || '',
        cloud_access_key: cloudAccessKey || '',
        cloud_secret_key: cloudSecretKey || '',
        database_type: databaseType || '',
        database_username: databaseUsername || '',
        database_password: databasePassword || '',
        database_host: databaseHost || '',
        database_port: databasePort ? String(databasePort) : '',
        database_name: databaseName || '',
        environment_variables: Object.keys(filteredEnvVars).length > 0 ? filteredEnvVars : {}
      }
      
      const response = await settingsAPI.saveSettings(request)
      
      if (response.success) {
        showToast('Settings saved successfully', 'success')
        onClose()
      } else {
        showToast(response.message || 'Failed to save settings', 'error')
      }
    } catch (error: any) {
      console.error('Error saving settings:', error)
      
      // Handle FastAPI validation errors (array of error objects)
      let errorMessage = 'Failed to save settings'
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail
        if (Array.isArray(detail)) {
          // FastAPI validation errors are arrays
          errorMessage = detail.map((err: any) => {
            const field = err.loc ? err.loc.join('.') : 'field'
            return `${field}: ${err.msg || 'Invalid value'}`
          }).join(', ')
        } else if (typeof detail === 'string') {
          errorMessage = detail
        } else if (typeof detail === 'object') {
          // Try to extract a meaningful message
          errorMessage = detail.message || detail.msg || JSON.stringify(detail)
        }
      } else if (error.message) {
        errorMessage = error.message
      }
      
      showToast(errorMessage, 'error')
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
  
  if (!isOpen) return null
  
  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>No-Code Application Settings</h2>
          <button className="settings-modal-close" onClick={onClose}>
            <FiX />
          </button>
        </div>
        
        <div className="settings-modal-body">
          {loading ? (
            <div className="settings-loading">Loading settings...</div>
          ) : (
            <div className="settings-groups-container">
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
                        // Set default port based on database type
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
            onClick={onClose}
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

export default SettingsModal
