import React, { createContext, useContext, useState, useCallback } from 'react'
import { FiX, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi'
import './ConfirmationModal.css'

export interface ConfirmationOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmButtonStyle?: 'primary' | 'danger' | 'success'
  onConfirm: () => void
  onCancel?: () => void
}

interface ConfirmationContextType {
  confirm: (options: ConfirmationOptions) => void
}

const ConfirmationContext = createContext<ConfirmationContextType | undefined>(undefined)

export const useConfirmation = () => {
  const context = useContext(ConfirmationContext)
  if (!context) {
    throw new Error('useConfirmation must be used within ConfirmationProvider')
  }
  return context
}

export const ConfirmationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmationOptions | null>(null)

  const confirm = useCallback((opts: ConfirmationOptions) => {
    setOptions(opts)
    setIsOpen(true)
  }, [])

  const handleConfirm = () => {
    if (options?.onConfirm) {
      options.onConfirm()
    }
    setIsOpen(false)
    setOptions(null)
  }

  const handleCancel = () => {
    if (options?.onCancel) {
      options.onCancel()
    }
    setIsOpen(false)
    setOptions(null)
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel()
    }
  }

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}
      {isOpen && options && (
        <div className="confirmation-modal-overlay" onClick={handleOverlayClick}>
          <div className="confirmation-modal">
            <div className="confirmation-modal-header">
              <div className="confirmation-modal-icon">
                {options.confirmButtonStyle === 'danger' ? (
                  <FiAlertTriangle />
                ) : (
                  <FiCheckCircle />
                )}
              </div>
              <h3 className="confirmation-modal-title">
                {options.title || 'Confirm Action'}
              </h3>
              <button
                className="confirmation-modal-close"
                onClick={handleCancel}
                aria-label="Close"
              >
                <FiX />
              </button>
            </div>
            <div className="confirmation-modal-body">
              <p className="confirmation-modal-message">{options.message}</p>
            </div>
            <div className="confirmation-modal-footer">
              <button
                className="confirmation-modal-button confirmation-modal-button-cancel"
                onClick={handleCancel}
              >
                {options.cancelText || 'Cancel'}
              </button>
              <button
                className={`confirmation-modal-button confirmation-modal-button-confirm confirmation-modal-button-${options.confirmButtonStyle || 'primary'}`}
                onClick={handleConfirm}
              >
                {options.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmationContext.Provider>
  )
}




