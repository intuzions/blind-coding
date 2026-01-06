import React, { useState, useRef, useEffect } from 'react'
import { FiX, FiArrowRight, FiEye, FiMinus, FiZap, FiCornerDownRight, FiMaximize2, FiSave } from 'react-icons/fi'
import { Page, ComponentNode } from '../../types/editor'
import './WorkflowViewerModal.css'

interface WorkflowViewerModalProps {
  isOpen: boolean
  onClose: () => void
  pages: Page[]
  components: ComponentNode[]
  currentPageId: string | null
  onSave?: (workflowData: { connections: Connection[]; pagePositions: { [pageId: string]: { x: number; y: number } } }) => void
  savedWorkflowData?: { connections: Connection[]; pagePositions: { [pageId: string]: { x: number; y: number } } } | null
}

type ConnectionType = 'direct' | 'crossed' | 'indirect' | 'modal' | 'arrow'
type ConnectionPoint = 'top' | 'bottom' | 'left' | 'right'

interface Connection {
  id: string
  fromPageId: string
  toPageId: string
  fromPoint: ConnectionPoint
  toPoint: ConnectionPoint
  type: ConnectionType
  label?: string
}

const WorkflowViewerModal: React.FC<WorkflowViewerModalProps> = ({ isOpen, onClose, pages, components, currentPageId, onSave, savedWorkflowData }) => {
  const [activeTab, setActiveTab] = useState<'workflow' | 'userflow'>('workflow')
  const [connections, setConnections] = useState<Connection[]>([])
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectingFrom, setConnectingFrom] = useState<{ pageId: string; point: ConnectionPoint } | null>(null)
  const [selectedConnectionType, setSelectedConnectionType] = useState<ConnectionType>('arrow')
  const [pagePositions, setPagePositions] = useState<{ [pageId: string]: { x: number; y: number } }>({})
  const [draggingPage, setDraggingPage] = useState<string | null>(null)
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 })
  const [pageStartPos, setPageStartPos] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)

  // Load saved workflow data when modal opens
  useEffect(() => {
    if (isOpen && pages.length > 0) {
      console.log('Loading workflow data, savedWorkflowData:', savedWorkflowData)
      
      // First, try to load from savedWorkflowData prop (from database)
      if (savedWorkflowData && savedWorkflowData.connections) {
        console.log('Loading connections from savedWorkflowData:', savedWorkflowData.connections.length)
        setConnections(savedWorkflowData.connections)
      }
      
      if (savedWorkflowData && savedWorkflowData.pagePositions) {
        console.log('Loading page positions from savedWorkflowData:', Object.keys(savedWorkflowData.pagePositions).length)
        setPagePositions(savedWorkflowData.pagePositions)
      } else {
        // Initialize page positions if no saved positions
        console.log('Initializing page positions for', pages.length, 'pages')
        setPagePositions(prevPositions => {
          const newPositions: { [pageId: string]: { x: number; y: number } } = {}
          
          pages.forEach((page, index) => {
            // If page already has a position, keep it
            if (prevPositions[page.id]) {
              newPositions[page.id] = prevPositions[page.id]
              console.log(`Keeping position for page ${page.id}:`, prevPositions[page.id])
            } else {
              // Arrange pages in a grid layout
              const cols = Math.ceil(Math.sqrt(pages.length))
              const row = Math.floor(index / cols)
              const col = index % cols
              newPositions[page.id] = {
                x: 150 + col * 300,
                y: 150 + row * 250
              }
              console.log(`Setting new position for page ${page.id} (${page.name}):`, newPositions[page.id])
            }
          })
          
          return newPositions
        })
      }
      
      // Fallback: Try to load saved workflow from localStorage if no database data
      if (!savedWorkflowData || !savedWorkflowData.connections) {
        const savedWorkflow = localStorage.getItem(`workflow_${pages[0]?.id || 'default'}`)
        if (savedWorkflow) {
          try {
            const workflowData = JSON.parse(savedWorkflow)
            if (workflowData.connections) {
              console.log('Loading connections from localStorage:', workflowData.connections.length)
              setConnections(workflowData.connections)
            }
            if (workflowData.pagePositions && !savedWorkflowData?.pagePositions) {
              setPagePositions(workflowData.pagePositions)
            }
          } catch (e) {
            console.error('Error loading saved workflow:', e)
          }
        }
      }
    }
  }, [isOpen, pages, savedWorkflowData])

  // Debug: Log pages when modal opens
  useEffect(() => {
    if (isOpen) {
      console.log('WorkflowViewer - Pages:', pages)
      console.log('WorkflowViewer - Pages count:', pages.length)
      pages.forEach((page, index) => {
        console.log(`Page ${index + 1}:`, { id: page.id, name: page.name, route: page.route })
      })
    }
  }, [isOpen, pages])

  if (!isOpen) return null

  const handleConnectionPointClick = (pageId: string, point: ConnectionPoint, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    
    if (!isConnecting) {
      // If not in connecting mode, activate it with the selected tool
      setIsConnecting(true)
      setConnectingFrom({ pageId, point })
      console.log('Starting connection from:', { pageId, point })
      return
    }
    
    if (connectingFrom) {
      // Complete connection
      if (connectingFrom.pageId !== pageId) {
        const newConnection: Connection = {
          id: `conn-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          fromPageId: connectingFrom.pageId,
          toPageId: pageId,
          fromPoint: connectingFrom.point,
          toPoint: point,
          type: selectedConnectionType
        }
        console.log('Creating connection:', newConnection)
        setConnections([...connections, newConnection])
        setIsConnecting(false)
        setConnectingFrom(null)
      } else {
        // Same page, just reset
        console.log('Same page clicked, resetting connection')
        setIsConnecting(false)
        setConnectingFrom(null)
      }
    } else {
      // Start connection from this point
      setConnectingFrom({ pageId, point })
      console.log('Starting connection from:', { pageId, point })
    }
  }

  const handlePageMouseDown = (e: React.MouseEvent, pageId: string) => {
    // Check if the click is on a connection point
    const target = e.target as HTMLElement
    if (target.classList.contains('connection-point')) {
      // Let the connection point handle the click
      return
    }
    
    e.stopPropagation()
    if (isConnecting) {
      // Don't drag when connecting
      return
    }
    
    const pagePos = pagePositions[pageId]
    if (pagePos && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      setDraggingPage(pageId)
      setDragStartPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
      setPageStartPos(pagePos)
    }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (draggingPage && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      const currentX = e.clientX - rect.left
      const currentY = e.clientY - rect.top
      
      const deltaX = currentX - dragStartPos.x
      const deltaY = currentY - dragStartPos.y
      
      const newX = Math.max(0, pageStartPos.x + deltaX)
      const newY = Math.max(0, pageStartPos.y + deltaY)
      
      setPagePositions(prev => ({
        ...prev,
        [draggingPage]: { x: newX, y: newY }
      }))
    }
  }

  const handleMouseUp = () => {
    setDraggingPage(null)
  }

  useEffect(() => {
    if (draggingPage) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [draggingPage, dragStartPos, pageStartPos])

  const deleteConnection = (connectionId: string) => {
    setConnections(connections.filter(c => c.id !== connectionId))
  }

  const getConnectionPointPosition = (pageId: string, point: ConnectionPoint): { x: number; y: number } => {
    const pos = pagePositions[pageId] || { x: 0, y: 0 }
    const nodeWidth = 200
    const nodeHeight = 80
    // Connection points are 14px circles (radius = 7px)
    // CSS: positioned at -6px from edges, so the circle's edge is at -6px from the node edge
    // The center of the circle is at: edge position - 6px + 7px = edge position + 1px
    
    switch (point) {
      case 'top':
        // Top edge of node is at pos.y
        // Connection point top edge is at pos.y - 6px
        // Connection point center is at pos.y - 6px + 7px = pos.y + 1px
        return { x: pos.x + nodeWidth / 2, y: pos.y + 1 }
      case 'bottom':
        // Bottom edge of node is at pos.y + nodeHeight
        // Connection point bottom edge is at pos.y + nodeHeight + 6px (because bottom: -6px)
        // Connection point center is at pos.y + nodeHeight + 6px - 7px = pos.y + nodeHeight - 1px
        return { x: pos.x + nodeWidth / 2, y: pos.y + nodeHeight - 1 }
      case 'left':
        // Left edge of node is at pos.x
        // Connection point left edge is at pos.x - 6px
        // Connection point center is at pos.x - 6px + 7px = pos.x + 1px
        return { x: pos.x + 1, y: pos.y + nodeHeight / 2 }
      case 'right':
        // Right edge of node is at pos.x + nodeWidth
        // Connection point right edge is at pos.x + nodeWidth + 6px (because right: -6px)
        // Connection point center is at pos.x + nodeWidth + 6px - 7px = pos.x + nodeWidth - 1px
        return { x: pos.x + nodeWidth - 1, y: pos.y + nodeHeight / 2 }
      default:
        return { x: pos.x + nodeWidth / 2, y: pos.y + nodeHeight / 2 }
    }
  }

  const calculateConnectionPath = (from: { x: number; y: number }, to: { x: number; y: number }, type: ConnectionType) => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    // If distance is too small, don't draw
    if (distance < 1) {
      return { path: '', arrowHead: '', type }
    }
    
    const angle = Math.atan2(dy, dx)
    
    // Connection point radius (14px circle = 7px radius)
    // To ensure the arrow visually touches both connection points, draw from center to center
    // This is the most reliable way to ensure both ends touch the connection point buttons
    const connectionPointRadius = 7
    
    // Start from the source connection point center (or very close to it)
    // This ensures the arrow clearly starts from the connection point
    const startX = from.x
    const startY = from.y
    
    // End at the destination connection point center (or very close to it)
    // This ensures the arrow clearly ends at the connection point
    const endX = to.x
    const endY = to.y
    
    // Arrow head size
    const headLength = 12
    const headAngle = Math.PI / 6
    
    // Arrow tip should be at the end point (edge of destination circle)
    // The arrow head points toward the connection point center
    const arrowTipX = endX
    const arrowTipY = endY
    
    // Calculate arrow head points - the arrow head extends back from the tip
    const x1 = arrowTipX - headLength * Math.cos(angle - headAngle)
    const y1 = arrowTipY - headLength * Math.sin(angle - headAngle)
    const x2 = arrowTipX - headLength * Math.cos(angle + headAngle)
    const y2 = arrowTipY - headLength * Math.sin(angle + headAngle)
    
    let path = ''
    let arrowHead = `M ${arrowTipX} ${arrowTipY} L ${x1} ${y1} M ${arrowTipX} ${arrowTipY} L ${x2} ${y2}`
    
    switch (type) {
      case 'direct':
        // Straight line from source edge to destination edge
        path = `M ${startX} ${startY} L ${endX} ${endY}`
        break
      case 'crossed':
        // Line with a cross in the middle
        const midX = (startX + endX) / 2
        const midY = (startY + endY) / 2
        const crossSize = 10
        const perpAngle = angle + Math.PI / 2
        path = `M ${startX} ${startY} L ${endX} ${endY}`
        arrowHead += ` M ${midX - crossSize * Math.cos(perpAngle)} ${midY - crossSize * Math.sin(perpAngle)} L ${midX + crossSize * Math.cos(perpAngle)} ${midY + crossSize * Math.sin(perpAngle)}`
        break
      case 'indirect':
        // Curved/stepped line
        const controlX = (startX + endX) / 2 + 30 * Math.cos(angle + Math.PI / 2)
        const controlY = (startY + endY) / 2 + 30 * Math.sin(angle + Math.PI / 2)
        path = `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`
        break
      case 'modal':
        // Dashed line
        path = `M ${startX} ${startY} L ${endX} ${endY}`
        break
      case 'arrow':
        // Arrow with filled head
        path = `M ${startX} ${startY} L ${endX} ${endY}`
        break
      default:
        path = `M ${startX} ${startY} L ${endX} ${endY}`
    }
    
    return { path, arrowHead, type }
  }

  const getConnectionStyle = (type: ConnectionType) => {
    switch (type) {
      case 'direct':
        return { stroke: '#667eea', strokeWidth: 2, strokeDasharray: 'none' }
      case 'crossed':
        return { stroke: '#ef4444', strokeWidth: 2, strokeDasharray: 'none' }
      case 'indirect':
        return { stroke: '#10b981', strokeWidth: 2, strokeDasharray: 'none' }
      case 'modal':
        return { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '5,5' }
      case 'arrow':
        return { stroke: '#8b5cf6', strokeWidth: 3, strokeDasharray: 'none' }
      default:
        return { stroke: '#667eea', strokeWidth: 2, strokeDasharray: 'none' }
    }
  }

  return (
    <div className="workflow-viewer-modal-overlay" onClick={onClose}>
      <div className="workflow-viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="workflow-viewer-modal-header">
          <h2>Application Flow</h2>
          <button className="workflow-viewer-modal-close" onClick={onClose}>
            <FiX size={24} />
          </button>
        </div>
        
        <div className="workflow-viewer-tabs">
          <button
            className={`workflow-tab-button ${activeTab === 'workflow' ? 'active' : ''}`}
            onClick={() => setActiveTab('workflow')}
          >
            Workflow
          </button>
          <button
            className={`workflow-tab-button ${activeTab === 'userflow' ? 'active' : ''}`}
            onClick={() => setActiveTab('userflow')}
          >
            User Flow
          </button>
        </div>

        <div className="workflow-viewer-content">
          {activeTab === 'workflow' ? (
            <div className="workflow-canvas-container">
              <div className="workflow-toolbar">
                <div className="workflow-toolbox">
                  <div className="toolbox-label">Connection Tools:</div>
                  <div className="toolbox-buttons">
                    <button
                      className={`toolbox-btn ${isConnecting && selectedConnectionType === 'direct' ? 'active' : ''}`}
                      onClick={() => {
                        if (isConnecting && selectedConnectionType === 'direct') {
                          setIsConnecting(false)
                          setConnectingFrom(null)
                        } else {
                          setIsConnecting(true)
                          setSelectedConnectionType('direct')
                        }
                      }}
                      title="Direct Connection"
                    >
                      <FiMinus size={18} />
                      <span>Direct</span>
                    </button>
                    <button
                      className={`toolbox-btn ${isConnecting && selectedConnectionType === 'crossed' ? 'active' : ''}`}
                      onClick={() => {
                        if (isConnecting && selectedConnectionType === 'crossed') {
                          setIsConnecting(false)
                          setConnectingFrom(null)
                        } else {
                          setIsConnecting(true)
                          setSelectedConnectionType('crossed')
                        }
                      }}
                      title="Crossed Connection"
                    >
                      <FiZap size={18} />
                      <span>Crossed</span>
                    </button>
                    <button
                      className={`toolbox-btn ${isConnecting && selectedConnectionType === 'indirect' ? 'active' : ''}`}
                      onClick={() => {
                        if (isConnecting && selectedConnectionType === 'indirect') {
                          setIsConnecting(false)
                          setConnectingFrom(null)
                        } else {
                          setIsConnecting(true)
                          setSelectedConnectionType('indirect')
                        }
                      }}
                      title="Indirect Connection (Curved)"
                    >
                      <FiCornerDownRight size={18} />
                      <span>Indirect</span>
                    </button>
                    <button
                      className={`toolbox-btn ${isConnecting && selectedConnectionType === 'modal' ? 'active' : ''}`}
                      onClick={() => {
                        if (isConnecting && selectedConnectionType === 'modal') {
                          setIsConnecting(false)
                          setConnectingFrom(null)
                        } else {
                          setIsConnecting(true)
                          setSelectedConnectionType('modal')
                        }
                      }}
                      title="Modal Connection (Dashed)"
                    >
                      <FiMaximize2 size={18} />
                      <span>Modal</span>
                    </button>
                    <button
                      className={`toolbox-btn ${isConnecting && selectedConnectionType === 'arrow' ? 'active' : ''}`}
                      onClick={() => {
                        if (isConnecting && selectedConnectionType === 'arrow') {
                          setIsConnecting(false)
                          setConnectingFrom(null)
                        } else {
                          setIsConnecting(true)
                          setSelectedConnectionType('arrow')
                        }
                      }}
                      title="Arrow Connection"
                    >
                      <FiArrowRight size={18} />
                      <span>Arrow</span>
                    </button>
                  </div>
                </div>
                <button
                  className="workflow-tool-btn"
                  onClick={() => {
                    if (window.confirm('Clear all connections?')) {
                      setConnections([])
                    }
                  }}
                  title="Clear all connections"
                >
                  Clear All
                </button>
                <button
                  className="workflow-tool-btn workflow-save-btn"
                  onClick={() => {
                    if (onSave) {
                      onSave({
                        connections,
                        pagePositions
                      })
                      // Don't show alert here - let the parent component handle the success message
                    } else {
                      // Fallback: save to localStorage
                      const workflowData = {
                        connections,
                        pagePositions,
                        savedAt: new Date().toISOString()
                      }
                      localStorage.setItem(`workflow_${pages[0]?.id || 'default'}`, JSON.stringify(workflowData))
                      alert('Workflow saved to local storage!')
                    }
                  }}
                  title="Save workflow"
                >
                  <FiSave size={16} />
                  <span>Save Workflow</span>
                </button>
              </div>
              
              <div className="workflow-canvas" ref={canvasRef}>
                <svg className="workflow-connections-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {connections.map(conn => {
                    const fromPage = pages.find(p => p.id === conn.fromPageId)
                    const toPage = pages.find(p => p.id === conn.toPageId)
                    if (!fromPage || !toPage) return null
                    
                    const from = getConnectionPointPosition(conn.fromPageId, conn.fromPoint)
                    const to = getConnectionPointPosition(conn.toPageId, conn.toPoint)
                    
                    const connectionPath = calculateConnectionPath(from, to, conn.type)
                    const connectionStyle = getConnectionStyle(conn.type)
                    
                    return (
                      <g key={conn.id} style={{ pointerEvents: 'all' }}>
                        <path
                          d={connectionPath.path}
                          {...connectionStyle}
                          fill="none"
                          markerEnd={conn.type === 'arrow' ? "url(#arrowhead)" : undefined}
                        />
                        {connectionPath.arrowHead && (
                          <path
                            d={connectionPath.arrowHead}
                            {...connectionStyle}
                            fill="none"
                          />
                        )}
                        <circle
                          cx={(from.x + to.x) / 2}
                          cy={(from.y + to.y) / 2}
                          r="8"
                          fill="#ef4444"
                          style={{ cursor: 'pointer', pointerEvents: 'all' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteConnection(conn.id)
                          }}
                        />
                      </g>
                    )
                  })}
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="10"
                      markerHeight="10"
                      refX="9"
                      refY="3"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3, 0 6" fill="#8b5cf6" />
                    </marker>
                  </defs>
                </svg>
                
                {pages.length === 0 ? (
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#666', fontSize: '14px' }}>
                    No pages available
                  </div>
                ) : (
                  pages.map((page, index) => {
                    const pos = pagePositions[page.id] || { x: 0, y: 0 }
                    const isConnectingThis = isConnecting && connectingFrom?.pageId === page.id
                    const pageName = page.name && page.name.trim() ? page.name : `Page ${index + 1}`
                    
                    console.log(`Rendering page ${index + 1}:`, { id: page.id, name: pageName, pos, hasPosition: !!pagePositions[page.id] })
                    
                    return (
                      <div
                        key={page.id}
                        className={`workflow-component-node ${isConnectingThis ? 'connecting' : ''} ${draggingPage === page.id ? 'dragging' : ''}`}
                        style={{
                          position: 'absolute',
                          left: `${pos.x}px`,
                          top: `${pos.y}px`,
                          cursor: draggingPage === page.id ? 'grabbing' : 'grab',
                          width: '200px',
                          minHeight: '80px',
                          zIndex: draggingPage === page.id ? 1000 : 1
                        }}
                        onMouseDown={(e) => handlePageMouseDown(e, page.id)}
                      >
                      {/* Connection Points */}
                      <div 
                        className={`connection-point connection-point-top ${isConnecting && connectingFrom?.pageId === page.id && connectingFrom?.point === 'top' ? 'active' : ''} ${isConnecting ? 'visible' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleConnectionPointClick(page.id, 'top', e)
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                        }}
                        title="Top connection point - Click to connect"
                      />
                      <div 
                        className={`connection-point connection-point-bottom ${isConnecting && connectingFrom?.pageId === page.id && connectingFrom?.point === 'bottom' ? 'active' : ''} ${isConnecting ? 'visible' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleConnectionPointClick(page.id, 'bottom', e)
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                        }}
                        title="Bottom connection point - Click to connect"
                      />
                      <div 
                        className={`connection-point connection-point-left ${isConnecting && connectingFrom?.pageId === page.id && connectingFrom?.point === 'left' ? 'active' : ''} ${isConnecting ? 'visible' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleConnectionPointClick(page.id, 'left', e)
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                        }}
                        title="Left connection point - Click to connect"
                      />
                      <div 
                        className={`connection-point connection-point-right ${isConnecting && connectingFrom?.pageId === page.id && connectingFrom?.point === 'right' ? 'active' : ''} ${isConnecting ? 'visible' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleConnectionPointClick(page.id, 'right', e)
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                        }}
                        title="Right connection point - Click to connect"
                      />
                      
                      <div className="workflow-component-node-header">
                        <FiEye size={16} />
                        <span>{pageName}</span>
                      </div>
                      <div className="workflow-component-node-body">
                        <div className="workflow-component-id">{page.route || '/'}</div>
                        <div className="workflow-component-content" style={{ fontSize: '0.75rem', color: '#999', marginTop: '4px' }}>
                          {components.filter(c => c.props?.pageId === page.id || (!c.props?.pageId && page.id === pages[0]?.id)).length} component(s)
                        </div>
                      </div>
                    </div>
                    )
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="user-flow-content">
              <div className="user-flow-info">
                <h3>User Flow</h3>
                <p>Visualize how users navigate through your application.</p>
                <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '1rem' }}>
                  This view will show the user journey through your pages based on the connections you create in the Workflow tab.
                </p>
              </div>
              
              <div className="user-flow-diagram">
                {pages.length === 0 ? (
                  <div className="empty-flow">
                    <p>No pages available</p>
                  </div>
                ) : (
                  <div className="flow-steps">
                    {pages.map((page, index) => {
                      // Ensure page name is displayed correctly - use name if available, otherwise generate one
                      const pageName = page.name && page.name.trim() ? page.name : `Page ${index + 1}`
                      const pageRoute = page.route && page.route.trim() ? page.route : '/'
                      
                      return (
                        <div key={page.id} className="flow-step">
                          <div className="flow-step-number">{index + 1}</div>
                          <div className="flow-step-content">
                            <h4>{pageName}</h4>
                            <p>{pageRoute}</p>
                          </div>
                          {index < pages.length - 1 && (
                            <div className="flow-step-arrow">
                              <FiArrowRight size={24} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default WorkflowViewerModal

