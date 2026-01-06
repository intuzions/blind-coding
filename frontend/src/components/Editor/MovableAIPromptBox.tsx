import React, { useState, useRef, useEffect } from 'react'
import { aiDevelopmentAPI, CodeGenerationRequest, ComponentGenerationRequest, PageGenerationRequest, ApplicationGenerationRequest } from '../../api/aiDevelopment'
import { aiAssistantAPI, DebugRequest, FormAPIRequest } from '../../api/aiAssistant'
import { useToast } from '../Toast'
import { FiSend, FiX, FiMinimize2, FiMaximize2, FiMove, FiZap, FiTrash2 } from 'react-icons/fi'
import { ComponentNode } from '../../types/editor'
import './MovableAIPromptBox.css'

interface MovableAIPromptBoxProps {
  onAddComponent?: (component: any) => void
  onUpdate?: (id: string, updates: Partial<ComponentNode>) => void
  onSelect?: (id: string | null) => void
  existingComponents?: ComponentNode[]
  selectedComponent?: ComponentNode | null
  frontendFramework?: string
  backendFramework?: string
  onClose?: () => void
  projectId?: number
}

const MovableAIPromptBox: React.FC<MovableAIPromptBoxProps> = ({
  onAddComponent,
  onUpdate,
  onSelect,
  existingComponents = [],
  selectedComponent,
  frontendFramework,
  backendFramework,
  onClose,
  projectId
}) => {
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: window.innerWidth - 400, y: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [chatHistory, setChatHistory] = useState<Array<{ type: 'user' | 'assistant'; content: string; timestamp: Date }>>([])
  const boxRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  // Detect if prompt is a modification request
  const isModificationRequest = (message: string): boolean => {
    const lower = message.toLowerCase()
    
    // Patterns that indicate modification of existing components
    const modificationPatterns = [
      /add\s+\w+\s+(?:field|input|button|element|component)\s+(?:into|to|in)\s+\w+/i, // "add X field into Y"
      /add\s+\w+\s+to\s+\w+/i, // "add X to Y"
      /insert\s+\w+\s+into\s+\w+/i, // "insert X into Y"
      /add\s+\w+\s+in\s+\w+/i, // "add X in Y"
      /modify\s+\w+/i, // "modify X"
      /update\s+\w+/i, // "update X"
      /change\s+\w+/i, // "change X"
      /edit\s+\w+/i, // "edit X"
      /remove\s+\w+\s+from\s+\w+/i, // "remove X from Y"
      /delete\s+\w+\s+from\s+\w+/i, // "delete X from Y"
    ]
    
    // Check for modification patterns
    const hasModificationPattern = modificationPatterns.some(pattern => pattern.test(message))
    
    // Keywords that indicate modification (when used with existing component context)
    const modificationKeywords = [
      'align', 'fix', 'adjust', 'improve', 'style', 'apply css', 'apply style',
      'set', 'center', 'move', 'resize', 'change color', 'change size',
      'update style', 'fix layout', 'arrange', 'reorder', 'rearrange',
      'format', 'formatting', 'styling', 'properly', 'better', 'correct', 'correctly'
    ]
    
    // Check if message contains modification keywords
    const hasModificationKeyword = modificationKeywords.some(keyword => lower.includes(keyword))
    
    // Context about existing components
    const existingComponentIndicators = [
      'registration', 'register', 'login', 'form', 'field', 'component',
      'page', 'button', 'input', 'existing', 'current', 'this', 'that'
    ]
    
    const hasExistingComponentContext = existingComponentIndicators.some(indicator => 
      lower.includes(indicator)
    )
    
    // Creation keywords that indicate NEW component creation
    const creationKeywords = [
      'create new', 'create a new', 'create an', 'build new', 'make a new',
      'generate new', 'new component', 'new page', 'new form'
    ]
    
    const hasCreationKeyword = creationKeywords.some(keyword => lower.includes(keyword))
    
    // If it has a modification pattern, it's definitely a modification
    if (hasModificationPattern) {
      return true
    }
    
    // If it explicitly says "create new" or similar, it's creation
    if (hasCreationKeyword) {
      return false
    }
    
    // Special case: "add X into Y" or "add X to Y" with existing component context = modification
    if ((lower.includes('add') || lower.includes('insert')) && hasExistingComponentContext) {
      // Check if it mentions adding something INTO or TO an existing component
      if (lower.includes(' into ') || lower.includes(' to ') || lower.includes(' in ')) {
        return true
      }
      // If it mentions adding a field/input/button to an existing form/component
      if ((lower.includes('field') || lower.includes('input') || lower.includes('button')) &&
          (lower.includes('form') || lower.includes('registration') || lower.includes('login') ||
           lower.includes('component') || lower.includes('page'))) {
        return true
      }
    }
    
    // If it has modification keywords AND existing component context, it's modification
    if (hasModificationKeyword && hasExistingComponentContext) {
      return true
    }
    
    // If it just says "add" or "create" without context, check if existing components exist
    // If components exist and prompt mentions them, it's likely modification
    if ((lower.includes('add') || lower.includes('create')) && hasExistingComponentContext && existingComponents.length > 0) {
      // Check if the mentioned component actually exists
      const mentionedComponent = findComponentToModify(message)
      if (mentionedComponent) {
        return true
      }
    }
    
    return false
  }

  // Detect request type from user input
  const detectRequestType = (message: string): 'component' | 'page' | 'code' | 'modify' | 'application' => {
    // First check if it's a modification request
    if (isModificationRequest(message)) {
      return 'modify'
    }
    
    const lower = message.toLowerCase()
    
    // Check for application requests (multi-page applications with signup, login, landing, etc.)
    const applicationKeywords = [
      'application', 'app', 'with signup', 'with login', 'with landing',
      'multiple pages', 'multi-page', 'full application', 'complete application',
      'logistic application', 'ecommerce application', 'business application'
    ]
    
    const hasMultiplePages = (lower.includes('signup') && lower.includes('login')) || 
                            (lower.includes('signup') && lower.includes('landing')) ||
                            (lower.includes('login') && lower.includes('landing')) ||
                            applicationKeywords.some(keyword => lower.includes(keyword))
    
    const hasCssFramework = lower.includes('tailwind') || lower.includes('bootstrap') || 
                           lower.includes('with tailwind') || lower.includes('with bootstrap')
    
    if (hasMultiplePages || (lower.includes('application') && (hasCssFramework || lower.includes('navbar') || lower.includes('navigation')))) {
      return 'application'
    }
    
    // Check for page requests (full page/website structure)
    if (lower.includes('page') || lower.includes('landing') || lower.includes('dashboard') || 
        lower.includes('website') || lower.includes('site') || lower.includes('full page') ||
        lower.includes('complete page') || lower.includes('entire page')) {
      return 'page'
    }
    
    // Check for pure code generation (not component/page)
    if ((lower.includes('generate code') || lower.includes('write code') || 
         lower.includes('create function') || lower.includes('helper function') ||
         lower.includes('utility function') || lower.includes('algorithm') ||
         lower.includes('script') || lower.includes('hook') || lower.includes('custom hook')) &&
        !lower.includes('component') && !lower.includes('page') && !lower.includes('application')) {
      return 'code'
    }
    
    // Default to component generation (most common use case)
    return 'component'
  }

  // Find the most relevant component to modify
  const findComponentToModify = (message: string): ComponentNode | null => {
    const lower = message.toLowerCase()
    
    // If a component is selected, use it
    if (selectedComponent) {
      return selectedComponent
    }
    
    // Try to find component by type mentioned in the prompt
    if (lower.includes('registration') || lower.includes('register')) {
      // First try to find a form component
      let registrationComponent = existingComponents.find(c => 
        c.type === 'form' || c.type.toLowerCase().includes('form')
      )
      
      // If not found, look for components with registration-related IDs or props
      if (!registrationComponent) {
        registrationComponent = existingComponents.find(c => 
          c.id.toLowerCase().includes('registration') ||
          c.id.toLowerCase().includes('register') ||
          (c.props?.placeholder && c.props.placeholder.toLowerCase().includes('registration'))
        )
      }
      
      // If still not found, look for components that have form-like children (inputs, buttons)
      if (!registrationComponent) {
        registrationComponent = existingComponents.find(c => {
          // Check if this component has children that are form elements
          const hasFormChildren = existingComponents.some(child => 
            child.parentId === c.id && 
            (child.type === 'input' || child.type === 'button' || child.type === 'label')
          )
          return hasFormChildren
        })
      }
      
      if (registrationComponent) return registrationComponent
    }
    
    if (lower.includes('login')) {
      const loginComponent = existingComponents.find(c => 
        c.type === 'form' || 
        c.id.toLowerCase().includes('login') ||
        (c.props?.placeholder && c.props.placeholder.toLowerCase().includes('login'))
      )
      if (loginComponent) return loginComponent
    }
    
    if (lower.includes('form') || lower.includes('field')) {
      const formComponent = existingComponents.find(c => 
        c.type === 'form' || 
        c.type.toLowerCase().includes('form')
      )
      if (formComponent) return formComponent
    }
    
    // Get the most recently created component (last in the array)
    // Prefer root components (no parentId) as they're usually the main components
    if (existingComponents.length > 0) {
      const rootComponents = existingComponents.filter(c => !c.parentId)
      if (rootComponents.length > 0) {
        return rootComponents[rootComponents.length - 1]
      }
      return existingComponents[existingComponents.length - 1]
    }
    
    return null
  }

  // Handle mouse down for dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMinimized) return
    if ((e.target as HTMLElement).closest('.prompt-input-container') || 
        (e.target as HTMLElement).closest('.prompt-chat-messages')) {
      return
    }
    setIsDragging(true)
    if (boxRef.current) {
      const rect = boxRef.current.getBoundingClientRect()
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
    }
  }

  // Handle mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      
      const newX = e.clientX - dragOffset.x
      const newY = e.clientY - dragOffset.y
      
      // Keep within viewport bounds
      const maxX = window.innerWidth - (boxRef.current?.offsetWidth || 400)
      const maxY = window.innerHeight - (boxRef.current?.offsetHeight || 200)
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset])

  const handleGenerate = async () => {
    if (!input.trim()) {
      showToast('Please enter a prompt', 'warning')
      return
    }

    setLoading(true)
    const userMessage = input.trim()
    setChatHistory(prev => [...prev, { type: 'user', content: userMessage, timestamp: new Date() }])
    setInput('')

    try {
      let response: any
      
      // Handle debug/error fix requests first - MUST check this before any component creation
      const lowerMessage = userMessage.toLowerCase()
      
      // Comprehensive error/debug detection patterns
      const errorPatterns = [
        // Explicit debug keywords
        /\b(debug|fix\s+error|fix\s+bug|fix\s+issue|resolve\s+error|resolve\s+bug)\b/i,
        // Error types (SyntaxError, TypeError, etc.)
        /\b(SyntaxError|TypeError|ReferenceError|NameError|AttributeError|IndentationError|ImportError|ModuleNotFoundError|KeyError|ValueError|JSONDecodeError|HTTPException)\b/i,
        // Error indicators
        /\b(error|exception|traceback|stack\s+trace|failed|failure|broken|not\s+working|crash|crashed)\b/i,
        // File and line references (common in error messages)
        /File\s+["'][^"']+["']/i,
        /line\s+\d+/i,
        /at\s+[^\s]+\.(py|js|jsx|ts|tsx)/i,
        // Error message patterns
        /Error:\s+/i,
        /Exception:\s+/i,
        /Traceback\s+\(most\s+recent\s+call\s+last\)/i,
        // Common error phrases
        /\b(expected|unexpected|missing|undefined|not\s+defined|cannot|can't|unable\s+to)\b.*\b(error|exception|fail)\b/i,
      ]
      
      // Check if message matches any error pattern
      const isDebug = errorPatterns.some(pattern => pattern.test(userMessage))
      
      // Additional check: if message contains file paths with extensions, it's likely an error
      const hasFileReference = /[^\s]+\.(py|js|jsx|ts|tsx)(:\d+)?/i.test(userMessage)
      
      // STRICT check: Only treat as debug if it has clear error indicators
      // This prevents false positives (e.g., "create error handling component" should NOT be debug)
      const hasClearErrorIndicators = (
        lowerMessage.includes('syntaxerror') || lowerMessage.includes('typeerror') ||
        lowerMessage.includes('referenceerror') || lowerMessage.includes('traceback') ||
        lowerMessage.includes('exception:') || lowerMessage.includes('error:') ||
        lowerMessage.includes('file ') || lowerMessage.includes('line ') ||
        lowerMessage.includes('at ') || hasFileReference ||
        /\b(fix|debug|resolve)\s+(error|bug|issue)\b/i.test(userMessage)
      )
      
      // If it matches error patterns AND has clear error indicators, it's definitely a debug request
      if (isDebug && hasClearErrorIndicators) {
        const debugRequest: DebugRequest = {
          error_message: userMessage,
          error_traceback: undefined,
          file_path: undefined,
          project_id: projectId
        }
        
        // Try to extract traceback if present
        const tracebackMatch = userMessage.match(/Traceback[\s\S]*?(?=\n\n|\n[A-Z]|$)/i)
        if (tracebackMatch) {
          debugRequest.error_traceback = tracebackMatch[0]
        }
        
        // Try to extract file path
        const filePathMatch = userMessage.match(/(?:file|in)\s+['"]?([^'"]+\.(py|js|jsx|ts|tsx))['"]?/i)
        if (filePathMatch) {
          debugRequest.file_path = filePathMatch[1]
        }
        
        response = await aiAssistantAPI.debugFix(debugRequest)
        
        let responseMessage = `🔍 **Issue Identified:** ${response.issue_identified}\n\n**Root Cause:** ${response.root_cause}\n\n**Fix:**\n\`\`\`\n${response.fix_code}\n\`\`\`\n\n**Explanation:** ${response.explanation}\n\n**File:** ${response.file_path}\n**Confidence:** ${(response.confidence * 100).toFixed(0)}%`
        
        if (response.fix_applied) {
          responseMessage += `\n\n✅ **Fix Applied Successfully!**`
        }
        
        if (response.docker_rebuilt) {
          responseMessage += `\n\n🐳 **Docker Containers Rebuilt!**`
          if (response.application_url) {
            responseMessage += `\n\n🔗 Application URL: ${response.application_url}`
            // Reload the page after a short delay
            setTimeout(() => {
              if (response.application_url) {
                window.open(response.application_url, '_blank', 'noopener,noreferrer')
              }
            }, 2000)
          }
        }
        
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          content: responseMessage,
          timestamp: new Date()
        }])
        setLoading(false)
        return  // CRITICAL: Return early - NEVER create components for error messages
      }
      
      // If we reach here, it's NOT an error/debug request - proceed with normal component creation flow
      const requestType = detectRequestType(userMessage)

      // Handle modification requests
      if (requestType === 'modify') {
        const componentToModify = findComponentToModify(userMessage)
        
        if (!componentToModify) {
          setChatHistory(prev => [...prev, {
            type: 'assistant',
            content: '❌ No component found to modify. Please create a component first or select one.',
            timestamp: new Date()
          }])
          setLoading(false)
          return
        }

        // Select the component if not already selected
        if (onSelect && componentToModify.id !== selectedComponent?.id) {
          onSelect(componentToModify.id)
        }

        // Check if this is an "add field" request
        const lowerMessage = userMessage.toLowerCase()
        const isAddFieldRequest = (lowerMessage.includes('add') || lowerMessage.includes('insert')) &&
                                  (lowerMessage.includes('field') || lowerMessage.includes('input')) &&
                                  (componentToModify.type === 'form' || componentToModify.type.toLowerCase().includes('form'))

        if (isAddFieldRequest && onAddComponent) {
          // Extract field name from prompt (e.g., "Date of birth" from "add Date of birth field")
          const fieldNameMatch = userMessage.match(/(?:add|insert)\s+(.+?)\s+(?:field|input)/i)
          const fieldName = fieldNameMatch ? fieldNameMatch[1].trim() : 'New Field'
          
          // Generate a new input field component
          const fieldId = `input-${Date.now()}-${Math.random().toString(36).substring(7)}`
          const labelId = `label-${Date.now()}-${Math.random().toString(36).substring(7)}`
          
          // Create label component
          const labelComponent: ComponentNode = {
            id: labelId,
            type: 'label',
            props: {
              style: {
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                fontSize: '0.9rem'
              },
              children: fieldName
            },
            parentId: componentToModify.id
          }
          
          // Create input component
          const inputComponent: ComponentNode = {
            id: fieldId,
            type: 'input',
            props: {
              type: lowerMessage.includes('date') || lowerMessage.includes('birth') ? 'date' : 'text',
              placeholder: `Enter ${fieldName.toLowerCase()}`,
              name: fieldName.toLowerCase().replace(/\s+/g, '_'),
              style: {
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }
            },
            parentId: componentToModify.id
          }
          
          // Add both components
          onAddComponent(labelComponent)
          onAddComponent(inputComponent)
          
          setChatHistory(prev => [...prev, {
            type: 'assistant',
            content: `✅ Added "${fieldName}" field to the ${componentToModify.type} component!`,
            timestamp: new Date()
          }])
          setLoading(false)
          return
        }

        // Use AI Assistant API to modify the component
        const modifyRequest = {
          prompt: userMessage,
          component_type: componentToModify.type,
          current_styles: componentToModify.props?.style || {},
          current_props: componentToModify.props || {}
        }

        response = await aiAssistantAPI.processPrompt(modifyRequest)

        // Apply changes to the component
        if (response.changes && onUpdate) {
          const updates: Partial<ComponentNode> = {}
          
          if (response.changes.style) {
            updates.props = {
              ...componentToModify.props,
              style: {
                ...(componentToModify.props?.style || {}),
                ...response.changes.style
              }
            }
          }
          
          if (response.changes.props) {
            updates.props = {
              ...(updates.props || componentToModify.props || {}),
              ...response.changes.props
            }
          }
          
          if (response.changes.type) {
            updates.type = response.changes.type
          }

          if (Object.keys(updates).length > 0) {
            onUpdate(componentToModify.id, updates)
            setChatHistory(prev => [...prev, {
              type: 'assistant',
              content: `✅ ${response.message || 'Component updated successfully!'}`,
              timestamp: new Date()
            }])
          } else {
            setChatHistory(prev => [...prev, {
              type: 'assistant',
              content: response.message || 'No changes were made.',
              timestamp: new Date()
            }])
          }
        } else {
          setChatHistory(prev => [...prev, {
            type: 'assistant',
            content: response.message || 'No changes were made.',
            timestamp: new Date()
          }])
        }
        
        setLoading(false)
        return
      }

      // Handle creation requests
      switch (requestType) {
        case 'application':
          // Extract CSS framework from description
          const lowerMessage = userMessage.toLowerCase()
          let cssFramework: string | undefined
          if (lowerMessage.includes('tailwind')) {
            cssFramework = 'tailwind'
          } else if (lowerMessage.includes('bootstrap')) {
            cssFramework = 'bootstrap'
          }
          
          const applicationRequest: ApplicationGenerationRequest = {
            description: userMessage,
            css_framework: cssFramework,
            frontend_framework: frontendFramework,
            backend_framework: backendFramework
          }
          response = await aiDevelopmentAPI.generateApplication(applicationRequest)
          break

        case 'code':
          const codeRequest: CodeGenerationRequest = {
            description: userMessage,
            language: frontendFramework === 'react' ? 'javascript' : 'javascript',
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

        case 'page':
          const pageRequest: PageGenerationRequest = {
            description: userMessage,
            frontend_framework: frontendFramework,
            backend_framework: backendFramework
          }
          response = await aiDevelopmentAPI.generatePage(pageRequest)
          break
      }

      // For application generation, handle multiple pages
      if (requestType === 'application' && response.result && onAddComponent) {
        const pages = response.result
        
        if (Array.isArray(pages)) {
          let totalComponents = 0
          pages.forEach((page: any) => {
            const pageComponents = page.components || []
            pageComponents.forEach((comp: any) => {
              onAddComponent(comp)
              totalComponents++
            })
          })
          
          setChatHistory(prev => [...prev, {
            type: 'assistant',
            content: `✅ Created complete application with ${pages.length} page(s) and ${totalComponents} component(s)! All pages have been added to canvas.`,
            timestamp: new Date()
          }])
        } else {
          setChatHistory(prev => [...prev, {
            type: 'assistant',
            content: response.explanation || 'Application created successfully!',
            timestamp: new Date()
          }])
        }
      }
      // For component/page generation, add directly to canvas
      else if ((requestType === 'component' || requestType === 'page') && response.result && onAddComponent) {
        const result = response.result
        
        // Handle array of components (pages)
        if (Array.isArray(result)) {
          result.forEach((comp: any) => {
            onAddComponent(comp)
          })
          setChatHistory(prev => [...prev, {
            type: 'assistant',
            content: `✅ Created ${result.length} component(s) and added to canvas!`,
            timestamp: new Date()
          }])
        } else if (result.type) {
          // Single component
          onAddComponent(result)
          setChatHistory(prev => [...prev, {
            type: 'assistant',
            content: `✅ Created ${result.type} component and added to canvas!`,
            timestamp: new Date()
          }])
        } else {
          setChatHistory(prev => [...prev, {
            type: 'assistant',
            content: response.explanation || 'Component created successfully!',
            timestamp: new Date()
          }])
        }
      } else {
        // For code generation, show the result
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          content: response.code || response.result || response.explanation || 'Code generated successfully!',
          timestamp: new Date()
        }])
      }
    } catch (error: any) {
      console.error('Error generating:', error)
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        content: `❌ Error: ${error.response?.data?.detail || error.message || 'Failed to generate. Please try again.'}`,
        timestamp: new Date()
      }])
      showToast('Failed to generate', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleGenerate()
    }
  }

  const handleClear = () => {
    setChatHistory([])
    setInput('')
  }

  return (
    <div
      ref={boxRef}
      className={`movable-ai-prompt-box ${isMinimized ? 'minimized' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`
      }}
    >
      <div
        className="prompt-box-header"
        onMouseDown={handleMouseDown}
      >
        <div className="prompt-box-header-left">
          <FiZap className="prompt-box-icon" />
          <span className="prompt-box-title">AI Assistant</span>
        </div>
        <div className="prompt-box-header-right">
          <button
            className="prompt-box-btn"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Maximize' : 'Minimize'}
          >
            {isMinimized ? <FiMaximize2 /> : <FiMinimize2 />}
          </button>
          <button
            className="prompt-box-btn"
            onClick={handleClear}
            title="Clear chat"
          >
            <FiTrash2 />
          </button>
          {onClose && (
            <button
              className="prompt-box-btn"
              onClick={onClose}
              title="Close"
            >
              <FiX />
            </button>
          )}
        </div>
      </div>

      {!isMinimized && (
        <>
          <div className="prompt-chat-messages">
            {chatHistory.length === 0 ? (
              <div className="prompt-welcome-message">
                <FiZap className="welcome-icon" />
                <h4>AI Development Assistant</h4>
                <p>Create new components or modify existing ones!</p>
                <div className="prompt-examples">
                  <div className="prompt-example">
                    <strong>Create:</strong>
                    <span>"Create a login page"</span>
                    <span>"Add a navigation bar"</span>
                    <span>"Build a dashboard with charts"</span>
                  </div>
                  <div className="prompt-example" style={{ marginTop: '0.75rem' }}>
                    <strong>Modify:</strong>
                    <span>"Align registration fields properly"</span>
                    <span>"Apply CSS styling"</span>
                    <span>"Center the form"</span>
                  </div>
                </div>
              </div>
            ) : (
              chatHistory.map((message, index) => (
                <div
                  key={index}
                  className={`prompt-message ${message.type === 'user' ? 'user' : 'assistant'}`}
                >
                  <div className="prompt-message-content">
                    {message.content}
                  </div>
                  <div className="prompt-message-time">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="prompt-message assistant">
                <div className="prompt-typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="prompt-input-container">
            <textarea
              className="prompt-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Describe what you want to create... (Press Enter to send, Shift+Enter for new line)"
              rows={3}
              disabled={loading}
            />
            <button
              className="prompt-send-btn"
              onClick={handleGenerate}
              disabled={loading || !input.trim()}
              title="Send (Enter)"
            >
              {loading ? (
                <div className="prompt-spinner"></div>
              ) : (
                <FiSend />
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default MovableAIPromptBox

