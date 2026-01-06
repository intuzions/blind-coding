import React from 'react'
import './ProgressBar.css'

interface ProgressBarProps {
  progress: number // 0-100
  message?: string
  isVisible: boolean
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, message, isVisible }) => {
  if (!isVisible) return null

  return (
    <div className="progress-bar-overlay">
      <div className="progress-bar-container">
        <div className="progress-bar-header">
          <h3>Generating Application</h3>
          {message && <p className="progress-message">{message}</p>}
        </div>
        <div className="progress-bar-wrapper">
          <div className="progress-bar-track">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <div className="progress-percentage">{Math.round(progress)}%</div>
        </div>
        <div className="progress-steps">
          <div className={`progress-step ${progress >= 20 ? 'completed' : progress >= 10 ? 'active' : ''}`}>
            <span className="step-icon">{progress >= 20 ? '✓' : '○'}</span>
            <span className="step-label">Saving project data</span>
          </div>
          <div className={`progress-step ${progress >= 50 ? 'completed' : progress >= 30 ? 'active' : ''}`}>
            <span className="step-icon">{progress >= 50 ? '✓' : '○'}</span>
            <span className="step-label">Generating React components</span>
          </div>
          <div className={`progress-step ${progress >= 80 ? 'completed' : progress >= 60 ? 'active' : ''}`}>
            <span className="step-icon">{progress >= 80 ? '✓' : '○'}</span>
            <span className="step-label">Setting up FastAPI backend</span>
          </div>
          <div className={`progress-step ${progress >= 100 ? 'completed' : progress >= 90 ? 'active' : ''}`}>
            <span className="step-icon">{progress >= 100 ? '✓' : '○'}</span>
            <span className="step-label">Finalizing application</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProgressBar






