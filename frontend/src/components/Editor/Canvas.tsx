import { useDrop } from 'react-dnd'
import { ComponentNode, Page } from '../../types/editor'
import RenderComponent from './RenderComponent'
import { FiEdit2, FiTrash2, FiFilePlus, FiEye } from 'react-icons/fi'
import './Canvas.css'

interface CanvasProps {
  components: ComponentNode[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUpdate: (id: string, updates: Partial<ComponentNode>) => void
  onDelete: (id: string) => void
  onAdd: (component: ComponentNode, parentId?: string) => void
  showGrid?: boolean
  gridSize?: number
  pages?: Page[]
  currentPageId?: string | null
  onPageChange?: (pageId: string) => void
  onPageRename?: (pageId: string, newName: string) => void
  onPageDelete?: (pageId: string) => void
  onCreatePage?: (componentId: string, pageName: string) => string
  onOpenWorkflowViewer?: () => void
}

const Canvas = ({
  components,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  onCreatePage,
  onAdd,
  showGrid = false,
  gridSize = 20,
  pages = [],
  currentPageId = null,
  onPageChange,
  onPageRename,
  onPageDelete,
  onOpenWorkflowViewer,
}: CanvasProps) => {
  // Helper function to recursively create child components
  const createChildComponents = (childrenArray: any[], parentId: string, baseTimestamp: number): ComponentNode[] => {
    if (!Array.isArray(childrenArray)) return []
    
    return childrenArray.map((childDef, index) => {
      const childProps: any = { ...(childDef.props || {}) }
      
      // Deep clone style object to ensure all properties are preserved
      if (childDef.props?.style) {
        childProps.style = { ...childDef.props.style }
        // Preserve all style properties including display, position, margin, padding, etc.
        Object.keys(childDef.props.style).forEach(key => {
          childProps.style[key] = childDef.props.style[key]
        })
      }
      
      // Preserve data attributes
      if (childDef.props?.['data-chart-type']) {
        childProps['data-chart-type'] = childDef.props['data-chart-type']
      }
      if (childDef.props?.['data-chart-data']) {
        childProps['data-chart-data'] = childDef.props['data-chart-data']
      }
      
      // Preserve AG Grid data attributes
      if (childDef.props?.['data-ag-grid']) {
        childProps['data-ag-grid'] = childDef.props['data-ag-grid']
      }
      if (childDef.props?.['data-ag-grid-config']) {
        childProps['data-ag-grid-config'] = childDef.props['data-ag-grid-config']
      }
      
      // Preserve className
      if (childDef.props?.className) {
        childProps.className = childDef.props.className
      }
      
      // Handle direct children text content
      if (typeof childDef.props?.children === 'string') {
        childProps.children = childDef.props.children
      }
      
      const childComponent: ComponentNode = {
        id: `comp-${baseTimestamp}-${index}-${Math.random()}`,
        type: childDef.type,
        props: childProps,
        children: [],
        parentId: parentId,
      }
      
      // Recursively process nested children
      if (childDef.props?.children && Array.isArray(childDef.props.children)) {
        const nestedChildren = createChildComponents(childDef.props.children, childComponent.id, baseTimestamp)
        nestedChildren.forEach(nestedChild => {
          onAdd(nestedChild, childComponent.id)
        })
      }
      
      return childComponent
    })
  }

  const [{ isOver }, drop] = useDrop({
    accept: 'component',
    drop: (item: { type: string; props?: any; savedPage?: any; components?: ComponentNode[] }, monitor) => {
      // Only create root component if drop wasn't handled by a child component
      if (monitor.didDrop()) {
        return
      }
      
      // Handle custom page drop - add all components from the saved page
      if (item.type === 'customPage' && item.components && Array.isArray(item.components)) {
        const baseTimestamp = Date.now()
        const componentIdMap = new Map<string, string>() // Map old IDs to new IDs
        
        // First pass: create all components with new IDs
        item.components.forEach((comp, index) => {
          const newId = `comp-${baseTimestamp}-${index}-${Math.random().toString(36).substring(7)}`
          componentIdMap.set(comp.id, newId)
        })
        
        // Second pass: add components with updated IDs and parent references
        item.components.forEach((comp) => {
          const newId = componentIdMap.get(comp.id)!
          const newParentId = comp.parentId ? componentIdMap.get(comp.parentId) : undefined
          
          const newComponent: ComponentNode = {
            ...comp,
            id: newId,
            parentId: newParentId,
            props: {
              ...comp.props,
              pageId: currentPageId || undefined, // Assign to current page
            }
          }
          
          onAdd(newComponent, newParentId)
        })
        
        return
      }
      
      // Preserve ALL props including data attributes, style, className, etc.
      const newProps: any = { ...item.props }
      
      // Extract children array before removing it from props
      const childrenArray = newProps.children && Array.isArray(newProps.children) ? newProps.children : null
      
      // Remove children array from props (we'll create actual ComponentNode children)
      if (childrenArray) {
        delete newProps.children
      }
      
      // Deep clone style object to ensure all properties are preserved
      if (item.props?.style) {
        newProps.style = { ...item.props.style }
        // Preserve all style properties including display, position, margin, padding, etc.
        Object.keys(item.props.style).forEach(key => {
          newProps.style[key] = item.props.style[key]
        })
      }
      
      // Preserve data attributes (important for charts)
      if (item.props?.['data-chart-type']) {
        newProps['data-chart-type'] = item.props['data-chart-type']
      }
      if (item.props?.['data-chart-data']) {
        newProps['data-chart-data'] = item.props['data-chart-data']
      }
      
      // Preserve AG Grid data attributes
      if (item.props?.['data-ag-grid']) {
        newProps['data-ag-grid'] = item.props['data-ag-grid']
      }
      if (item.props?.['data-ag-grid-config']) {
        newProps['data-ag-grid-config'] = item.props['data-ag-grid-config']
      }
      
      // Preserve className (important for chart-container)
      if (item.props?.className) {
        newProps.className = item.props.className
      }
      
      const baseTimestamp = Date.now()
      const newComponent: ComponentNode = {
        id: `comp-${baseTimestamp}-${Math.random()}`,
        type: item.type,
        props: {
          ...newProps,
          // Assign to current page
          pageId: currentPageId || undefined,
        },
        children: [],
      }
      
      // Add the root component first
      onAdd(newComponent)
      
      // Then create and add child components if they exist
      if (childrenArray && childrenArray.length > 0) {
        const childComponents = createChildComponents(childrenArray, newComponent.id, baseTimestamp)
        childComponents.forEach(child => {
          onAdd(child, newComponent.id)
        })
      }
      
      console.log('Adding component to canvas:', {
        type: newComponent.type,
        hasChildren: !!childrenArray,
        childrenCount: childrenArray?.length || 0,
        hasChartType: !!newProps['data-chart-type'],
        hasChartData: !!newProps['data-chart-data'],
        className: newProps.className
      })
    },
    collect: (monitor) => ({
      isOver: monitor.isOver() && monitor.canDrop(),
    }),
  })

  // Filter components by current page
  const defaultPageId = pages.length > 0 ? pages[0].id : null
  const filteredComponents = currentPageId
    ? components.filter((comp) => {
        // Get the page for this component
        const componentPageId = comp.props?.pageId
        // If component has a pageId, it must match currentPageId
        if (componentPageId) {
          return componentPageId === currentPageId
        }
        // If no pageId, it belongs to the default page (first page)
        // So show it only if currentPageId is the default page
        return currentPageId === defaultPageId
      })
    : components

  const rootComponents = filteredComponents.filter((comp) => !comp.parentId)

  const handlePageNameEdit = (page: Page) => {
    const newName = prompt('Enter new page name:', page.name)
    if (newName && newName.trim() && onPageRename) {
      onPageRename(page.id, newName.trim())
    }
  }

  return (
    <div className="canvas-wrapper">
      <div className="canvas-toolbar">
        <div className="canvas-title">
          <h3>Canvas</h3>
          <span className="canvas-subtitle">Drop components here to build your page</span>
        </div>
        {pages.length > 0 && onPageChange && (
          <div className="canvas-page-selector">
            <label htmlFor="page-select" style={{ fontSize: '0.75rem', color: '#666', marginRight: '0.5rem' }}>
              Page:
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <select
                id="page-select"
                value={currentPageId || pages[0]?.id || ''}
                onChange={(e) => onPageChange(e.target.value)}
                style={{
                  padding: '0.4rem 0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  minWidth: '150px'
                }}
              >
                {pages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                  </option>
                ))}
              </select>
              {currentPageId && onPageRename && (
                <button
                  onClick={() => {
                    const page = pages.find(p => p.id === currentPageId)
                    if (page) handlePageNameEdit(page)
                  }}
                  style={{
                    padding: '0.4rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Rename page"
                >
                  <FiEdit2 size={14} />
                </button>
              )}
              {currentPageId && onPageDelete && (
                <button
                  onClick={() => {
                    if (pages.length <= 1) {
                      return // Don't allow deleting the last page
                    }
                    const page = pages.find(p => p.id === currentPageId)
                    if (page && onPageDelete) {
                      if (window.confirm(`Are you sure you want to delete page "${page.name}"? This will also delete all components on this page.`)) {
                        onPageDelete(currentPageId)
                      }
                    }
                  }}
                  disabled={pages.length <= 1}
                  style={{
                    padding: '0.4rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    backgroundColor: pages.length <= 1 ? '#f5f5f5' : 'white',
                    cursor: pages.length <= 1 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: pages.length <= 1 ? '#999' : '#e74c3c',
                    opacity: pages.length <= 1 ? 0.5 : 1
                  }}
                  title={pages.length <= 1 ? 'Cannot delete the last page' : 'Delete page'}
                >
                  <FiTrash2 size={14} />
                </button>
              )}
              {onCreatePage && (
                <button
                  onClick={() => {
                    const pageName = prompt('Enter page name:')
                    if (pageName && pageName.trim()) {
                      // Create page with empty componentId (not linking to any component)
                      onCreatePage('', pageName.trim())
                    }
                  }}
                  style={{
                    padding: '0.4rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    backgroundColor: '#667eea',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s'
                  }}
                  title="Create new page"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#5568d3'
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#667eea'
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
                >
                  <FiFilePlus size={14} />
                </button>
              )}
              {onOpenWorkflowViewer && (
                <button
                  onClick={onOpenWorkflowViewer}
                  style={{
                    padding: '0.4rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s'
                  }}
                  title="View application workflow"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#059669'
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#10b981'
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
                >
                  <FiEye size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <div
        ref={drop}
        className={`canvas ${isOver ? 'canvas-over' : ''} ${showGrid ? 'canvas-grid' : ''}`}
        style={showGrid ? { 
          backgroundSize: `${gridSize}px ${gridSize}px` 
        } : {}}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onSelect(null)
          }
        }}
      >
        <div className="canvas-content">
          {rootComponents.length === 0 ? (
            <div className="canvas-empty">
              <div className="canvas-empty-icon">+</div>
              <p>Drag components here to start building</p>
              <span className="canvas-empty-hint">Components will appear here when you drop them</span>
            </div>
          ) : (
            rootComponents.map((component) => (
              <RenderComponent
                key={component.id}
                component={component}
                allComponents={filteredComponents}
                selectedId={selectedId}
                onSelect={onSelect}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAdd={onAdd}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default Canvas
