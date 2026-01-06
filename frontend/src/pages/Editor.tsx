import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { fetchProject, updateProject } from '../store/slices/projectSlice'
import Canvas from '../components/Editor/Canvas'
import ComponentLibrary from '../components/Editor/ComponentLibrary'
import PropertiesPanel from '../components/Editor/PropertiesPanel'
import MovableAIPromptBox from '../components/Editor/MovableAIPromptBox'
import RenderComponent from '../components/Editor/RenderComponent'
import ProgressBar from '../components/ProgressBar'
import SavePageModal from '../components/Editor/SavePageModal'
import WorkflowViewerModal from '../components/Editor/WorkflowViewerModal'
import { ComponentNode, Page } from '../types/editor'
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
  const [pages, setPages] = useState<Page[]>([])
  const [currentPageId, setCurrentPageId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [gridSize, setGridSize] = useState(20)
  const [showComponentLibrary, setShowComponentLibrary] = useState(true)
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(true)
  const [showMovableAIPrompt, setShowMovableAIPrompt] = useState(false)
  const [saveProgress, setSaveProgress] = useState(0)
  const [saveMessage, setSaveMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showSavePageModal, setShowSavePageModal] = useState(false)
  const [showWorkflowViewer, setShowWorkflowViewer] = useState(false)
  const [workflowData, setWorkflowData] = useState<{ connections: any[]; pagePositions: { [pageId: string]: { x: number; y: number } } } | null>(null)

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
      pages: pages, // Save pages
      currentPageId: currentPageId, // Save current page
      workflow: workflowData || null, // Save workflow data (connections and page positions)
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
  }, [dispatch, projectId, currentProject, components, pages, currentPageId, showGrid, gridSize, showComponentLibrary, showPropertiesPanel, showPreview])

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
      // Open the movable AI prompt box
      setShowMovableAIPrompt(true)
    }
    const handleOpenSavePageModal = () => {
      setShowSavePageModal(true)
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
    window.addEventListener('openAIAssistant', handleOpenAIAssistant as EventListener)
    window.addEventListener('openSavePageModal', handleOpenSavePageModal as EventListener)
    window.addEventListener('customMarksGenerated', handleCustomMarksGenerated as EventListener)
    window.addEventListener('toggleComponentLibrary', handleToggleComponentLibrary as EventListener)
    window.addEventListener('togglePropertiesPanel', handleTogglePropertiesPanel as EventListener)
    window.addEventListener('toggleGrid', handleToggleGrid as EventListener)
    window.addEventListener('gridSizeChange', handleGridSizeChange as EventListener)
    window.addEventListener('editorSave', handleSaveEvent)
    
    return () => {
      window.removeEventListener('togglePreview', handleTogglePreview as EventListener)
      window.removeEventListener('openAIAssistant', handleOpenAIAssistant as EventListener)
      window.removeEventListener('openSavePageModal', handleOpenSavePageModal as EventListener)
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

  // Hide AI assistant when preview is shown
  useEffect(() => {
    if (showPreview && showMovableAIPrompt) {
      setShowMovableAIPrompt(false)
    }
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

          // Restore pages from configuration
          if (config.pages && Array.isArray(config.pages) && config.pages.length > 0) {
            setPages(config.pages)
            // Set current page to first page or null
            if (config.currentPageId) {
              setCurrentPageId(config.currentPageId)
            } else {
              setCurrentPageId(config.pages[0].id)
            }
          } else {
            // Create default page if no pages exist
            const defaultPage: Page = {
              id: `page-default-${Date.now()}`,
              name: `Page ${Date.now().toString().slice(-6)}`,
              route: '/',
              componentIds: []
            }
            setPages([defaultPage])
            setCurrentPageId(defaultPage.id)
          }

          // Restore editor settings from configuration
          if (config.editorSettings) {
            if (config.editorSettings.showGrid !== undefined) setShowGrid(config.editorSettings.showGrid)
            if (config.editorSettings.gridSize !== undefined) setGridSize(config.editorSettings.gridSize)
            if (config.editorSettings.showComponentLibrary !== undefined) setShowComponentLibrary(config.editorSettings.showComponentLibrary)
            if (config.editorSettings.showPropertiesPanel !== undefined) setShowPropertiesPanel(config.editorSettings.showPropertiesPanel)
            if (config.editorSettings.showPreview !== undefined) setShowPreview(config.editorSettings.showPreview)
          }

          // Restore workflow data from configuration
          if (config.workflow) {
            console.log('Loading workflow data from configuration:', config.workflow)
            setWorkflowData(config.workflow)
          } else {
            console.log('No workflow data found in configuration')
            setWorkflowData(null)
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

  // Create default page if no pages exist (separate effect to avoid dependency issues)
  useEffect(() => {
    if (pages.length === 0 && currentProject) {
      const defaultPage: Page = {
        id: `page-default-${Date.now()}`,
        name: `Page ${Date.now().toString().slice(-6)}`,
        route: '/',
        componentIds: []
      }
      setPages([defaultPage])
      setCurrentPageId(defaultPage.id)
    }
  }, [currentProject, pages.length])

  const handleAddComponent = useCallback((component: ComponentNode, parentId?: string) => {
    setComponents((prev) => {
      const newComponent = {
        ...component,
        parentId: parentId || undefined,
        // Assign component to current page if no pageId is set
        props: {
          ...component.props,
          pageId: component.props?.pageId || currentPageId || undefined,
        },
      }
      return [...prev, newComponent]
    })
  }, [currentPageId])

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
      
      // Assign to current page
      props.pageId = currentPageId || undefined
      
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

    // Handle arrays (for pages with multiple root components)
    if (Array.isArray(aiComponent)) {
      const allPageComponents: ComponentNode[] = []
      aiComponent.forEach((comp: any) => {
        const converted = convertAIComponent(comp)
        allPageComponents.push(...converted)
      })
      setComponents((prev) => [...prev, ...allPageComponents])
      // Auto-select the first root component
      const firstRootComponent = allPageComponents.find(c => !c.parentId)
      if (firstRootComponent) {
        setSelectedId(firstRootComponent.id)
      }
      console.log('AI Page added:', {
        sections: aiComponent.length,
        totalComponents: allPageComponents.length
      })
      showToast(`AI-generated page with ${aiComponent.length} sections added to canvas!`, 'success')
      return
    }

    // Handle single component
    const allComponents = convertAIComponent(aiComponent)
    
    // Add all components at once
    setComponents((prev) => [...prev, ...allComponents])
    
    // Auto-select the root component so user can immediately edit it
    const rootComponent = allComponents.find(c => !c.parentId) || allComponents[0]
    if (rootComponent) {
      setSelectedId(rootComponent.id)
    }
    
    console.log('AI Component added:', {
      root: allComponents[0],
      totalComponents: allComponents.length,
      children: allComponents.filter(c => c.parentId === allComponents[0].id)
    })
    
    showToast('AI-generated component added to canvas!', 'success')
  }, [showToast, currentPageId])

  const handleUpdateComponent = useCallback((id: string, updates: Partial<ComponentNode>) => {
    setComponents((prev) => {
      const componentExists = prev.some(comp => comp.id === id)
      if (!componentExists) {
        console.warn(`Component with id ${id} not found. Cannot update.`)
        return prev
      }
      
      return prev.map((comp) => {
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
            // Remove properties that are explicitly set to undefined or null
            Object.keys(mergedComp.props).forEach(key => {
              if (mergedComp.props[key] === undefined || mergedComp.props[key] === null) {
                delete mergedComp.props[key]
              }
            })
          } else if (updates.props) {
            // If comp.props doesn't exist but updates.props does, use updates.props
            mergedComp.props = { ...updates.props }
            // Remove undefined/null properties
            Object.keys(mergedComp.props).forEach(key => {
              if (mergedComp.props[key] === undefined || mergedComp.props[key] === null) {
                delete mergedComp.props[key]
              }
            })
          }
          return mergedComp
        }
        return comp
      })
    })
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

  const handleCreatePage = useCallback((componentId: string | '', pageName: string) => {
    const pageId = `page-${Date.now()}-${Math.random().toString(36).substring(7)}`
    const route = `/${pageName.toLowerCase().replace(/\s+/g, '-')}`
    
    // Get the current page ID before creating new page
    const previousPageId = currentPageId
    
    const newPage: Page = {
      id: pageId,
      name: pageName,
      route: route,
      componentIds: [], // New page starts blank
    }
    
    setPages((prev) => [...prev, newPage])
    
    // Ensure all components on the previous page have their pageId set
    // This prevents them from being lost when switching pages
    // Components without pageId belong to the current page (previousPageId)
    // DO NOT move any existing components to the new page - keep them on their current page
    setComponents((prev) => {
      return prev.map((comp) => {
        // If component doesn't have pageId, it belongs to the current page
        // Set it explicitly to preserve it on the old page
        if (previousPageId && !comp.props?.pageId) {
          return {
            ...comp,
            props: {
              ...comp.props,
              pageId: previousPageId,
            },
          }
        }
        // Keep all existing components on their current pages
        // Do NOT move the selected component to the new page
        // The new page should be blank
        return comp
      })
    })
    
    // Switch to the new page (which is blank)
    setCurrentPageId(pageId)
    
    showToast(`Page "${pageName}" created!`, 'success')
    return pageId
  }, [showToast, currentPageId])

  const handleNavigateToPage = useCallback((pageId: string) => {
    setCurrentPageId(pageId)
    const page = pages.find((p) => p.id === pageId)
    if (page) {
      showToast(`Navigated to page: ${page.name}`, 'info')
    }
  }, [pages, showToast])

  const handlePageRename = useCallback(async (pageId: string, newName: string) => {
    const updatedPages = pages.map((page) =>
      page.id === pageId
        ? {
            ...page,
            name: newName,
            route: `/${newName.toLowerCase().replace(/\s+/g, '-')}`,
          }
        : page
    )
    
    // Update local state
    setPages(updatedPages)
    
    // Auto-save pages to backend after rename
    if (projectId && currentProject) {
      try {
        const projectConfiguration = {
          components: components.map(comp => ({
            id: comp.id,
            type: comp.type,
            props: comp.props || {},
            parentId: comp.parentId || undefined,
          })),
          pages: updatedPages, // Use updated pages
          currentPageId: currentPageId,
          workflow: workflowData || null, // Include workflow data
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
        
        await dispatch(
          updateProject({
            id: parseInt(projectId),
            data: {
              html_content: currentProject.html_content || '',
              css_content: currentProject.css_content || '',
              component_tree: currentProject.component_tree || [],
              configuration: projectConfiguration,
            },
          })
        ).unwrap()
      } catch (error) {
        console.error('Failed to auto-save page rename:', error)
        showToast('Page renamed locally, but failed to save to backend', 'warning')
      }
    }
    
    showToast(`Page renamed to "${newName}"`, 'success')
  }, [showToast, projectId, currentProject, components, pages, currentPageId, showGrid, gridSize, showComponentLibrary, showPropertiesPanel, showPreview, dispatch])

  const handlePageDelete = useCallback((pageId: string) => {
    // Find the page to delete
    const pageToDelete = pages.find(p => p.id === pageId)
    if (!pageToDelete) return

    // Don't allow deleting if it's the only page
    if (pages.length <= 1) {
      showToast('Cannot delete the last page', 'error')
      return
    }

    // Delete all components on this page
    setComponents((prevComponents) => {
      // Get all component IDs on this page
      const componentIdsOnPage = prevComponents
        .filter(comp => comp.props?.pageId === pageId)
        .map(comp => comp.id)
      
      // Delete all components and their children recursively
      const idsToDelete = new Set<string>()
      const deleteRecursive = (compId: string) => {
        idsToDelete.add(compId)
        prevComponents.forEach(comp => {
          if (comp.parentId === compId) {
            deleteRecursive(comp.id)
          }
        })
      }
      
      componentIdsOnPage.forEach(id => deleteRecursive(id))
      
      // Clear selection if selected component was on deleted page
      if (selectedId && idsToDelete.has(selectedId)) {
        setSelectedId(null)
      }
      
      return prevComponents.filter(comp => !idsToDelete.has(comp.id))
    })

    // Remove the page
    setPages((prevPages) => prevPages.filter(page => page.id !== pageId))

    // If we deleted the current page, switch to another page
    if (currentPageId === pageId) {
      const remainingPages = pages.filter(p => p.id !== pageId)
      if (remainingPages.length > 0) {
        setCurrentPageId(remainingPages[0].id)
        showToast(`Page "${pageToDelete.name}" deleted. Switched to "${remainingPages[0].name}"`, 'success')
      }
    } else {
      showToast(`Page "${pageToDelete.name}" deleted`, 'success')
    }
  }, [pages, currentPageId, selectedId, showToast])

  const handleSavePage = useCallback((pageData: { name: string; description: string; page: Page; components: ComponentNode[] }) => {
    try {
      // Get existing saved pages from localStorage
      const savedPagesKey = 'savedCustomPages'
      const existingPages = JSON.parse(localStorage.getItem(savedPagesKey) || '[]')
      
      // Create deep copy of components to ensure exact copy without any modifications
      // The components are already filtered by pageId in SavePageModal, so use them as-is
      const pageComponents = pageData.components.map(comp => {
        // Create a deep copy using JSON parse/stringify to ensure complete copy
        const componentCopy = JSON.parse(JSON.stringify(comp))
        // Remove pageId from saved components so they can be assigned to any page when restored
        if (componentCopy.props) {
          delete componentCopy.props.pageId
        }
        return componentCopy
      })
      
      // Create saved page object with exact component copy
      const savedPage = {
        id: `saved-page-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        name: pageData.name,
        description: pageData.description,
        page: {
          name: pageData.page.name,
          route: pageData.page.route,
          // Don't save the actual page ID
        },
        components: pageComponents, // Exact copy of components without pageId
        createdAt: new Date().toISOString()
      }
      
      // Add to existing pages
      existingPages.push(savedPage)
      
      // Save back to localStorage
      localStorage.setItem(savedPagesKey, JSON.stringify(existingPages))
      
      // Dispatch event to refresh saved pages in PreBuiltComponentsModal
      window.dispatchEvent(new CustomEvent('pageSaved'))
      
      showToast(`Page "${pageData.name}" saved to pre-built pages!`, 'success')
    } catch (error) {
      console.error('Error saving page:', error)
      showToast('Failed to save page', 'error')
    }
  }, [showToast])

  const handleComponentClick = useCallback((componentId: string) => {
    const component = components.find((c) => c.id === componentId)
    if (component?.props?.pageId) {
      handleNavigateToPage(component.props.pageId)
    }
  }, [components, handleNavigateToPage])

  const handleReorderComponent = useCallback((draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => {
    setComponents((prev) => {
      const dragged = prev.find(c => c.id === draggedId)
      const target = prev.find(c => c.id === targetId)
      
      if (!dragged || !target) {
        console.warn('Reorder failed: dragged or target component not found', { draggedId, targetId })
        return prev
      }
      
      // Prevent dropping on itself
      if (draggedId === targetId) {
        return prev
      }
      
      // If dropping inside, just reparent
      if (position === 'inside') {
        // Prevent circular parent-child relationships
        const isDescendant = (parentId: string, childId: string): boolean => {
          const child = prev.find(c => c.id === childId)
          if (!child || !child.parentId) return false
          if (child.parentId === parentId) return true
          return isDescendant(parentId, child.parentId)
        }
        
        if (isDescendant(draggedId, targetId)) {
          console.warn('Cannot move component into its own descendant')
          return prev
        }
        
        return prev.map(comp => 
          comp.id === draggedId ? { ...comp, parentId: targetId } : comp
        )
      }
      
      // For reordering (before/after), we need to maintain array order
      // Components are rendered in array order, so we need to reorder the array
      const targetParentId = target.parentId
      
      // Step 1: Update dragged component's parent to match target's parent
      let newComponents = prev.map(comp => 
        comp.id === draggedId ? { ...comp, parentId: targetParentId } : comp
      )
      
      // Step 2: Remove dragged component from array
      const draggedComponent = newComponents.find(c => c.id === draggedId)!
      newComponents = newComponents.filter(c => c.id !== draggedId)
      
      // Step 3: Find target's position in the array (after removing dragged)
      const targetIndex = newComponents.findIndex(c => c.id === targetId)
      
      if (targetIndex === -1) {
        console.warn('Reorder failed: target not found after removing dragged', { targetId })
        return prev
      }
      
      // Step 4: Calculate insert position
      const insertIndex = position === 'before' ? targetIndex : targetIndex + 1
      
      // Step 5: Insert dragged component at the correct position
      newComponents.splice(insertIndex, 0, draggedComponent)
      
      return newComponents
    })
  }, [])

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
    
    // Collect all custom CSS from all components
    const allCustomCSS = useMemo(() => {
      const customCSSArray: string[] = []
      components.forEach((comp) => {
        if (comp.props?.customCSS) {
          const componentClass = `component-${comp.id.replace(/[^a-zA-Z0-9]/g, '-')}`
          let scopedCSS = comp.props.customCSS.trim()
          
          // Scope the CSS to this component's class
          const pseudoClassPattern = /(^|\n)(\s*)(:hover|:active|:focus|:before|:after|:first-child|:last-child|:nth-child\([^)]*\)|::before|::after)\s*\{/gi
          scopedCSS = scopedCSS.replace(pseudoClassPattern, (match, prefix, indent, pseudoClass) => {
            return `${prefix}${indent}.${componentClass}${pseudoClass} {`
          })
          
          // If no pseudo-classes were found and CSS doesn't already have a scoped selector, wrap it
          if (!scopedCSS.includes(`.${componentClass}`)) {
            if (!scopedCSS.match(/^[.#\w]/)) {
              scopedCSS = `.${componentClass} {\n${scopedCSS}\n}`
            }
          }
          
          customCSSArray.push(scopedCSS)
        }
      })
      return customCSSArray.join('\n\n')
    }, [components])
    
    return (
      <div className="preview-renderer" style={{ width: '100%', height: '100%', padding: 0, margin: 0 }}>
        <style>{cssContent}</style>
        {allCustomCSS && <style dangerouslySetInnerHTML={{ __html: allCustomCSS }} />}
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
              pages={pages}
              currentPageId={currentPageId}
              onPageChange={handleNavigateToPage}
              onPageRename={handlePageRename}
              onPageDelete={handlePageDelete}
              onCreatePage={handleCreatePage}
              onOpenWorkflowViewer={() => setShowWorkflowViewer(true)}
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
            onReorder={handleReorderComponent}
            pages={pages}
            currentPageId={currentPageId}
            projectId={currentProject?.id}
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

        {showMovableAIPrompt && !showPreview && (
          <MovableAIPromptBox
            onAddComponent={handleAddAIComponent}
            onUpdate={handleUpdateComponent}
            onSelect={setSelectedId}
            existingComponents={components}
            selectedComponent={components.find(c => c.id === selectedId) || null}
            frontendFramework={currentProject?.frontend_framework}
            backendFramework={currentProject?.backend_framework}
            onClose={() => setShowMovableAIPrompt(false)}
            projectId={currentProject?.id}
          />
        )}

        {showSavePageModal && (
          <SavePageModal
            isOpen={showSavePageModal}
            onClose={() => setShowSavePageModal(false)}
            onSave={handleSavePage}
            currentPage={pages.find(p => p.id === currentPageId) || null}
            pageComponents={(() => {
              // Get all components that belong to this page (including nested children)
              const pageId = currentPageId
              if (!pageId) return []
              
              // First, get all components with matching pageId
              const directPageComponents = components.filter(c => c.props?.pageId === pageId)
              
              // Then, recursively find all children of these components
              const allPageComponents = new Set<string>()
              const componentMap = new Map(components.map(c => [c.id, c]))
              
              const collectChildren = (compId: string) => {
                if (allPageComponents.has(compId)) return
                allPageComponents.add(compId)
                
                // Find all children of this component
                components.forEach(child => {
                  if (child.parentId === compId) {
                    collectChildren(child.id)
                  }
                })
              }
              
              // Start with root components (no parentId) that belong to this page
              directPageComponents.forEach(comp => {
                collectChildren(comp.id)
              })
              
              // Return all collected components in the same order as original
              return components.filter(c => allPageComponents.has(c.id))
            })()}
          />
        )}

        {showWorkflowViewer && (
          <WorkflowViewerModal
            isOpen={showWorkflowViewer}
            onClose={() => setShowWorkflowViewer(false)}
            pages={pages}
            components={components}
            currentPageId={currentPageId}
            onSave={async (workflowDataToSave) => {
              // Save workflow data to project configuration
              setWorkflowData(workflowDataToSave)
              
              if (projectId && currentProject) {
                try {
                  // Update project configuration with workflow data
                  const projectConfiguration = {
                    components: components.map(comp => ({
                      id: comp.id,
                      type: comp.type,
                      props: comp.props || {},
                      parentId: comp.parentId || undefined,
                    })),
                    pages: pages,
                    currentPageId: currentPageId,
                    workflow: workflowDataToSave, // Save workflow data
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
                  
                  await dispatch(
                    updateProject({
                      id: parseInt(projectId),
                      data: {
                        html_content: currentProject.html_content || '',
                        css_content: currentProject.css_content || '',
                        component_tree: currentProject.component_tree || [],
                        configuration: projectConfiguration,
                      },
                    })
                  ).unwrap()
                  
                  showToast('Workflow saved successfully!', 'success')
                } catch (error) {
                  console.error('Failed to save workflow:', error)
                  showToast('Failed to save workflow to database', 'error')
                }
              }
            }}
            savedWorkflowData={workflowData}
          />
        )}
      </div>
    </DndProvider>
  )
}

export default Editor
