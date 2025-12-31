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
  const [{ isOver }, drop] = useDrop({
    accept: 'component',
    drop: (item: { type: string; props?: any }, monitor) => {
      // Only create root component if drop wasn't handled by a child component
      if (monitor.didDrop()) {
        return
      }
      
      const newComponent: ComponentNode = {
        id: `comp-${Date.now()}-${Math.random()}`,
        type: item.type,
        props: {
          ...item.props,
          style: {
            ...item.props?.style,
            position: 'absolute',
            top: '0px',
            left: '0px',
          },
        },
        children: [],
      }
      onAdd(newComponent)
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
