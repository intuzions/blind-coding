import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { fetchProjects, deleteProject } from '../store/slices/projectSlice'
import { FiTrash2, FiEdit, FiSettings, FiGlobe, FiUser } from 'react-icons/fi'
import { useConfirmation } from '../components/ConfirmationModal'
import { useToast } from '../components/Toast'
import './Dashboard.css'

const Dashboard = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { projects, loading } = useAppSelector((state) => state.projects)
  const { user } = useAppSelector((state) => state.auth)
  const { confirm } = useConfirmation()
  const { showToast } = useToast()

  useEffect(() => {
    dispatch(fetchProjects())
  }, [dispatch])

  const handleDeleteProject = async (id: number) => {
    confirm({
      title: 'Delete Project',
      message: 'Are you sure you want to delete this project? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmButtonStyle: 'danger',
      onConfirm: async () => {
        try {
          await dispatch(deleteProject(id)).unwrap()
          showToast('Project deleted successfully', 'success')
        } catch (error) {
          showToast('Failed to delete project', 'error')
        }
      },
    })
  }

  const handleSettings = (e: React.MouseEvent, projectId: number) => {
    e.stopPropagation()
    // TODO: Open settings modal or navigate to settings page
    console.log('Settings for project:', projectId)
    // For now, you can navigate to a settings page or open a modal
    // navigate(`/project/${projectId}/settings`)
  }

  const handlePublish = (e: React.MouseEvent, projectId: number) => {
    e.stopPropagation()
    // TODO: Implement publish functionality
    console.log('Publish project:', projectId)
    // This could open a publish modal, generate a public URL, etc.
    // Toast will be shown if needed
  }

  const getDisplayName = () => {
    if (user?.first_name || user?.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim()
    }
    return user?.username || 'Unknown User'
  }

  return (
    <div className="dashboard">
      <div className="dashboard-content">
        {loading ? (
          <div className="loading">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <p>No projects yet. Create your first project to get started!</p>
          </div>
        ) : (
          <div className="projects-grid">
            {projects.map((project) => (
              <div 
                key={project.id} 
                className="project-card"
                onClick={() => navigate(`/editor/${project.id}`)}
              >
                <div className="project-card-header">
                  <h3>{project.name}</h3>
                </div>
                {project.description && <p>{project.description}</p>}
                <div className="project-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => navigate(`/editor/${project.id}`)}
                    className="edit-btn"
                  >
                    <FiEdit /> Edit
                  </button>
                  <button
                    onClick={(e) => handleSettings(e, project.id)}
                    className="settings-btn"
                  >
                    <FiSettings /> Settings
                  </button>
                  <button
                    onClick={(e) => handlePublish(e, project.id)}
                    className="publish-btn"
                  >
                    <FiGlobe /> Publish
                  </button>
                  <button
                    onClick={() => handleDeleteProject(project.id)}
                    className="delete-btn"
                  >
                    <FiTrash2 /> Delete
                  </button>
                </div>
                <div className="project-meta">
                  <div className="project-meta-item">
                    <FiUser className="meta-icon" />
                    <small>Created by: {getDisplayName()}</small>
                  </div>
                  <div className="project-meta-item">
                    <small>
                      📅 {new Date(project.created_at).toLocaleDateString()}
                    </small>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard

