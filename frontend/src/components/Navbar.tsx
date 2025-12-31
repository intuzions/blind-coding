import { Link, useNavigate, useLocation, useParams } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { logout } from '../store/slices/authSlice'
import { FiLogOut, FiUser, FiHome, FiEye, FiArrowLeft, FiSave, FiGrid, FiSidebar } from 'react-icons/fi'
import { useState, useEffect } from 'react'
import './Navbar.css'

const Navbar = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId } = useParams<{ projectId?: string }>()
  const { isAuthenticated, user } = useAppSelector((state) => state.auth)
  const { currentProject } = useAppSelector((state) => state.projects)

  const isEditorPage = location.pathname.startsWith('/editor')
  
  // State for editor controls (synced via events)
  const [showGrid, setShowGrid] = useState(false)
  const [gridSize, setGridSize] = useState(20)
  const [showComponentLibrary, setShowComponentLibrary] = useState(true)
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(true)
  const [showPreview, setShowPreview] = useState(false)

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

  const getDisplayName = () => {
    if (user?.first_name || user?.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim()
    }
    return user?.username || 'User'
  }

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
              {isEditorPage && (
                <div className="navbar-editor-controls">
                  <button onClick={handleBack} className="navbar-btn navbar-btn-back">
                    <FiArrowLeft /> Back
                  </button>
                  {currentProject && (
                    <span className="navbar-project-name">{currentProject.name}</span>
                  )}
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
                    onClick={handlePreview}
                    className={`navbar-btn navbar-btn-preview ${showPreview ? 'active' : ''}`}
                  >
                    <FiEye /> {showPreview ? 'Hide Preview' : 'Show Preview'}
                  </button>
                  <button onClick={handleSave} className="navbar-btn navbar-btn-save">
                    <FiSave /> Save
                  </button>
                </div>
              )}
              <div className="navbar-user-info">
                <FiUser className="user-icon" />
                <div className="user-details">
                  <span className="user-name">{getDisplayName()}</span>
                </div>
              </div>
              <button className="logout-btn" onClick={handleLogout}>
                <FiLogOut /> Logout
              </button>
            </>
          ) : (
            <div className="navbar-auth-links">
              <Link to="/login" className="nav-link">Login</Link>
              <Link to="/register" className="nav-link nav-link-primary">Register</Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

export default Navbar

