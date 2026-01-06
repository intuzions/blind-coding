import React, { createContext, useContext, useState, useCallback } from 'react'
import { FiX, FiCheckCircle, FiAlertCircle, FiInfo, FiExternalLink } from 'react-icons/fi'
import './MessageBox.css'

export type MessageBoxType = 'success' | 'error' | 'info' | 'warning'

export interface MessageBoxOptions {
  title?: string
  message: string
  type?: MessageBoxType
  buttonText?: string
  onButtonClick?: () => void
  showButton?: boolean
  applicationUrl?: string
  backendUrl?: string
}

interface MessageBoxContextType {
  showMessage: (options: MessageBoxOptions) => void
}

const MessageBoxContext = createContext<MessageBoxContextType | undefined>(undefined)

export const useMessageBox = () => {
  const context = useContext(MessageBoxContext)
  if (!context) {
    throw new Error('useMessageBox must be used within MessageBoxProvider')
  }
  return context
}

export const MessageBoxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState<MessageBoxOptions | null>(null)

  const showMessage = useCallback((opts: MessageBoxOptions) => {
    console.log('MessageBox: showMessage called with options:', opts)
    setOptions(opts)
    setIsOpen(true)
    console.log('MessageBox: isOpen set to true')
  }, [])

  const handleClose = () => {
    setIsOpen(false)
    setOptions(null)
  }

  const handleButtonClick = () => {
    // If custom handler provided, use it; otherwise open URL
    if (options?.onButtonClick) {
      options.onButtonClick()
    } else if (options?.applicationUrl) {
      window.open(options.applicationUrl, '_blank', 'noopener,noreferrer')
    }
    handleClose()
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  const getIcon = () => {
    if (!options) return null
    switch (options.type) {
      case 'success':
        return <FiCheckCircle />
      case 'error':
        return <FiAlertCircle />
      case 'warning':
        return <FiAlertCircle />
      default:
        return <FiInfo />
    }
  }

  return (
    <MessageBoxContext.Provider value={{ showMessage }}>
      {children}
      {isOpen && options && (
        <div className="message-box-overlay" onClick={handleOverlayClick}>
          <div className="message-box" onClick={(e) => e.stopPropagation()}>
            <div className="message-box-header">
              <div className={`message-box-icon message-box-icon-${options.type || 'info'}`}>
                {getIcon()}
              </div>
              <h3 className="message-box-title">
                {options.title || (options.type === 'success' ? 'Success' : options.type === 'error' ? 'Error' : 'Information')}
              </h3>
              <button
                className="message-box-close"
                onClick={handleClose}
                aria-label="Close"
              >
                <FiX />
              </button>
            </div>
            <div className="message-box-body">
              <div className="message-box-message">
                {options.message}
              </div>
              {options.applicationUrl && (
                <div className="message-box-urls">
                  <div className="message-box-url-item">
                    <strong>Frontend:</strong> <span>{options.applicationUrl}</span>
                  </div>
                  {options.backendUrl && (
                    <div className="message-box-url-item">
                      <strong>Backend:</strong> <span>{options.backendUrl}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="message-box-footer">
              <button
                className="message-box-button message-box-button-close"
                onClick={handleClose}
              >
                Close
              </button>
              {(options.showButton !== false && (options.onButtonClick || options.applicationUrl)) && (
                <button
                  className={`message-box-button message-box-button-primary message-box-button-${options.type || 'info'}`}
                  onClick={handleButtonClick}
                >
                  {options.buttonText || 'Open Application'} {options.applicationUrl && <FiExternalLink />}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </MessageBoxContext.Provider>
  )
}

