import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { fetchProject, updateProject } from '../store/slices/projectSlice'
import Canvas from '../components/Editor/Canvas'
import ComponentLibrary from '../components/Editor/ComponentLibrary'
import PropertiesPanel from '../components/Editor/PropertiesPanel'
import ImageUploadModal from '../components/Editor/ImageUploadModal'
import AIDevelopmentAssistant from '../components/Editor/AIDevelopmentAssistant'
import RenderComponent from '../components/Editor/RenderComponent'
import ProgressBar from '../components/ProgressBar'
import { ComponentNode } from '../types/editor'
import { FiSave, FiArrowLeft, FiEye, FiGrid, FiSidebar, FiX, FiZap } from 'react-icons/fi'
import { analyzeImageAndGenerateComponents } from '../services/imageAnalysis'
import { useToast } from '../components/Toast'
import './Editor.css'

const Editor = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { currentProject, loading } = useAppSelector((state) => state.projects)
  const { showToast } = useToast()

  const [components, setComponents] = useState<ComponentNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [gridSize, setGridSize] = useState(20)
  const [showComponentLibrary, setShowComponentLibrary] = useState(true)
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(true)
  const [showImageUpload, setShowImageUpload] = useState(false)
  const [showAIAssistant, setShowAIAssistant] = useState(false)
  const [saveProgress, setSaveProgress] = useState(0)
  const [saveMessage, setSaveMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (projectId) {
      dispatch(fetchProject(parseInt(projectId)))
    }
  }, [projectId, dispatch])


  const handleSave = useCallback(async () => {
    if (!projectId || !currentProject) return

    const htmlContent = generateHTML(components)
    const rootComponents = components.filter((c) => !c.parentId)

    // Save ALL components (including children) to preserve the complete structure
    // This ensures navbars and other nested components are saved correctly
    const allComponents = components.map(comp => {
      // Deep copy props to ensure all nested objects (like style) are preserved
      const props = comp.props || {}
      const deepCopiedProps = {
        ...props,
        // Ensure style object is properly copied with all properties
        style: props.style ? { ...props.style } : {},
      }
      
      return {
        id: comp.id,
        type: comp.type,
        props: deepCopiedProps,
        parentId: comp.parentId || undefined,
      }
    })

    // Create project configuration as JSON
    const projectConfiguration = {
      components: allComponents, // Save all components, not just root
      editorSettings: {
        showGrid,
        gridSize,
        showComponentLibrary,
        showPropertiesPanel,
        showPreview,
      },
      metadata: {
        savedAt: new Date().toISOString(),
        componentCount: components.length,
      },
    }

    setIsSaving(true)
    setSaveProgress(10)
    setSaveMessage('Saving project data...')
    
    try {
      // Simulate progress updates during save
      const progressInterval = setInterval(() => {
        setSaveProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return prev
          }
          return prev + 5
        })
      }, 200)
      
      await dispatch(
        updateProject({
          id: parseInt(projectId),
          data: {
            html_content: htmlContent,
            css_content: currentProject?.css_content || '',
            component_tree: rootComponents, // Keep for backward compatibility
            configuration: projectConfiguration, // Save all components as JSON
          },
        })
      ).unwrap()
      
      clearInterval(progressInterval)
      setSaveProgress(30)
      setSaveMessage('Generating React components...')
      
      // Wait a bit to show the progress
      await new Promise(resolve => setTimeout(resolve, 500))
      setSaveProgress(60)
      setSaveMessage('Setting up FastAPI backend...')
      
      await new Promise(resolve => setTimeout(resolve, 500))
      setSaveProgress(90)
      setSaveMessage('Finalizing application...')
      
      await new Promise(resolve => setTimeout(resolve, 300))
      setSaveProgress(100)
      setSaveMessage('Application generated successfully!')
      
      // Refresh the project to get the latest application_url
      if (projectId) {
        await dispatch(fetchProject(parseInt(projectId)))
      }
      
      // Wait a moment to show completion
      await new Promise(resolve => setTimeout(resolve, 500))
      
      setIsSaving(false)
      setSaveProgress(0)
      setSaveMessage('')
      showToast('Project saved and application generated successfully!', 'success')
    } catch (error) {
      console.error('Failed to save project:', error)
      setIsSaving(false)
      setSaveProgress(0)
      setSaveMessage('')
      showToast('Failed to save project', 'error')
    }
  }, [dispatch, projectId, currentProject, components, showGrid, gridSize, showComponentLibrary, showPropertiesPanel, showPreview])

  // Listen for events from navbar
  useEffect(() => {
    const handleTogglePreview = (e: CustomEvent) => {
      setShowPreview(e.detail?.show ?? !showPreview)
    }
    const handleToggleComponentLibrary = (e: CustomEvent) => {
      setShowComponentLibrary(e.detail?.show ?? !showComponentLibrary)
    }
    const handleTogglePropertiesPanel = (e: CustomEvent) => {
      setShowPropertiesPanel(e.detail?.show ?? !showPropertiesPanel)
    }
    const handleOpenAIAssistant = () => {
      setShowAIAssistant(true)
    }
    const handleOpenImageUpload = () => {
      setShowImageUpload(true)
    }
    const handleToggleGrid = (e: CustomEvent) => {
      setShowGrid(e.detail?.show ?? !showGrid)
    }
    const handleGridSizeChange = (e: CustomEvent) => {
      setGridSize(e.detail?.size ?? gridSize)
    }
    const handleSaveEvent = () => {
      handleSave()
    }
    
    const handleCustomMarksGenerated = (e: CustomEvent) => {
      if (e.detail?.components) {
        setComponents(e.detail.components)
        showToast(`Successfully generated ${e.detail.components.length} component(s) from custom marks!`, 'success')
      }
    }
    
    window.addEventListener('togglePreview', handleTogglePreview as EventListener)
    window.addEventListener('openImageUpload', handleOpenImageUpload as EventListener)
    window.addEventListener('openAIAssistant', handleOpenAIAssistant as EventListener)
    window.addEventListener('customMarksGenerated', handleCustomMarksGenerated as EventListener)
    window.addEventListener('toggleComponentLibrary', handleToggleComponentLibrary as EventListener)
    window.addEventListener('togglePropertiesPanel', handleTogglePropertiesPanel as EventListener)
    window.addEventListener('toggleGrid', handleToggleGrid as EventListener)
    window.addEventListener('gridSizeChange', handleGridSizeChange as EventListener)
    window.addEventListener('editorSave', handleSaveEvent)
    
    return () => {
      window.removeEventListener('togglePreview', handleTogglePreview as EventListener)
      window.removeEventListener('openImageUpload', handleOpenImageUpload as EventListener)
      window.removeEventListener('openAIAssistant', handleOpenAIAssistant as EventListener)
      window.removeEventListener('customMarksGenerated', handleCustomMarksGenerated as EventListener)
      window.removeEventListener('toggleComponentLibrary', handleToggleComponentLibrary as EventListener)
      window.removeEventListener('togglePropertiesPanel', handleTogglePropertiesPanel as EventListener)
      window.removeEventListener('toggleGrid', handleToggleGrid as EventListener)
      window.removeEventListener('gridSizeChange', handleGridSizeChange as EventListener)
      window.removeEventListener('editorSave', handleSaveEvent)
    }
  }, [showPreview, showComponentLibrary, showPropertiesPanel, showGrid, gridSize, handleSave])

  // Emit state changes to navbar
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('editorGridToggle', { detail: { showGrid } }))
  }, [showGrid])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('editorGridSizeChange', { detail: { gridSize } }))
  }, [gridSize])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('editorComponentLibraryToggle', { detail: { show: showComponentLibrary } }))
  }, [showComponentLibrary])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('editorPropertiesPanelToggle', { detail: { show: showPropertiesPanel } }))
  }, [showPropertiesPanel])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('editorPreviewToggle', { detail: { show: showPreview } }))
  }, [showPreview])

  // Load project configuration when project is loaded
  useEffect(() => {
    if (currentProject) {
      // First, try to load from configuration JSON
      if (currentProject.configuration) {
        try {
          const config = typeof currentProject.configuration === 'string' 
            ? JSON.parse(currentProject.configuration) 
            : currentProject.configuration

          // Restore components from configuration
          if (config.components && Array.isArray(config.components)) {
            // Check if components are in flat array format (new format) or nested format (old format)
            // New format: flat array with parentId property
            // Old format: nested structure with children arrays
            const hasNestedChildren = config.components.some((c: any) => 
              c.children && Array.isArray(c.children) && c.children.length > 0
            )
            
            let allComponents: ComponentNode[] = []
            
            if (hasNestedChildren) {
              // Old format: nested structure - flatten it
              const flattenComponents = (comps: any[], parentId?: string): ComponentNode[] => {
                const flattened: ComponentNode[] = []
                comps.forEach((comp) => {
                  // Deep copy props to ensure all nested objects (like style) are preserved
                  const props = comp.props || {}
                  const deepCopiedProps = {
                    ...props,
                    // Ensure style object is properly copied
                    style: props.style ? { ...props.style } : {},
                  }
                  
                  const flatComp: ComponentNode = {
                    id: comp.id,
                    type: comp.type,
                    props: deepCopiedProps,
                    parentId: parentId || comp.parentId,
                  }
                  flattened.push(flatComp)
                  if (comp.children && Array.isArray(comp.children)) {
                    flattened.push(...flattenComponents(comp.children, comp.id))
                  }
                })
                return flattened
              }
              allComponents = flattenComponents(config.components)
            } else {
              // New format: flat array with parentId relationships
              allComponents = config.components.map((comp: any) => {
                // Deep copy props to ensure all nested objects (like style) are preserved
                const props = comp.props || {}
                const deepCopiedProps = {
                  ...props,
                  // Ensure style object is properly copied
                  style: props.style ? { ...props.style } : {},
                }
                
                return {
                  id: comp.id,
                  type: comp.type,
                  props: deepCopiedProps,
                  parentId: comp.parentId || undefined,
                }
              })
            }
            
            // Filter out invalid components
            const validComponents = allComponents.filter((comp: any) => {
              if (!comp || typeof comp !== 'object') return false
              if (!comp.id || typeof comp.id !== 'string') return false
              if (!comp.type || typeof comp.type !== 'string') return false
              if (/^\d+$/.test(comp.id)) return false
              return true
            })
            
            console.log('Loaded components from configuration:', {
              total: validComponents.length,
              root: validComponents.filter(c => !c.parentId).length,
              children: validComponents.filter(c => c.parentId).length
            })
            
            // Log a sample component to verify styles are loaded
            if (validComponents.length > 0) {
              const sampleComp = validComponents[0]
              console.log('Sample component styles:', {
                id: sampleComp.id,
                type: sampleComp.type,
                style: sampleComp.props?.style,
                hasStyle: !!sampleComp.props?.style,
                marginTop: sampleComp.props?.style?.marginTop,
              })
            }
            
            // Use a function to ensure state update happens correctly
            setComponents(() => validComponents)
          }

          // Restore editor settings from configuration
          if (config.editorSettings) {
            if (config.editorSettings.showGrid !== undefined) setShowGrid(config.editorSettings.showGrid)
            if (config.editorSettings.gridSize !== undefined) setGridSize(config.editorSettings.gridSize)
            if (config.editorSettings.showComponentLibrary !== undefined) setShowComponentLibrary(config.editorSettings.showComponentLibrary)
            if (config.editorSettings.showPropertiesPanel !== undefined) setShowPropertiesPanel(config.editorSettings.showPropertiesPanel)
            if (config.editorSettings.showPreview !== undefined) setShowPreview(config.editorSettings.showPreview)
          }
        } catch (error) {
          console.error('Failed to parse project configuration:', error)
        }
      }
      
      // Fallback to component_tree if configuration doesn't exist
      if (!currentProject.configuration && currentProject.component_tree) {
        try {
          const tree = Array.isArray(currentProject.component_tree)
            ? currentProject.component_tree
            : [currentProject.component_tree]
          
          // Filter out invalid components - must have id and type
          // Also filter out components with numeric-only IDs (likely corrupted data)
          const validComponents = tree.filter((comp: any) => {
            if (!comp || typeof comp !== 'object') return false
            if (!comp.id || typeof comp.id !== 'string') return false
            if (!comp.type || typeof comp.type !== 'string') return false
            
            // Filter out components with numeric-only IDs (like "17671816") - these are likely corrupted
            // Valid component IDs should contain letters or start with 'comp-'
            if (/^\d+$/.test(comp.id)) return false
            
            return true
          })
          
          setComponents(validComponents)
        } catch (err) {
          console.error('Error loading component tree:', err)
          setComponents([])
        }
      } else if (!currentProject.configuration && !currentProject.component_tree) {
        setComponents([])
      }
    } else {
      setComponents([])
    }
  }, [currentProject])

  const handleAddComponent = useCallback((component: ComponentNode, parentId?: string) => {
    setComponents((prev) => {
      const newComponent = {
        ...component,
        parentId: parentId || undefined,
      }
      return [...prev, newComponent]
    })
  }, [])

  const handleAddAIComponent = useCallback((aiComponent: any) => {
    // Convert AI-generated component structure to ComponentNode format
    let componentCounter = 0
    const baseTimestamp = Date.now()
    
    const convertAIComponent = (comp: any, parentId?: string): ComponentNode[] => {
      componentCounter++
      const randomId = Math.random().toString(36).substring(7)
      
      // Extract children from props if they exist (before creating componentNode)
      const props = { ...(comp.props || {}) }
      const childrenFromProps = props.children && Array.isArray(props.children) ? props.children : []
      const childrenFromRoot = comp.children && Array.isArray(comp.children) ? comp.children : []
      
      // Remove children from props if it's an array (we'll handle it separately)
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
        // Ensure form has at least some basic styles for visibility
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
        id: comp.id || `comp-${baseTimestamp}-${componentCounter}-${randomId}`,
        type: comp.type || 'div',
        props: props,
        children: [],
        parentId: parentId || undefined,
      }

      // Collect all components (parent + children) in a flat array
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

    const allComponents = convertAIComponent(aiComponent)
    
    // Add all components at once
    setComponents((prev) => [...prev, ...allComponents])
    
    console.log('AI Component added:', {
      root: allComponents[0],
      totalComponents: allComponents.length,
      children: allComponents.filter(c => c.parentId === allComponents[0].id)
    })
    
    showToast('AI-generated component added to canvas!', 'success')
  }, [showToast])

  const handleUpdateComponent = useCallback((id: string, updates: Partial<ComponentNode>) => {
    setComponents((prev) =>
      prev.map((comp) => {
        if (comp.id === id) {
          // Deep merge props, especially style object
          const mergedComp = { ...comp, ...updates }
          if (updates.props && comp.props) {
            mergedComp.props = {
              ...comp.props,
              ...updates.props,
              // Deep merge style object
              style: {
                ...(comp.props.style || {}),
                ...(updates.props.style || {})
              }
            }
          }
          return mergedComp
        }
        return comp
      })
    )
  }, [])

  const handleDeleteComponent = useCallback((id: string) => {
    const deleteRecursive = (compId: string) => {
      setComponents((prev) => {
        const toDelete = prev.filter((c) => c.id === compId || c.parentId === compId)
        const idsToDelete = new Set(toDelete.map((c) => c.id))
        return prev.filter((c) => !idsToDelete.has(c.id))
      })
    }
    deleteRecursive(id)
    if (selectedId === id) {
      setSelectedId(null)
    }
  }, [selectedId])

  const handleImageUpload = useCallback(async (file: File) => {
    try {
      console.log('Starting image upload and analysis...', file.name, file.size)
      const generatedComponents = await analyzeImageAndGenerateComponents(file)
      console.log('Generated components:', generatedComponents)
      console.log('Number of components:', generatedComponents?.length)
      
      if (generatedComponents && generatedComponents.length > 0) {
        // Replace existing components with new ones from image
        console.log('Setting components in state...')
        setComponents(generatedComponents)
        console.log('Components set. Root components:', generatedComponents.filter(c => !c.parentId).length)
        showToast(`Successfully generated ${generatedComponents.length} component(s) from the image!`, 'success')
      } else {
        console.warn('No components generated')
        showToast('No components could be generated from the image. Please try a different image.', 'warning')
      }
    } catch (error: any) {
      console.error('Image analysis failed:', error)
      console.error('Error details:', error?.response?.data || error?.message)
      const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error'
      showToast(`Failed to analyze image: ${errorMessage}`, 'error')
      throw error
    }
  }, [])

  const generateHTML = (comps: ComponentNode[]): string => {
    const renderComponent = (comp: ComponentNode): string => {
      const { type, props } = comp
      const style = props?.style || {}
      const styleString = Object.entries(style)
        .map(([key, value]) => `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value}`)
        .join('; ')

      const children = comps.filter((c) => c.parentId === comp.id)
      const childrenHTML = children.map((child) => renderComponent(child)).join('')

      const propsString = props?.className ? ` class="${props.className}"` : ''
      const styleAttr = styleString ? ` style="${styleString}"` : ''

      switch (type) {
        case 'div':
        case 'section':
          return `<${type}${propsString}${styleAttr}>${props?.children || ''}${childrenHTML}</${type}>`
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
        case 'p':
        case 'button':
          return `<${type}${propsString}${styleAttr}>${props?.children || ''}${childrenHTML}</${type}>`
        case 'img':
          return `<img src="${props?.src || ''}" alt="${props?.alt || ''}"${styleAttr} />`
        case 'ul':
          return `<ul${propsString}${styleAttr}>${childrenHTML}</ul>`
        case 'li':
          return `<li${propsString}${styleAttr}>${props?.children || ''}${childrenHTML}</li>`
        default:
          return `<div${propsString}${styleAttr}>${childrenHTML}</div>`
      }
    }

    const rootComponents = comps.filter((c) => !c.parentId)
    return rootComponents.map((comp) => renderComponent(comp)).join('')
  }

  const selectedComponent = components.find((c) => c.id === selectedId) || null

  // Preview component that renders components exactly like the canvas
  // Create a stable key based on component count and a hash of component data
  const previewKey = useMemo(() => {
    return components.length + '-' + JSON.stringify(components.map(c => ({ id: c.id, type: c.type, props: c.props })))
  }, [components])
  
  const PreviewRenderer = ({ components, cssContent }: { components: ComponentNode[], cssContent: string }) => {
    const rootComponents = components.filter((c) => !c.parentId)
    
    return (
      <div className="preview-renderer">
        <style>{cssContent}</style>
        {rootComponents.map((comp) => (
          <RenderComponent
            key={`${comp.id}-${JSON.stringify(comp.props)}`}
            component={comp}
            allComponents={components}
            selectedId={null}
            onSelect={() => {}}
            onUpdate={() => {}}
            onDelete={() => {}}
            onAdd={() => {}}
          />
        ))}
      </div>
    )
  }

  if (loading) {
    return <div className="editor-loading">Loading editor...</div>
  }

  if (!currentProject) {
    return (
      <div className="editor-error">
        <p>Project not found</p>
        <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    )
  }

  const htmlContent = generateHTML(components)

  return (
    <DndProvider backend={HTML5Backend}>
      <ProgressBar 
        progress={saveProgress} 
        message={saveMessage}
        isVisible={isSaving}
      />
      <div className="editor">
        <div className="editor-layout">
          {showComponentLibrary && <ComponentLibrary />}
          <div className="editor-main">
            <Canvas
              components={components}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onUpdate={handleUpdateComponent}
              onDelete={handleDeleteComponent}
              onAdd={handleAddComponent}
              showGrid={showGrid}
              gridSize={gridSize}
            />
          </div>
          {showPropertiesPanel && (
            <PropertiesPanel
              selectedComponent={selectedComponent}
              allComponents={components}
              onUpdate={handleUpdateComponent}
              onSelect={setSelectedId}
              onDelete={handleDeleteComponent}
              onAddComponent={handleAddComponent}
            />
          )}
        </div>

        {showPreview && (
          <div className="preview-modal" onClick={() => setShowPreview(false)}>
            <div className="preview-content" onClick={(e) => e.stopPropagation()}>
              <div className="preview-header">
                <h2>Preview</h2>
                <button onClick={() => setShowPreview(false)} title="Close Preview">×</button>
              </div>
              <div className="preview-body" key={previewKey}>
                <PreviewRenderer components={components} cssContent={currentProject?.css_content || ''} />
              </div>
            </div>
          </div>
        )}

        <ImageUploadModal
          isOpen={showImageUpload}
          onClose={() => setShowImageUpload(false)}
          onUpload={handleImageUpload}
        />

        <AIDevelopmentAssistant
          isOpen={showAIAssistant}
          onClose={() => setShowAIAssistant(false)}
          onAddComponent={handleAddAIComponent}
          existingComponents={components}
        />
      </div>
    </DndProvider>
  )
}

export default Editor
