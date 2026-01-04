import { useDrop } from 'react-dnd'
import { ComponentNode } from '../../types/editor'
import RenderComponent from './RenderComponent'
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
}

const Canvas = ({
  components,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  onAdd,
  showGrid = false,
  gridSize = 20,
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
    drop: (item: { type: string; props?: any }, monitor) => {
      // Only create root component if drop wasn't handled by a child component
      if (monitor.didDrop()) {
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
        props: newProps,
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

  const rootComponents = components.filter((comp) => !comp.parentId)

  return (
    <div className="canvas-wrapper">
      <div className="canvas-toolbar">
        <div className="canvas-title">
          <h3>Canvas</h3>
          <span className="canvas-subtitle">Drop components here to build your page</span>
        </div>
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
                allComponents={components}
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
