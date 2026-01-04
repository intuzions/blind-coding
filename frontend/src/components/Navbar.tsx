import { Link, useNavigate, useLocation, useParams } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { logout } from '../store/slices/authSlice'
import { createProject } from '../store/slices/projectSlice'
import { FiLogOut, FiUser, FiHome, FiEye, FiSave, FiGrid, FiSidebar, FiUpload, FiPlus, FiX, FiPower, FiExternalLink, FiPackage, FiZap } from 'react-icons/fi'
import { useState, useEffect, useRef } from 'react'
import PreBuiltComponentsModal from './Editor/PreBuiltComponentsModal'
import './Navbar.css'

const Navbar = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId } = useParams<{ projectId?: string }>()
  const { isAuthenticated, user } = useAppSelector((state) => state.auth)
  const { currentProject } = useAppSelector((state) => state.projects)

  const isEditorPage = location.pathname.startsWith('/editor')
  const isDashboardPage = location.pathname === '/dashboard'
  
  // State for editor controls (synced via events)
  const [showGrid, setShowGrid] = useState(false)
  const [gridSize, setGridSize] = useState(20)
  const [showComponentLibrary, setShowComponentLibrary] = useState(true)
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  
  // State for create project modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [frontendFramework, setFrontendFramework] = useState<string>('')
  const [backendFramework, setBackendFramework] = useState<string>('')
  const [databaseType, setDatabaseType] = useState<string>('')
  const [databaseUrl, setDatabaseUrl] = useState<string>('')
  
  // State for user info popup
  const [showUserPopup, setShowUserPopup] = useState(false)
  const userPopupRef = useRef<HTMLDivElement>(null)
  
  // State for pre-built components modal
  const [showPreBuiltModal, setShowPreBuiltModal] = useState(false)

  // Listen for state updates from Editor
  useEffect(() => {
    if (!isEditorPage) return

    const handleGridToggle = (e: CustomEvent) => {
      setShowGrid(e.detail.showGrid)
    }
    const handleGridSizeChange = (e: CustomEvent) => {
      setGridSize(e.detail.gridSize)
    }
    const handleComponentLibraryToggle = (e: CustomEvent) => {
      setShowComponentLibrary(e.detail.show)
    }
    const handlePropertiesPanelToggle = (e: CustomEvent) => {
      setShowPropertiesPanel(e.detail.show)
    }
    const handlePreviewToggle = (e: CustomEvent) => {
      setShowPreview(e.detail.show)
    }

    window.addEventListener('editorGridToggle', handleGridToggle as EventListener)
    window.addEventListener('editorGridSizeChange', handleGridSizeChange as EventListener)
    window.addEventListener('editorComponentLibraryToggle', handleComponentLibraryToggle as EventListener)
    window.addEventListener('editorPropertiesPanelToggle', handlePropertiesPanelToggle as EventListener)
    window.addEventListener('editorPreviewToggle', handlePreviewToggle as EventListener)

    return () => {
      window.removeEventListener('editorGridToggle', handleGridToggle as EventListener)
      window.removeEventListener('editorGridSizeChange', handleGridSizeChange as EventListener)
      window.removeEventListener('editorComponentLibraryToggle', handleComponentLibraryToggle as EventListener)
      window.removeEventListener('editorPropertiesPanelToggle', handlePropertiesPanelToggle as EventListener)
      window.removeEventListener('editorPreviewToggle', handlePreviewToggle as EventListener)
    }
  }, [isEditorPage])

  const handleLogout = () => {
    dispatch(logout())
    navigate('/login')
  }

  const handleBack = () => {
    navigate('/dashboard')
  }

  const handleSave = () => {
    window.dispatchEvent(new CustomEvent('editorSave'))
  }

  const handlePreview = () => {
    const newState = !showPreview
    setShowPreview(newState)
    window.dispatchEvent(new CustomEvent('togglePreview', { detail: { show: newState } }))
  }

  const handleToggleComponentLibrary = () => {
    const newState = !showComponentLibrary
    setShowComponentLibrary(newState)
    window.dispatchEvent(new CustomEvent('toggleComponentLibrary', { detail: { show: newState } }))
  }

  const handleTogglePropertiesPanel = () => {
    const newState = !showPropertiesPanel
    setShowPropertiesPanel(newState)
    window.dispatchEvent(new CustomEvent('togglePropertiesPanel', { detail: { show: newState } }))
  }

  const handleToggleGrid = () => {
    const newState = !showGrid
    setShowGrid(newState)
    window.dispatchEvent(new CustomEvent('toggleGrid', { detail: { show: newState } }))
  }

  const handleGridSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value)
    setGridSize(newSize)
    window.dispatchEvent(new CustomEvent('gridSizeChange', { detail: { size: newSize } }))
  }

  const handleUpload = () => {
    window.dispatchEvent(new CustomEvent('openImageUpload'))
  }

  const handleOpenPreBuilt = () => {
    setShowPreBuiltModal(true)
  }

  const handleOpenAIAssistant = () => {
    // Open properties panel if closed
    if (!showPropertiesPanel) {
      setShowPropertiesPanel(true)
      window.dispatchEvent(new CustomEvent('togglePropertiesPanel', { detail: { show: true } }))
    }
    // Switch to AI Assistant tab
    window.dispatchEvent(new CustomEvent('openAIAssistant'))
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const result = await dispatch(
        createProject({ 
          name: projectName, 
          description: projectDescription,
          frontend_framework: frontendFramework || undefined,
          backend_framework: backendFramework || undefined,
          database_type: databaseType || undefined,
          database_url: databaseUrl || undefined
        })
      ).unwrap()
      setShowCreateModal(false)
      setProjectName('')
      setProjectDescription('')
      setFrontendFramework('')
      setBackendFramework('')
      setDatabaseType('')
      setDatabaseUrl('')
      navigate(`/editor/${result.id}`)
    } catch (err) {
      console.error('Failed to create project:', err)
    }
  }

  const getDisplayName = () => {
    if (user?.first_name || user?.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim()
    }
    return user?.username || 'User'
  }

  // Close user popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userPopupRef.current && !userPopupRef.current.contains(event.target as Node)) {
        setShowUserPopup(false)
      }
    }

    if (showUserPopup) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUserPopup])

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <Link to={isAuthenticated ? '/dashboard' : '/'}>
            <FiHome /> No-Code Platform
          </Link>
        </div>
        
        <div className="navbar-menu">
          {isAuthenticated ? (
            <>
              {isDashboardPage && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="navbar-btn navbar-btn-create"
                >
                  <FiPlus /> Create New Project
                </button>
              )}
              {isEditorPage && (
                <div className="navbar-editor-controls">
                  <button
                    onClick={handleToggleComponentLibrary}
                    className="navbar-btn navbar-btn-icon"
                    title={showComponentLibrary ? 'Hide Component Library' : 'Show Component Library'}
                  >
                    <FiSidebar />
                  </button>
                  <div className="navbar-grid-controls">
                    <button
                      onClick={handleToggleGrid}
                      className={`navbar-btn navbar-btn-icon ${showGrid ? 'active' : ''}`}
                      title={showGrid ? 'Hide Grid' : 'Show Grid'}
                    >
                      <FiGrid />
                    </button>
                    {showGrid && (
                      <div className="navbar-grid-size">
                        <input
                          type="range"
                          min="10"
                          max="50"
                          step="5"
                          value={gridSize}
                          onChange={handleGridSizeChange}
                          className="navbar-grid-slider"
                          title={`Grid Size: ${gridSize}px`}
                        />
                        <span className="navbar-grid-value">{gridSize}px</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleTogglePropertiesPanel}
                    className="navbar-btn navbar-btn-icon"
                    title={showPropertiesPanel ? 'Hide Properties Panel' : 'Show Properties Panel'}
                  >
                    <FiSidebar style={{ transform: 'scaleX(-1)' }} />
                  </button>
                  <button
                    onClick={handleOpenPreBuilt}
                    className="navbar-btn"
                    title="Pre-built Components"
                  >
                    <FiPackage /> Pre-built
                  </button>
                  <button
                    onClick={handleOpenAIAssistant}
                    className="navbar-btn"
                    title="AI Assistant"
                  >
                    <FiZap /> AI Assistant
                  </button>
                  <button
                    onClick={handleUpload}
                    className="navbar-btn navbar-btn-upload"
                    title="Upload Dashboard Image"
                  >
                    <FiUpload /> Upload Image
                  </button>
                  <button
                    onClick={handlePreview}
                    className={`navbar-btn navbar-btn-preview ${showPreview ? 'active' : ''}`}
                  >
                    <FiEye /> {showPreview ? 'Hide Preview' : 'Show Preview'}
                  </button>
                  <button onClick={handleSave} className="navbar-btn navbar-btn-save">
                    <FiSave /> Save
                  </button>
                  {currentProject?.application_url && (
                    <a
                      href={(() => {
                        // Add auth token and cache-busting parameter to URL for preview endpoint
                        const token = localStorage.getItem('token')
                        if (token && currentProject?.application_url) {
                          try {
                            const url = new URL(currentProject.application_url, window.location.origin)
                            url.searchParams.set('token', token)
                            // Add timestamp to prevent caching
                            url.searchParams.set('t', Date.now().toString())
                            return url.toString()
                          } catch (e) {
                            // If URL parsing fails, just append token and timestamp
                            return `${currentProject.application_url}?token=${encodeURIComponent(token)}&t=${Date.now()}`
                          }
                        }
                        return currentProject.application_url
                      })()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="navbar-btn navbar-btn-link"
                      title="Open Application"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', padding: '0.5rem 1rem', borderRadius: '4px', background: '#667eea', color: 'white' }}
                    >
                      <FiExternalLink /> Open App
                    </a>
                  )}
                </div>
              )}
              {isEditorPage && (
                <button onClick={handleBack} className="navbar-btn-close" title="Close Editor">
                  <FiX />
                </button>
              )}
              <button className="logout-btn" onClick={handleLogout} title="Logout">
                <FiPower />
              </button>
              <div className="navbar-user-info-wrapper" ref={userPopupRef}>
                <button
                  className="navbar-user-icon-btn"
                  onClick={() => setShowUserPopup(!showUserPopup)}
                  title="User Info"
                >
                  <FiUser />
                </button>
                {showUserPopup && (
                  <div className="navbar-user-popup">
                    <div className="user-popup-header">
                      <h3>User Information</h3>
                      <button
                        className="user-popup-close"
                        onClick={() => setShowUserPopup(false)}
                      >
                        <FiX />
                      </button>
                    </div>
                    <div className="user-popup-content">
                      <div className="user-popup-item">
                        <span className="user-popup-label">Username:</span>
                        <span className="user-popup-value">{user?.username || 'N/A'}</span>
                      </div>
                      <div className="user-popup-item">
                        <span className="user-popup-label">Email:</span>
                        <span className="user-popup-value">{user?.email || 'N/A'}</span>
                      </div>
                      {user?.first_name && (
                        <div className="user-popup-item">
                          <span className="user-popup-label">First Name:</span>
                          <span className="user-popup-value">{user.first_name}</span>
                        </div>
                      )}
                      {user?.last_name && (
                        <div className="user-popup-item">
                          <span className="user-popup-label">Last Name:</span>
                          <span className="user-popup-value">{user.last_name}</span>
                        </div>
                      )}
                      {user?.personal_website && (
                        <div className="user-popup-item">
                          <span className="user-popup-label">Website:</span>
                          <span className="user-popup-value">
                            <a href={user.personal_website} target="_blank" rel="noopener noreferrer">
                              {user.personal_website}
                            </a>
                          </span>
                        </div>
                      )}
                      <div className="user-popup-item">
                        <span className="user-popup-label">Display Name:</span>
                        <span className="user-popup-value">{getDisplayName()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="navbar-auth-links">
              <Link to="/login" className="nav-link">Login</Link>
              <Link to="/register" className="nav-link nav-link-primary">Register</Link>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="navbar-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="navbar-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="navbar-modal-header">
              <h2>Create New Project</h2>
              <button 
                className="navbar-modal-close" 
                onClick={() => setShowCreateModal(false)}
              >
                <FiX size={24} />
              </button>
            </div>
            <form onSubmit={handleCreateProject}>
              <div className="navbar-form-group">
                <label>Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  required
                  autoFocus
                  placeholder="Enter project name"
                />
              </div>
              <div className="navbar-form-group">
                <label>Description (optional)</label>
                <textarea
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  rows={3}
                  placeholder="Enter project description"
                />
              </div>
              <div className="navbar-form-group">
                <label>Frontend Framework (optional)</label>
                <select
                  value={frontendFramework}
                  onChange={(e) => setFrontendFramework(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  <option value="">None</option>
                  <option value="react">React</option>
                  <option value="vue">Vue.js</option>
                  <option value="angular">Angular</option>
                </select>
              </div>
              <div className="navbar-form-group">
                <label>Backend Framework (optional)</label>
                <select
                  value={backendFramework}
                  onChange={(e) => setBackendFramework(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  <option value="">None</option>
                  <option value="fastapi">FastAPI</option>
                  <option value="express">Express.js</option>
                  <option value="django">Django</option>
                </select>
              </div>
              <div className="navbar-form-group">
                <label>Database Type (optional)</label>
                <select
                  value={databaseType}
                  onChange={(e) => setDatabaseType(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  <option value="">None</option>
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="sqlite">SQLite</option>
                  <option value="mongodb">MongoDB</option>
                </select>
              </div>
              {databaseType && (
                <div className="navbar-form-group">
                  <label>Database URL</label>
                  <input
                    type="text"
                    value={databaseUrl}
                    onChange={(e) => setDatabaseUrl(e.target.value)}
                    placeholder={
                      databaseType === 'postgresql' 
                        ? 'postgresql://user:password@localhost:5432/dbname'
                        : databaseType === 'mysql'
                        ? 'mysql://user:password@localhost:3306/dbname'
                        : databaseType === 'sqlite'
                        ? 'sqlite:///path/to/database.db'
                        : databaseType === 'mongodb'
                        ? 'mongodb://user:password@localhost:27017/dbname'
                        : 'Enter database connection URL'
                    }
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                  <small style={{ color: '#666', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                    {databaseType === 'postgresql' && 'Example: postgresql://user:password@localhost:5432/dbname'}
                    {databaseType === 'mysql' && 'Example: mysql://user:password@localhost:3306/dbname'}
                    {databaseType === 'sqlite' && 'Example: sqlite:///./database.db'}
                    {databaseType === 'mongodb' && 'Example: mongodb://user:password@localhost:27017/dbname'}
                  </small>
                </div>
              )}
              <div className="navbar-modal-actions">
                <button type="button" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditorPage && (
        <PreBuiltComponentsModal 
          isOpen={showPreBuiltModal} 
          onClose={() => setShowPreBuiltModal(false)} 
        />
      )}
    </nav>
  )
}

export default Navbar

