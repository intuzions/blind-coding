import React, { useState, useRef, useEffect } from 'react'
import { aiDevelopmentAPI, CodeGenerationRequest, ComponentGenerationRequest, CodeExplanationRequest, BugFixRequest, PageGenerationRequest } from '../../api/aiDevelopment'
import { useToast } from '../Toast'
import { FiCode, FiLayers, FiHelpCircle, FiAlertTriangle, FiFileText, FiSend, FiX, FiCopy, FiCheck, FiEye, FiCheckCircle } from 'react-icons/fi'
import RenderComponent from './RenderComponent'
import { ComponentNode } from '../../types/editor'
import './AIDevelopmentAssistant.css'

interface AIDevelopmentAssistantProps {
  isOpen: boolean
  onClose: () => void
  onAddComponent?: (component: any) => void
  existingComponents?: any[]
}

type AssistantMode = 'code' | 'component' | 'explain' | 'bugfix' | 'page'

const AIDevelopmentAssistant: React.FC<AIDevelopmentAssistantProps> = ({
  isOpen,
  onClose,
  onAddComponent,
  existingComponents = []
}) => {
  const [activeMode, setActiveMode] = useState<AssistantMode>('component')
  const [input, setInput] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [previewComponents, setPreviewComponents] = useState<ComponentNode[]>([])
  const { showToast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [chatHistory, setChatHistory] = useState<Array<{ type: 'user' | 'assistant'; content: string; timestamp: Date }>>([])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])
  
  // Reset preview when mode changes
  useEffect(() => {
    setShowPreview(false)
    setPreviewComponents([])
    setResult(null)
  }, [activeMode])
  
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
  
  // Auto-show preview when component is generated
  useEffect(() => {
    if (result?.result && activeMode === 'component') {
      try {
        const previewComps = convertToPreviewComponents(result.result)
        setPreviewComponents(previewComps)
        setShowPreview(true)
      } catch (error) {
        console.error('Error creating preview:', error)
      }
    }
  }, [result, activeMode, convertToPreviewComponents])

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

      switch (activeMode) {
        case 'code':
          const codeRequest: CodeGenerationRequest = {
            description: userMessage,
            language: 'javascript'
          }
          response = await aiDevelopmentAPI.generateCode(codeRequest)
          break

        case 'component':
          const componentRequest: ComponentGenerationRequest = {
            description: userMessage,
            existing_components: existingComponents
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
            description: userMessage
          }
          response = await aiDevelopmentAPI.generatePage(pageRequest)
          break
      }

      setResult(response)
      
      // For component generation, show a success message instead of the raw result
      let assistantMessage: string
      if (activeMode === 'component' && response.result) {
        // Check if result is a valid component structure (object with type)
        if (typeof response.result === 'object' && response.result !== null && 'type' in response.result) {
          assistantMessage = response.explanation || 'Component generated successfully! Check the preview below.'
        } else if (typeof response.result === 'string') {
          // If result is a string (shouldn't happen with our fixes, but handle it)
          // Check if it's just the description repeated
          const userMessageLower = userMessage.toLowerCase().trim()
          const resultStr = response.result.toLowerCase().trim()
          if (resultStr === userMessageLower || resultStr.includes(userMessageLower)) {
            assistantMessage = 'Component generation in progress... Please try again or use a more specific description.'
          } else {
            assistantMessage = response.explanation || response.result || 'Generated successfully'
          }
        } else {
          assistantMessage = response.explanation || 'Component generated successfully!'
        }
      } else {
        assistantMessage = response.explanation || (typeof response.result === 'string' ? response.result : JSON.stringify(response.result)) || 'Generated successfully'
      }
      
      setChatHistory(prev => [...prev, { type: 'assistant', content: assistantMessage, timestamp: new Date() }])

      // If component generation, create preview components and show preview automatically
      if (activeMode === 'component' && response.result) {
        // Validate that result is a proper component structure
        if (typeof response.result === 'object' && response.result !== null && 'type' in response.result) {
          try {
            const previewComps = convertToPreviewComponents(response.result)
            setPreviewComponents(previewComps)
            setShowPreview(true)
            showToast('Component generated! Preview it and add to canvas if you like it.', 'success')
          } catch (error) {
            console.error('Error creating preview:', error)
            showToast('Component generated, but preview failed. You can still add it to canvas.', 'warning')
          }
        } else {
          // Invalid component structure - show error
          showToast('Failed to generate valid component structure. Please try again with a more specific description.', 'error')
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


  const handleShowPreview = () => {
    if (result?.result) {
      try {
        const previewComps = convertToPreviewComponents(result.result)
        setPreviewComponents(previewComps)
        setShowPreview(!showPreview)
      } catch (error) {
        console.error('Error creating preview:', error)
        showToast('Failed to create preview', 'error')
      }
    }
  }
  
  // Reset preview when result changes
  useEffect(() => {
    if (result?.result && activeMode === 'component') {
      try {
        const previewComps = convertToPreviewComponents(result.result)
        setPreviewComponents(previewComps)
        setShowPreview(true)
      } catch (error) {
        console.error('Error creating preview:', error)
      }
    } else {
      setShowPreview(false)
      setPreviewComponents([])
    }
  }, [result, activeMode])

  const handleConfirmAdd = () => {
    if (result?.result && onAddComponent) {
      if (Array.isArray(result.result)) {
        result.result.forEach((comp: any) => {
          onAddComponent(comp)
        })
        showToast('Components added to canvas!', 'success')
      } else {
        onAddComponent(result.result)
        showToast('Component added to canvas!', 'success')
      }
      setShowConfirmDialog(false)
      setShowPreview(false)
      setResult(null)
      setPreviewComponents([])
    }
  }

  const handleAddToCanvas = () => {
    if (result?.result && onAddComponent) {
      // Show confirmation dialog
      setShowConfirmDialog(true)
    }
  }

  const handleCopyCode = () => {
    if (result?.code || result?.result) {
      const codeToCopy = result.code || JSON.stringify(result.result, null, 2)
      navigator.clipboard.writeText(codeToCopy)
      setCopied(true)
      showToast('Copied to clipboard', 'success')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const getPlaceholder = () => {
    switch (activeMode) {
      case 'code':
        return 'Describe the code you want to generate... (e.g., "Create a React button component with hover effects")'
      case 'component':
        return 'Describe the component you want to create... (e.g., "Create a modern card component with shadow")'
      case 'explain':
        return 'Paste the code you want explained...'
      case 'bugfix':
        return 'Paste the code with bugs or describe the issue...'
      case 'page':
        return 'Describe the page you want to create... (e.g., "Create a landing page with hero section and features")'
      default:
        return 'Enter your request...'
    }
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
            className={`ai-dev-tab ${activeMode === 'component' ? 'active' : ''}`}
            onClick={() => setActiveMode('component')}
          >
            <FiLayers /> Generate Component
          </button>
          <button
            className={`ai-dev-tab ${activeMode === 'code' ? 'active' : ''}`}
            onClick={() => setActiveMode('code')}
          >
            <FiCode /> Generate Code
          </button>
          <button
            className={`ai-dev-tab ${activeMode === 'page' ? 'active' : ''}`}
            onClick={() => setActiveMode('page')}
          >
            <FiFileText /> Generate Page
          </button>
          <button
            className={`ai-dev-tab ${activeMode === 'explain' ? 'active' : ''}`}
            onClick={() => setActiveMode('explain')}
          >
            <FiHelpCircle /> Explain Code
          </button>
          <button
            className={`ai-dev-tab ${activeMode === 'bugfix' ? 'active' : ''}`}
            onClick={() => setActiveMode('bugfix')}
          >
            <FiAlertTriangle /> Fix Bugs
          </button>
        </div>

        <div className="ai-dev-assistant-content">
          <div className="ai-dev-chat-area">
            {chatHistory.length === 0 ? (
              <div className="ai-dev-welcome">
                <div className="ai-dev-welcome-icon">🤖</div>
                <h3>Welcome to AI Development Assistant!</h3>
                <p>I can help you:</p>
                <ul>
                  <li>Generate React components from descriptions</li>
                  <li>Create code snippets in various languages</li>
                  <li>Build complete page structures</li>
                  <li>Explain how code works</li>
                  <li>Fix bugs in your code</li>
                </ul>
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

            {result && (
              <div className="ai-dev-result-panel">
                <div className="ai-dev-result-header">
                  <h4>Generated Component</h4>
                  <div className="ai-dev-result-actions">
                    {(result.code || result.result) && (
                      <button onClick={handleCopyCode} className="ai-dev-copy-btn">
                        {copied ? <FiCheck /> : <FiCopy />}
                        {copied ? 'Copied' : 'Copy Code'}
                      </button>
                    )}
                    {activeMode === 'component' && result.result && (
                      <>
                        <button onClick={handleShowPreview} className="ai-dev-preview-btn">
                          <FiEye /> {showPreview ? 'Hide Preview' : 'Show Preview'}
                        </button>
                        {onAddComponent && (
                          <button onClick={handleAddToCanvas} className="ai-dev-add-btn">
                            <FiCheckCircle /> Add to Canvas
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                
                {showPreview && previewComponents.length > 0 && (
                  <div className="ai-dev-preview-container">
                    <h5>Preview:</h5>
                    <div className="ai-dev-preview-content">
                      {previewComponents
                        .filter(comp => !comp.parentId)
                        .map((comp) => (
                          <RenderComponent
                            key={comp.id}
                            component={comp}
                            allComponents={previewComponents}
                            selectedId={null}
                            onSelect={() => {}}
                            onUpdate={() => {}}
                            onDelete={() => {}}
                            onAdd={() => {}}
                          />
                        ))}
                    </div>
                  </div>
                )}
                
                <div className="ai-dev-result-content">
                  {result.code ? (
                    <pre className="ai-dev-code-block">
                      <code>{result.code}</code>
                    </pre>
                  ) : result.result ? (
                    <details className="ai-dev-code-details">
                      <summary>View Component Structure (JSON)</summary>
                      <pre className="ai-dev-code-block">
                        <code>{JSON.stringify(result.result, null, 2)}</code>
                      </pre>
                    </details>
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
            
            {showConfirmDialog && (
              <div className="ai-dev-confirm-overlay" onClick={() => setShowConfirmDialog(false)}>
                <div className="ai-dev-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                  <h3>Add to Canvas?</h3>
                  <p>Do you want to add this component to your canvas?</p>
                  <div className="ai-dev-confirm-actions">
                    <button onClick={() => setShowConfirmDialog(false)} className="ai-dev-cancel-btn">
                      Cancel
                    </button>
                    <button onClick={handleConfirmAdd} className="ai-dev-confirm-btn">
                      <FiCheckCircle /> Yes, Add to Canvas
                    </button>
                  </div>
                </div>
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
              placeholder={getPlaceholder()}
              className="ai-dev-input"
              rows={activeMode === 'explain' || activeMode === 'bugfix' ? 6 : 3}
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
        </div>
      </div>
    </div>
  )
}

export default AIDevelopmentAssistant

