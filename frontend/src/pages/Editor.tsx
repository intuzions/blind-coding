import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { fetchProject, updateProject } from '../store/slices/projectSlice'
import Canvas from '../components/Editor/Canvas'
import ComponentLibrary from '../components/Editor/ComponentLibrary'
import PropertiesPanel from '../components/Editor/PropertiesPanel'
import { ComponentNode } from '../types/editor'
import { FiSave, FiArrowLeft, FiEye, FiGrid, FiSidebar, FiX } from 'react-icons/fi'
import './Editor.css'

const Editor = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { currentProject, loading } = useAppSelector((state) => state.projects)

  const [components, setComponents] = useState<ComponentNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [gridSize, setGridSize] = useState(20)
  const [showComponentLibrary, setShowComponentLibrary] = useState(true)
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(true)

  useEffect(() => {
    if (projectId) {
      dispatch(fetchProject(parseInt(projectId)))
    }
  }, [projectId, dispatch])


  const handleSave = useCallback(async () => {
    if (!projectId || !currentProject) return

    const htmlContent = generateHTML(components)
    const rootComponents = components.filter((c) => !c.parentId)

    try {
      await dispatch(
        updateProject({
          id: parseInt(projectId),
          data: {
            html_content: htmlContent,
            css_content: currentProject?.css_content || '',
            component_tree: rootComponents,
          },
        })
      ).unwrap()
      alert('Project saved successfully!')
    } catch (error) {
      console.error('Failed to save project:', error)
      alert('Failed to save project')
    }
  }, [dispatch, projectId, currentProject, components])

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
    const handleToggleGrid = (e: CustomEvent) => {
      setShowGrid(e.detail?.show ?? !showGrid)
    }
    const handleGridSizeChange = (e: CustomEvent) => {
      setGridSize(e.detail?.size ?? gridSize)
    }
    const handleSaveEvent = () => {
      handleSave()
    }
    
    window.addEventListener('togglePreview', handleTogglePreview as EventListener)
    window.addEventListener('toggleComponentLibrary', handleToggleComponentLibrary as EventListener)
    window.addEventListener('togglePropertiesPanel', handleTogglePropertiesPanel as EventListener)
    window.addEventListener('toggleGrid', handleToggleGrid as EventListener)
    window.addEventListener('gridSizeChange', handleGridSizeChange as EventListener)
    window.addEventListener('editorSave', handleSaveEvent)
    
    return () => {
      window.removeEventListener('togglePreview', handleTogglePreview as EventListener)
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

  useEffect(() => {
    if (currentProject?.component_tree) {
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

  const handleUpdateComponent = useCallback((id: string, updates: Partial<ComponentNode>) => {
    setComponents((prev) =>
      prev.map((comp) => (comp.id === id ? { ...comp, ...updates } : comp))
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
            />
          )}
        </div>

        {showPreview && (
          <div className="preview-modal" onClick={() => setShowPreview(false)}>
            <div className="preview-content" onClick={(e) => e.stopPropagation()}>
              <div className="preview-header">
                <h2>Preview</h2>
                <button onClick={() => setShowPreview(false)}>×</button>
              </div>
              <iframe
                title="preview"
                srcDoc={`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
                        ${currentProject?.css_content || ''}
                      </style>
                    </head>
                    <body>${htmlContent}</body>
                  </html>
                `}
                className="preview-iframe-modal"
              />
            </div>
          </div>
        )}
      </div>
    </DndProvider>
  )
}

export default Editor
