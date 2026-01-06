import React, { useState } from 'react'
import { FiX, FiSave } from 'react-icons/fi'
import { Page, ComponentNode } from '../../types/editor'
import './SavePageModal.css'

interface SavePageModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (pageData: { name: string; description: string; page: Page; components: ComponentNode[] }) => void
  currentPage: Page | null
  pageComponents: ComponentNode[]
}

const SavePageModal: React.FC<SavePageModalProps> = ({ isOpen, onClose, onSave, currentPage, pageComponents }) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  React.useEffect(() => {
    if (isOpen && currentPage) {
      setName(currentPage.name || '')
      setDescription('')
    }
  }, [isOpen, currentPage])

  if (!isOpen || !currentPage) return null

  const handleSave = () => {
    if (!name.trim()) {
      alert('Please enter a name for the page')
      return
    }

    onSave({
      name: name.trim(),
      description: description.trim(),
      page: currentPage,
      components: pageComponents
    })

    // Reset form
    setName('')
    setDescription('')
    onClose()
  }

  return (
    <div className="save-page-modal-overlay" onClick={onClose}>
      <div className="save-page-modal" onClick={(e) => e.stopPropagation()}>
        <div className="save-page-modal-header">
          <h2>Save Page to Pre-built</h2>
          <button className="save-page-modal-close" onClick={onClose}>
            <FiX size={24} />
          </button>
        </div>
        <div className="save-page-modal-content">
          <div className="save-page-form-group">
            <label htmlFor="page-name">Page Name *</label>
            <input
              id="page-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter page name"
              className="save-page-input"
            />
          </div>
          <div className="save-page-form-group">
            <label htmlFor="page-description">Description</label>
            <textarea
              id="page-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter page description (optional)"
              className="save-page-textarea"
              rows={4}
            />
          </div>
          <div className="save-page-modal-footer">
            <button onClick={onClose} className="save-page-btn save-page-btn-cancel">
              Cancel
            </button>
            <button onClick={handleSave} className="save-page-btn save-page-btn-save">
              <FiSave /> Save Page
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SavePageModal


