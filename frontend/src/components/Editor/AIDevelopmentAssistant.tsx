import React, { useState, useRef, useEffect } from 'react'
import { aiDevelopmentAPI, CodeGenerationRequest, ComponentGenerationRequest, CodeExplanationRequest, BugFixRequest, PageGenerationRequest } from '../../api/aiDevelopment'
import { useToast } from '../Toast'
import { FiSend, FiX, FiCopy, FiCheck, FiEye, FiCheckCircle, FiUpload, FiLoader, FiEdit2, FiTag, FiZap, FiMove, FiMaximize2, FiMinimize2, FiArrowUp, FiArrowDown, FiArrowLeft, FiArrowRight, FiRefreshCw, FiTrash2, FiSave } from 'react-icons/fi'
import RenderComponent from './RenderComponent'
import { ComponentNode } from '../../types/editor'
import { analyzeImageAndGenerateComponents, ImageAnalysisResult } from '../../services/imageAnalysis'
import axios from 'axios'
import './AIDevelopmentAssistant.css'
import './ImageUploadModal.css'

interface AIDevelopmentAssistantProps {
  isOpen: boolean
  onClose: () => void
  onAddComponent?: (component: any) => void
  existingComponents?: any[]
  onImageUpload?: (file: File) => Promise<void>
  initialTab?: 'create' | 'upload'
  frontendFramework?: string
  backendFramework?: string
}

type TabType = 'create' | 'upload'

interface Mark {
  id: string
  type: 'graph' | 'card' | 'text' | 'image' | 'button' | 'input' | 'container'
  componentName?: string
  bounds: { x: number; y: number; width: number; height: number }
  selected?: boolean
  color?: string
  extractedText?: string
}

const AIDevelopmentAssistant: React.FC<AIDevelopmentAssistantProps> = ({
  isOpen,
  onClose,
  onAddComponent,
  existingComponents = [],
  onImageUpload,
  initialTab = 'create',
  frontendFramework,
  backendFramework
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)
  
  // Update tab when initialTab prop changes
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab)
    }
  }, [isOpen, initialTab])
  const [input, setInput] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [currentRequestType, setCurrentRequestType] = useState<'component' | 'page' | 'code' | 'explain' | 'bugfix' | null>(null)
  const { showToast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [chatHistory, setChatHistory] = useState<Array<{ type: 'user' | 'assistant'; content: string; timestamp: Date }>>([])
  
  // Image upload states
  const [dragActive, setDragActive] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [annotatedPreview, setAnnotatedPreview] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<ImageAnalysisResult | null>(null)
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [customMarks, setCustomMarks] = useState<Mark[]>([])
  const [selectedComponentType, setSelectedComponentType] = useState<string>('')
  const [isDrawing, setIsDrawing] = useState(false)
  const [isMarkingMode, setIsMarkingMode] = useState(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null)
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null)
  const [showCustomMarking, setShowCustomMarking] = useState(false)
  const [isAdjustingMode, setIsAdjustingMode] = useState(false)
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])
  
  // Reset result when tab changes
  useEffect(() => {
    if (activeTab === 'create') {
    setResult(null)
      setCurrentRequestType(null)
    } else {
      setPreview(null)
      setAnnotatedPreview(null)
      setAnalysisResult(null)
      setCurrentFile(null)
      setCustomMarks([])
    }
  }, [activeTab])
  
  // Convert AI-generated component structure to ComponentNode format for preview
  const convertToPreviewComponents = React.useCallback((aiComponent: any): ComponentNode[] => {
    let componentCounter = 0
    const baseTimestamp = Date.now()
    
    const convertAIComponent = (comp: any, parentId?: string): ComponentNode[] => {
      componentCounter++
      const randomId = Math.random().toString(36).substring(7)
      
      // Extract children from props if they exist
      const props = { ...(comp.props || {}) }
      const childrenFromProps = props.children && Array.isArray(props.children) ? props.children : []
      const childrenFromRoot = comp.children && Array.isArray(comp.children) ? comp.children : []
      
      // Remove children from props if it's an array
      if (Array.isArray(props.children)) {
        delete props.children
      }
      
      // Ensure form elements have visible default styles
      if (comp.type === 'form' && (!props.style || Object.keys(props.style).length === 0)) {
        props.style = {
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          padding: '1.5rem',
          border: '1px solid #ddd',
          borderRadius: '8px',
          backgroundColor: '#fff',
          maxWidth: '500px',
          width: '100%'
        }
      } else if (comp.type === 'form' && props.style) {
        if (!props.style.display) {
          props.style.display = 'flex'
        }
        if (!props.style.flexDirection) {
          props.style.flexDirection = 'column'
        }
        if (!props.style.padding && !props.style.paddingTop && !props.style.paddingBottom) {
          props.style.padding = '1.5rem'
        }
        if (!props.style.width && !props.style.maxWidth) {
          props.style.maxWidth = '500px'
          props.style.width = '100%'
        }
      }
      
      const componentNode: ComponentNode = {
        id: comp.id || `preview-${baseTimestamp}-${componentCounter}-${randomId}`,
        type: comp.type || 'div',
        props: props,
        children: [],
        parentId: parentId || undefined,
      }

      const allComponents: ComponentNode[] = [componentNode]

      // Process children from root level first
      if (childrenFromRoot.length > 0) {
        childrenFromRoot.forEach((child: any) => {
          const childComponents = convertAIComponent(child, componentNode.id)
          allComponents.push(...childComponents)
        })
      } 
      // Then process children from props
      else if (childrenFromProps.length > 0) {
        childrenFromProps.forEach((child: any) => {
          const childComponents = convertAIComponent(child, componentNode.id)
          allComponents.push(...childComponents)
        })
      }

      return allComponents
    }

    if (Array.isArray(aiComponent)) {
      const allComponents: ComponentNode[] = []
      aiComponent.forEach((comp: any) => {
        allComponents.push(...convertAIComponent(comp))
      })
      return allComponents
    } else {
      return convertAIComponent(aiComponent)
    }
  }, [])
  

  // Intelligently detect request type from user input with better accuracy
  const detectRequestType = (message: string): 'component' | 'page' | 'code' | 'explain' | 'bugfix' => {
    const lower = message.toLowerCase().trim()
    const words = lower.split(/\s+/)
    
    // Check for explanation requests (must be clear explanation intent)
    if ((lower.includes('explain') || lower.includes('what does') || lower.includes('how does') || 
         lower.includes('what is') || lower.includes('meaning of') || lower.includes('tell me about')) &&
        (lower.includes('code') || lower.includes('function') || lower.includes('this') || 
         message.includes('```') || message.split('\n').length > 3)) {
      return 'explain'
    }
    
    // Check for bug fix requests (must have code or error context)
    if ((lower.includes('fix') || lower.includes('bug') || lower.includes('error') || 
         lower.includes('debug') || lower.includes('broken') || lower.includes('not working')) &&
        (lower.includes('code') || lower.includes('function') || message.includes('```') || 
         lower.includes('error') || message.split('\n').length > 3)) {
      return 'bugfix'
    }
    
    // Check for page requests (full page/website structure)
    if ((lower.includes('page') || lower.includes('landing') || lower.includes('dashboard') || 
         lower.includes('website') || lower.includes('site') || lower.includes('full page') ||
         lower.includes('complete page') || lower.includes('entire page')) &&
        !lower.includes('component')) {
      return 'page'
    }
    
    // Check for pure code generation (not component/page)
    if ((lower.includes('generate code') || lower.includes('write code') || 
         lower.includes('create function') || lower.includes('helper function') ||
         lower.includes('utility function') || lower.includes('algorithm') ||
         lower.includes('script') || lower.includes('hook') || lower.includes('custom hook')) &&
        !lower.includes('component') && !lower.includes('page')) {
      return 'code'
    }
    
    // Default to component generation (most common use case)
    // This includes: "create a button", "add a form", "make a card", etc.
    return 'component'
  }

  const handleGenerate = async () => {
    if (!input.trim()) {
      showToast('Please enter a description', 'warning')
      return
    }

    setLoading(true)
    const userMessage = input.trim()
    setChatHistory(prev => [...prev, { type: 'user', content: userMessage, timestamp: new Date() }])
    setInput('')

    try {
      let response: any
      const requestType = detectRequestType(userMessage)
      setCurrentRequestType(requestType)

      switch (requestType) {
        case 'code':
          const codeRequest: CodeGenerationRequest = {
            description: userMessage,
            language: frontendFramework === 'react' ? 'javascript' : frontendFramework === 'vue' ? 'javascript' : 'javascript',
            frontend_framework: frontendFramework,
            backend_framework: backendFramework
          }
          response = await aiDevelopmentAPI.generateCode(codeRequest)
          break

        case 'component':
          const componentRequest: ComponentGenerationRequest = {
            description: userMessage,
            existing_components: existingComponents,
            frontend_framework: frontendFramework,
            backend_framework: backendFramework
          }
          response = await aiDevelopmentAPI.generateComponent(componentRequest)
          break

        case 'explain':
          const explainRequest: CodeExplanationRequest = {
            code: userMessage,
            language: 'javascript'
          }
          response = await aiDevelopmentAPI.explainCode(explainRequest)
          break

        case 'bugfix':
          const bugFixRequest: BugFixRequest = {
            code: userMessage,
            language: 'javascript'
          }
          response = await aiDevelopmentAPI.fixBug(bugFixRequest)
          break

        case 'page':
          const pageRequest: PageGenerationRequest = {
            description: userMessage,
            frontend_framework: frontendFramework,
            backend_framework: backendFramework
          }
          response = await aiDevelopmentAPI.generatePage(pageRequest)
          break
      }

      setResult(response)
      
      // For component/page generation, show a success message instead of the raw result
      let assistantMessage: string
      if ((requestType === 'component' || requestType === 'page') && response.result) {
        // Check if result is a valid component structure (object with type) or array (for pages)
        const isValidComponent = typeof response.result === 'object' && response.result !== null && 
                                  ('type' in response.result || Array.isArray(response.result))
        
        if (isValidComponent) {
          if (Array.isArray(response.result)) {
            assistantMessage = response.explanation || `Generated page with ${response.result.length} sections! Added to canvas.`
          } else {
            assistantMessage = response.explanation || 'Generated successfully! Added to canvas.'
          }
        } else if (typeof response.result === 'string') {
          // If result is a string (shouldn't happen with our fixes, but handle it)
          // Check if it's just the description repeated
          const userMessageLower = userMessage.toLowerCase().trim()
          const resultStr = response.result.toLowerCase().trim()
          if (resultStr === userMessageLower || resultStr.includes(userMessageLower)) {
            assistantMessage = 'Generation in progress... Please try again or use a more specific description.'
          } else {
            assistantMessage = response.explanation || response.result || 'Generated successfully'
          }
        } else {
          assistantMessage = response.explanation || 'Generated successfully!'
        }
      } else {
        assistantMessage = response.explanation || (typeof response.result === 'string' ? response.result : JSON.stringify(response.result)) || 'Generated successfully'
      }
      
      setChatHistory(prev => [...prev, { type: 'assistant', content: assistantMessage, timestamp: new Date() }])

      // If component/page generation, automatically add to canvas
      if ((requestType === 'component' || requestType === 'page') && response.result && onAddComponent) {
        // Validate that result is a proper component structure (object with type) or array (for pages)
        const isValidComponent = typeof response.result === 'object' && response.result !== null && 
                                  ('type' in response.result || Array.isArray(response.result))
        
        if (isValidComponent) {
        try {
            // Automatically add to canvas
            if (Array.isArray(response.result) && response.result.length > 0) {
              // Page with multiple components
              onAddComponent(response.result)
              showToast(`Page with ${response.result.length} sections added to canvas!`, 'success')
            } else {
              // Single component
              onAddComponent(response.result)
              showToast('Component added to canvas!', 'success')
            }
            // Clear result after adding
            setResult(null)
        } catch (error) {
            console.error('Error adding to canvas:', error)
            showToast('Generated, but failed to add to canvas.', 'error')
          }
        } else {
          // Invalid component structure - show error
          showToast('Failed to generate valid structure. Please try again with a more specific description.', 'error')
        }
      }

    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || error?.message || 'An error occurred'
      setChatHistory(prev => [...prev, { type: 'assistant', content: `Error: ${errorMessage}`, timestamp: new Date() }])
      showToast('Failed to process request', 'error')
    } finally {
      setLoading(false)
    }
  }


  // Preview and add functions removed - components are added directly to canvas automatically

  const handleCopyCode = () => {
    if (result?.code || result?.result) {
      const codeToCopy = result.code || JSON.stringify(result.result, null, 2)
      navigator.clipboard.writeText(codeToCopy)
      setCopied(true)
      showToast('Copied to clipboard', 'success')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Image upload handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.type.startsWith('image/')) {
        handleFile(file)
      }
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = async (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
    
    setCurrentFile(file)
    setAnnotatedPreview(null)
    setAnalysisResult(null)

    setAnalyzing(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('Authentication required')
      }

      const formData = new FormData()
      formData.append('image', file)

      const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000'
      const response = await axios.post<ImageAnalysisResult>(
        `${API_BASE_URL}/api/analyze-image`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${token}`,
          },
        }
      )

      setAnalysisResult(response.data)
      if (response.data.annotatedImage) {
        setAnnotatedPreview(response.data.annotatedImage)
      }
    } catch (error) {
      console.error('Analysis failed:', error)
      showToast('Failed to analyze image', 'error')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleGenerateComponents = async () => {
    if (!currentFile || !onImageUpload) return

    setUploading(true)
    try {
      await onImageUpload(currentFile)
      showToast('Components generated successfully!', 'success')
      setPreview(null)
      setAnnotatedPreview(null)
      setAnalysisResult(null)
      setCurrentFile(null)
      setCustomMarks([])
    } catch (error) {
      console.error('Upload failed:', error)
      showToast('Failed to generate components from image', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleReset = () => {
    setPreview(null)
    setAnnotatedPreview(null)
    setAnalysisResult(null)
    setCurrentFile(null)
    setCustomMarks([])
  }

  if (!isOpen) return null

  return (
    <div className="ai-dev-assistant-overlay" onClick={onClose}>
      <div className="ai-dev-assistant-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-dev-assistant-header">
          <div className="ai-dev-assistant-title">
            <h2>AI Development Assistant</h2>
            <p>Powered by LLM - Generate code, components, and more</p>
          </div>
          <button className="ai-dev-assistant-close" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="ai-dev-assistant-tabs">
          <button
            className={`ai-dev-tab ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            <FiZap /> Create Application
          </button>
          <button
            className={`ai-dev-tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <FiUpload /> Upload Image
          </button>
        </div>

        <div className="ai-dev-assistant-content">
          {activeTab === 'create' ? (
            <>
          <div className="ai-dev-chat-area">
            {chatHistory.length === 0 ? (
              <div className="ai-dev-welcome">
                <div className="ai-dev-welcome-icon">🤖</div>
                  <h3>Create Application with AI</h3>
                  <p>Describe what you want to create and I'll generate it for you:</p>
                <ul>
                    <li>Components: "Create a login form" or "Add a card component"</li>
                    <li>Pages: "Create a landing page" or "Build a dashboard"</li>
                    <li>Code: "Generate a utility function" or "Create a React hook"</li>
                    <li>Explain: "Explain this code" or "What does this function do?"</li>
                    <li>Fix: "Fix this bug" or "Debug this error"</li>
                </ul>
                  {(frontendFramework || backendFramework) && (
                    <div className="ai-dev-framework-info" style={{ 
                      marginTop: '1rem', 
                      padding: '1rem', 
                      background: '#e3f2fd', 
                      borderRadius: '8px',
                      border: '1px solid #90caf9'
                    }}>
                      <strong>Project Frameworks:</strong>
                      {frontendFramework && <p style={{ margin: '0.25rem 0', color: '#1976d2' }}>Frontend: {frontendFramework.toUpperCase()}</p>}
                      {backendFramework && <p style={{ margin: '0.25rem 0', color: '#1976d2' }}>Backend: {backendFramework.toUpperCase()}</p>}
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#555' }}>
                        Generated code will be compatible with your selected frameworks and mapped to the canvas.
                      </p>
                    </div>
                  )}
                <p className="ai-dev-note">
                  <strong>Note:</strong> Configure OPENAI_API_KEY or ANTHROPIC_API_KEY in your backend .env file to enable full LLM features.
                </p>
              </div>
            ) : (
              <div className="ai-dev-messages">
                {chatHistory.map((message, index) => (
                  <div key={index} className={`ai-dev-message ai-dev-message-${message.type}`}>
                    <div className="ai-dev-message-avatar">
                      {message.type === 'user' ? '👤' : '🤖'}
                    </div>
                    <div className="ai-dev-message-content">
                      <div className="ai-dev-message-text">
                        {message.content.split('\n').map((line, i) => (
                          <span key={i}>
                            {line}
                            {i < message.content.split('\n').length - 1 && <br />}
                          </span>
                        ))}
                      </div>
                      <div className="ai-dev-message-time">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="ai-dev-message ai-dev-message-assistant ai-dev-message-typing">
                    <div className="ai-dev-message-avatar">🤖</div>
                    <div className="ai-dev-message-content">
                      <div className="ai-dev-typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

                {result && (currentRequestType === 'code' || currentRequestType === 'explain' || currentRequestType === 'bugfix') && (
              <div className="ai-dev-result-panel">
                <div className="ai-dev-result-header">
                      <h4>Result</h4>
                  <div className="ai-dev-result-actions">
                    {(result.code || result.result) && (
                      <button onClick={handleCopyCode} className="ai-dev-copy-btn">
                        {copied ? <FiCheck /> : <FiCopy />}
                        {copied ? 'Copied' : 'Copy Code'}
                      </button>
                    )}
                </div>
                    </div>
                
                <div className="ai-dev-result-content">
                  {result.code ? (
                    <pre className="ai-dev-code-block">
                      <code>{result.code}</code>
                    </pre>
                  ) : result.result ? (
                      <pre className="ai-dev-code-block">
                          <code>{typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2)}</code>
                      </pre>
                  ) : (
                    <p>{result.explanation || result.result}</p>
                  )}
                </div>
                {result.suggestions && result.suggestions.length > 0 && (
                  <div className="ai-dev-suggestions">
                    <h5>Suggestions:</h5>
                    <ul>
                      {result.suggestions.map((suggestion: string, index: number) => (
                        <li key={index}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ai-dev-input-area">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !loading) {
                  e.preventDefault()
                  handleGenerate()
                }
              }}
                  placeholder="Describe what you want to create... (e.g., 'Create a login form', 'Build a landing page', 'Generate a button component')"
              className="ai-dev-input"
                  rows={3}
              disabled={loading}
            />
            <button
              onClick={handleGenerate}
              disabled={!input.trim() || loading}
              className="ai-dev-send-btn"
            >
              {loading ? (
                <div className="ai-dev-spinner"></div>
              ) : (
                <>
                  <FiSend />
                  Generate
                </>
              )}
            </button>
          </div>
              
            </>
          ) : (
            <div className="ai-dev-upload-area">
              <div
                className={`image-upload-dropzone ${dragActive ? 'active' : ''} ${analyzing ? 'uploading' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={!analyzing ? handleClick : undefined}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInput}
                  style={{ display: 'none' }}
                />
                {analyzing ? (
                  <div className="image-upload-loading">
                    <FiLoader className="spinner" />
                    <p>Analyzing image and detecting components...</p>
                    <p className="upload-hint">This may take a few moments</p>
                  </div>
                ) : preview ? (
                  <div className="image-upload-preview">
                    <img src={annotatedPreview || preview} alt="Preview" />
                    <div className="image-upload-actions">
                      <button 
                        className="btn-secondary" 
                        onClick={(e) => {
                          e.stopPropagation()
                          handleReset()
                        }}
                      >
                        <FiRefreshCw /> Reset
                      </button>
                      <button 
                        className="btn-primary" 
                        onClick={(e) => {
                          e.stopPropagation()
                          handleGenerateComponents()
                        }}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <>
                            <FiLoader className="spinner" /> Generating...
                          </>
                        ) : (
                          <>
                            <FiZap /> Generate Components
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="image-upload-placeholder">
                    <FiUpload className="upload-icon" />
                    <p>Drag and drop an image here, or click to select</p>
                    <p className="upload-hint">Supported formats: JPG, PNG, GIF, WebP</p>
                  </div>
                )}
              </div>
              {analysisResult && (
                <div className="image-analysis-info">
                  <p>Detected {analysisResult.detectedElements?.length || 0} elements in the image</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AIDevelopmentAssistant

