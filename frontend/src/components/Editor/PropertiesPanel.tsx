import { useState, useEffect, useMemo, useRef } from 'react'
import { useDrag, useDrop } from 'react-dnd'
import { ComponentNode, Page } from '../../types/editor'
import { FiTrash2, FiChevronRight, FiChevronDown, FiCopy } from 'react-icons/fi'
import { useConfirmation } from '../ConfirmationModal'
import { aiAssistantAPI, ActionResponse, FormAPIRequest } from '../../api/aiAssistant'
import { aiDevelopmentAPI } from '../../api/aiDevelopment'
import { useToast } from '../Toast'
import './PropertiesPanel.css'

interface PropertiesPanelProps {
  selectedComponent: ComponentNode | null
  allComponents: ComponentNode[]
  onUpdate: (id: string, updates: Partial<ComponentNode>) => void
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
  onAddComponent?: (component: ComponentNode, parentId?: string) => void
  onReorder?: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void
  pages?: Page[]
  currentPageId?: string | null
  projectId?: number
}

// Parse value and unit from a string like "100px" or "50%"
const parseValue = (value: string | number | undefined): { value: number; unit: string } => {
  if (!value && value !== 0) {
    return { value: 0, unit: 'px' }
  }
  
  // Handle string values
  if (typeof value === 'string') {
    // Trim whitespace
    const trimmed = value.trim()
    
    // Handle percentage values explicitly first
    if (trimmed.endsWith('%')) {
      const numValue = parseFloat(trimmed.replace('%', '')) || 0
      return { value: numValue, unit: '%' }
    }
    
    // Match numeric value with optional unit (including %)
    const match = trimmed.match(/^(-?\d*\.?\d+)(px|em|%|dvh|dvw|rem|vh|vw)?$/)
    if (match) {
      const parsedValue = parseFloat(match[1]) || 0
      const parsedUnit = match[2] || 'px'
      return {
        value: parsedValue,
        unit: parsedUnit
      }
    }
  }
  
  // Handle numeric values (fallback)
  if (typeof value === 'number') {
    return { value: value, unit: 'px' }
  }
  
  return { value: 0, unit: 'px' }
}

// Parse shadow value: "offsetX offsetY blur spread color" or "offsetX offsetY blur color"
const parseShadow = (value: string | undefined, hasSpread: boolean = true): { offsetX: number; offsetY: number; blur: number; spread: number; color: string; colorForPicker: string } => {
  if (!value || typeof value !== 'string') {
    return { offsetX: 0, offsetY: 0, blur: 0, spread: 0, color: '#000000', colorForPicker: '#000000' }
  }
  
  // Remove 'none' or 'transparent'
  if (value.trim() === 'none' || value.trim() === 'transparent') {
    return { offsetX: 0, offsetY: 0, blur: 0, spread: 0, color: '#000000', colorForPicker: '#000000' }
  }
  
  // Match shadow values: offsetX offsetY blur [spread] color
  // Color can be at the end (hex, rgb, rgba, or color name)
  const parts = value.trim().split(/\s+/)
  const colorMatch = value.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|\b[a-z]+\b)(?:\s*$)/i)
  let color = '#000000'
  let numericParts: string[] = []
  
  if (colorMatch) {
    color = colorMatch[1]
    // Remove color from parts
    numericParts = parts.filter(p => !p.includes(color))
  } else {
    // Try to find color at the end
    const lastPart = parts[parts.length - 1]
    if (lastPart && (lastPart.startsWith('#') || lastPart.startsWith('rgb') || /^[a-z]+$/i.test(lastPart))) {
      color = lastPart
      numericParts = parts.slice(0, -1)
    } else {
      numericParts = parts
    }
  }
  
  // Parse numeric values
  const offsetX = numericParts[0] ? parseFloat(numericParts[0]) || 0 : 0
  const offsetY = numericParts[1] ? parseFloat(numericParts[1]) || 0 : 0
  const blur = numericParts[2] ? parseFloat(numericParts[2]) || 0 : 0
  const spread = hasSpread && numericParts[3] ? parseFloat(numericParts[3]) || 0 : 0
  
  // Convert color to hex if needed (for color picker compatibility)
  // But preserve rgb/rgba in the formatted output
  let colorForPicker = color || '#000000'
  if (color && !color.startsWith('#')) {
    if (color.startsWith('rgb')) {
      // For rgb/rgba, try to convert to hex for the color picker
      // But we'll keep the original in the output
      const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/i)
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1])
        const g = parseInt(rgbMatch[2])
        const b = parseInt(rgbMatch[3])
        colorForPicker = `#${[r, g, b].map(x => {
          const hex = x.toString(16)
          return hex.length === 1 ? '0' + hex : hex
        }).join('')}`
      }
    } else {
      // Try common color names
      const colorMap: { [key: string]: string } = {
        'black': '#000000', 'white': '#ffffff', 'red': '#ff0000',
        'green': '#008000', 'blue': '#0000ff', 'transparent': '#000000'
      }
      colorForPicker = colorMap[color.toLowerCase()] || color
    }
  }
  
  return { offsetX, offsetY, blur, spread, color: color || '#000000', colorForPicker }
}

// Format shadow value back to CSS string
const formatShadow = (offsetX: number, offsetY: number, blur: number, spread: number, color: string, hasSpread: boolean = true): string => {
  if (offsetX === 0 && offsetY === 0 && blur === 0 && spread === 0 && (!color || color === '#000000' || color === 'transparent')) {
    return 'none'
  }
  
  const parts = [
    `${offsetX}px`,
    `${offsetY}px`,
    `${blur}px`
  ]
  
  if (hasSpread) {
    parts.push(`${spread}px`)
  }
  
  parts.push(color || '#000000')
  
  return parts.join(' ')
}

// Format value with unit
const formatValue = (value: number, unit: string): string => {
  // Always include unit for percentage
  if (unit === '%') {
    return `${value}%`
  }
  // For px, return '0' without unit when value is 0
  if (value === 0 && unit === 'px') {
    return '0'
  }
  // For all other units, always include the unit
  return `${value}${unit}`
}

const ComponentTree = ({ 
  components, 
  selectedId, 
  onSelect,
  onDelete,
  onUpdate,
  onReorder
}: { 
  components: ComponentNode[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<ComponentNode>) => void
  onReorder?: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void
}) => {
  // Helper to reorder components
  const reorderComponent = (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => {
    if (onReorder) {
      onReorder(draggedId, targetId, position)
      return
    }
    
    // Fallback: if no onReorder callback, just reparent
    const dragged = components.find(c => c.id === draggedId)
    const target = components.find(c => c.id === targetId)
    
    if (!dragged || !target) return
    
    // If dropping inside, just reparent
    if (position === 'inside') {
      onUpdate(draggedId, { parentId: targetId })
      return
    }
    
    // For reordering without onReorder, we'll just reparent to the same parent
    // The actual reordering will be handled by the Editor component
    const targetParentId = target.parentId
    if (dragged.parentId !== targetParentId) {
      onUpdate(draggedId, { parentId: targetParentId })
    }
  }
  const { confirm } = useConfirmation()
  const selectedNodeRef = useRef<HTMLDivElement | null>(null)
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  // Auto-expand path to selected component and scroll into view
  useEffect(() => {
    if (selectedId) {
      // Find all parent components and expand them
      const parentIds: string[] = []
      let currentId: string | undefined = selectedId
      
      // Collect all parent IDs
      while (currentId) {
        const component = components.find(c => c.id === currentId)
        if (component && component.parentId) {
          parentIds.push(component.parentId)
          currentId = component.parentId
        } else {
          break
        }
      }
      
      // Expand all parents
      if (parentIds.length > 0) {
        setExpandedNodes(prev => {
          const newSet = new Set(prev)
          parentIds.forEach(id => newSet.add(id))
          return newSet
        })
      }
      
      // Scroll selected node into view
      setTimeout(() => {
        if (selectedNodeRef.current && treeContainerRef.current) {
      const node = selectedNodeRef.current
      const container = treeContainerRef.current
      
      // Calculate scroll position to center the selected node
      const nodeTop = node.offsetTop
      const nodeHeight = node.offsetHeight
      const containerHeight = container.clientHeight
      const scrollTop = container.scrollTop
      
      // Check if node is visible
      const nodeBottom = nodeTop + nodeHeight
      const visibleTop = scrollTop
      const visibleBottom = scrollTop + containerHeight
      
      if (nodeTop < visibleTop || nodeBottom > visibleBottom) {
        // Scroll to center the node
        const targetScroll = nodeTop - (containerHeight / 2) + (nodeHeight / 2)
        container.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth'
        })
      }
    }
      }, 100) // Small delay to allow DOM to update after expansion
    }
  }, [selectedId, components])

  const handleDelete = (e: React.MouseEvent, componentId: string) => {
    e.stopPropagation()
    confirm({
      title: 'Delete Component',
      message: 'Delete this component and all its children? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmButtonStyle: 'danger',
      onConfirm: () => {
        onDelete(componentId)
      },
    })
  }

  // Toggle expand/collapse for a node
  const toggleExpand = (componentId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(componentId)) {
        newSet.delete(componentId)
      } else {
        newSet.add(componentId)
      }
      return newSet
    })
  }

  // Tree node component with drag and drop
  const TreeNode = ({ component, level, index, siblingsCount }: { component: ComponentNode; level: number; parentId?: string | undefined; index?: number; siblingsCount?: number }) => {
    const hasChildren = components.some(c => c.parentId === component.id)
    const isSelected = selectedId === component.id
    const isExpanded = expandedNodes.has(component.id)
    
    // Make this node draggable
    const [{ isDragging }, drag] = useDrag({
      type: 'tree-component',
      item: () => ({
        componentId: component.id,
        componentType: component.type,
      }),
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    })

    // Drop zone before this component (for reordering)
    const [{ isOverBefore }, dropBefore] = useDrop({
      accept: 'tree-component',
      drop: (item: { componentId: string; componentType: string }) => {
        if (item.componentId !== component.id) {
          reorderComponent(item.componentId, component.id, 'before')
        }
      },
      collect: (monitor) => ({
        isOverBefore: monitor.isOver() && monitor.canDrop(),
      }),
    })

    // Drop zone on this component (for reparenting)
    const [{ isOver }, drop] = useDrop({
      accept: 'tree-component',
      drop: (item: { componentId: string; componentType: string }, monitor) => {
        // Don't allow dropping on itself
        if (item.componentId === component.id) {
          return
        }
        
        // Don't allow dropping a component into its own descendant
        const isDescendant = (parentId: string, childId: string): boolean => {
          const child = components.find(c => c.id === childId)
          if (!child || !child.parentId) return false
          if (child.parentId === parentId) return true
          return isDescendant(parentId, child.parentId)
        }
        
        if (isDescendant(item.componentId, component.id)) {
          return // Prevent circular parent-child relationships
        }
        
        // Update the dragged component's parentId to this component
        onUpdate(item.componentId, {
          parentId: component.id,
        })
      },
      collect: (monitor) => ({
        isOver: monitor.isOver() && monitor.canDrop(),
      }),
    })

    // Drop zone after this component (for reordering)
    const [{ isOverAfter }, dropAfter] = useDrop({
      accept: 'tree-component',
      drop: (item: { componentId: string; componentType: string }) => {
        if (item.componentId !== component.id) {
          reorderComponent(item.componentId, component.id, 'after')
        }
      },
      collect: (monitor) => ({
        isOverAfter: monitor.isOver() && monitor.canDrop(),
      }),
    })

    // Combine drag and drop refs
    const dragDropRef = (node: HTMLDivElement | null) => {
      drag(node)
      drop(node)
    }
    
    const dropBeforeRef = (node: HTMLDivElement | null) => {
      dropBefore(node)
    }
    
    const dropAfterRef = (node: HTMLDivElement | null) => {
      dropAfter(node)
    }

    return (
      <li key={component.id} className="tree-item">
        {/* Drop zone before this component */}
        {index !== undefined && index > 0 && (
          <div
            ref={dropBeforeRef}
            className={`tree-drop-zone ${isOverBefore ? 'drag-over' : ''}`}
            style={{ height: '4px', margin: '2px 0' }}
          />
        )}
        
        <div
          ref={isSelected ? selectedNodeRef : null}
          className={`tree-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isOver ? 'drag-over' : ''}`}
          onClick={() => onSelect(component.id)}
          style={{ paddingLeft: `${level * 0.5}rem` }}
        >
          <div ref={dragDropRef} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, cursor: 'move', minWidth: 0, overflow: 'hidden' }}>
            {hasChildren ? (
              <button
                className="tree-expand-btn"
                onClick={(e) => toggleExpand(component.id, e)}
                title={isExpanded ? 'Collapse' : 'Expand'}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer', 
                  padding: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#666',
                  flexShrink: 0
                }}
              >
                {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
              </button>
            ) : (
              <span style={{ width: '1.5rem', display: 'inline-block', flexShrink: 0 }}></span>
            )}
            <span className="tree-icon" style={{ flexShrink: 0 }}>{hasChildren ? '📁' : '📄'}</span>
            <span className="tree-label">
              <strong title={component.type}>
                {component.type.length > 15 ? `${component.type.substring(0, 15)}...` : component.type}
              </strong> <span className="tree-id" title={component.id}>
                ({component.id.length > 12 ? `${component.id.substring(0, 12)}...` : component.id})
              </span>
            </span>
          </div>
          <button
            className="tree-delete-btn"
            onClick={(e) => handleDelete(e, component.id)}
            title="Delete component"
          >
            <FiTrash2 />
          </button>
        </div>
        
        {/* Drop zone after this component */}
        {index !== undefined && index < (siblingsCount || 0) - 1 && (
          <div
            ref={dropAfterRef}
            className={`tree-drop-zone ${isOverAfter ? 'drag-over' : ''}`}
            style={{ height: '4px', margin: '2px 0' }}
          />
        )}
        
        {hasChildren && isExpanded && renderTree(component.id, level + 1)}
      </li>
    )
  }

  const renderTree = (parentId: string | undefined = undefined, level: number = 0) => {
    const children = components.filter(c => c.parentId === parentId)
    
    if (children.length === 0 && level === 0) {
      return (
        <div className="tree-empty">
          <p>No components yet</p>
          <span>Drag components to the canvas to start building</span>
        </div>
      )
    }

    return (
      <ul className="tree-list" style={{ paddingLeft: level > 0 ? '1rem' : '0' }}>
        {children.map((component, index) => (
          <TreeNode 
            key={component.id}
            component={component}
            level={level}
            parentId={parentId}
            index={index}
            siblingsCount={children.length}
          />
        ))}
      </ul>
    )
  }

  return (
    <div className="component-tree">
      <h4>Component Hierarchy</h4>
      <div className="tree-container" ref={treeContainerRef}>
        {renderTree()}
      </div>
    </div>
  )
}

const PropertiesPanel = ({ selectedComponent, allComponents, onUpdate, onSelect, onDelete, onAddComponent, onReorder, pages = [], currentPageId, projectId }: PropertiesPanelProps) => {
  const { confirm } = useConfirmation()
  const [localProps, setLocalProps] = useState<any>({})
  const [activeTab, setActiveTab] = useState<'tree' | 'properties' | 'style' | 'css' | 'ai'>('style')
  const [actionMessage, setActionMessage] = useState<string>('')
  const [actionProcessing, setActionProcessing] = useState<boolean>(false)
  const [actionResponse, setActionResponse] = useState<ActionResponse | null>(null)
  const [formAPIProcessing, setFormAPIProcessing] = useState<boolean>(false)
  const [numericValues, setNumericValues] = useState<{ [key: string]: { value: number; unit: string } }>({})
  const [styleSearchQuery, setStyleSearchQuery] = useState('')
  const [expandedShorthand, setExpandedShorthand] = useState<{ [key: string]: boolean }>({})
  const [selectedAction, setSelectedAction] = useState<string>('')
  const [aiPrompt, setAiPrompt] = useState<string>('')
  const [aiProcessing, setAiProcessing] = useState<boolean>(false)
  const [aiMessages, setAiMessages] = useState<Array<{ type: 'user' | 'assistant'; content: string; timestamp: Date; applied?: boolean }>>([])
  const [backgroundType, setBackgroundType] = useState<'solid' | 'gradient'>('solid')
  const [gradientDirection, setGradientDirection] = useState('180deg')
  const [gradientColors, setGradientColors] = useState<Array<{color: string, stop: string}>>([
    { color: '#ffffff', stop: '0%' },
    { color: '#000000', stop: '100%' }
  ])
  const { showToast } = useToast()
  
  // Track last synced component to prevent resetting during edits
  const lastSyncedComponentIdRef = useRef<string | null>(null)
  // Track if we're actively editing a gradient to prevent useEffect from resetting
  const isEditingGradientRef = useRef<boolean>(false)
  
  // Auto-scroll to bottom when new messages arrive (must be before any conditional returns)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Track recent prompts to avoid repeated confirmations (must be before early returns)
  const recentPromptsRef = useRef<Array<{ prompt: string; timestamp: number }>>([])
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages])

  // Listen for AI Assistant open event from navbar
  useEffect(() => {
    const handleOpenAIAssistant = () => {
      setActiveTab('ai')
    }

    window.addEventListener('openAIAssistant', handleOpenAIAssistant as EventListener)
    return () => {
      window.removeEventListener('openAIAssistant', handleOpenAIAssistant as EventListener)
    }
  }, [])
  
  // Common CSS properties to display by default
  const commonCSSProperties = [
    'width', 'height', 'padding', 'margin', 'display', 'position',
    'top', 'left', 'right', 'bottom', 'zIndex', 'backgroundColor',
    'color', 'fontSize', 'fontWeight', 'textAlign', 'borderRadius',
    'border', 'borderWidth', 'borderColor', 'opacity', 'cursor',
    'overflow', 'flexDirection', 'justifyContent', 'alignItems', 'gap'
  ]
  
  // Comprehensive list of CSS properties
  const allCSSProperties = [
    // Layout
    'display', 'position', 'top', 'left', 'right', 'bottom', 'zIndex',
    'float', 'clear', 'overflow', 'overflowX', 'overflowY', 'clip',
    'clipPath',
    'contain',
    
    // Box Model
    'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'paddingBlockEnd',
    'paddingBlockStart',
    'paddingBlock',
    'paddingInlineEnd',
    'paddingInlineStart',
    'paddingInline',
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'marginBlockEnd',
    'marginBlockStart',
    'marginBlock',
    'marginInlineEnd',
    'marginInlineStart',
    'marginInline',
    'boxSizing', 'aspectRatio', 'border', 'borderWidth', 'borderStyle', 'borderColor',
    'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
    'borderBottomLeftRadius', 'borderBottomRightRadius',
    
    // Flexbox
    'flex', 'flexDirection', 'flexWrap', 'flexFlow', 'justifyContent',
    'alignItems', 'alignContent', 'alignSelf', 'order', 'flexGrow',
    'flexShrink', 'flexBasis', 'gap', 'rowGap', 'columnGap',
    
    // Grid
    'grid',
    'gridTemplate', 'gridTemplateColumns', 'gridTemplateRows', 'gridTemplateAreas',
    'gridColumn',
    'gridColumnStart',
    'gridColumnEnd', 'gridRow',
    'gridRowStart',
    'gridRowEnd', 'gridArea', 'gridAutoColumns', 'gridAutoRows',
    'gridAutoFlow',
    'justifyItems',
    'justifySelf',
    'placeItems',
    'placeSelf',
    'placeContent', 'gridGap', 'gridColumnGap', 'gridRowGap',
    
    // Typography
    'font', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'fontVariantCaps',
    'fontVariantNumeric',
    'fontVariantLigatures',
    'fontStretch',
    'fontKerning',
    'fontFeatureSettings',
    'fontVariationSettings',
    'fontSizeAdjust',
    'fontSynthesis',
    'textRendering',
    'unicodeBidi',
    'lineHeight', 'letterSpacing', 'wordSpacing', 'textAlign',
    'textAlignLast', 'textDecoration', 'textDecorationLine', 'textDecorationStyle', 'textDecorationColor',
    'textUnderlineOffset',
    'textDecorationThickness',
    'textTransform', 'textIndent', 'textShadow', 'whiteSpace', 'wordWrap',
    'wordBreak',
    'hyphens',
    'overflowWrap', 'textOverflow', 'verticalAlign',
    'writingMode',
    'direction',
    'textOrientation',
    
    // Colors & Background
    'color', 'backgroundColor', 'background', 'backgroundImage',
    'backgroundPosition', 'backgroundSize', 'backgroundRepeat',
    'backgroundAttachment', 'backgroundClip',
    'backgroundOrigin',
    'backgroundBlendMode', 'opacity',
    
    // Border & Outline
    'outline', 'outlineWidth', 'outlineStyle', 'outlineColor',
    'outlineOffset',
    'outlineInset', 'boxShadow',
    'scrollBehavior',
    'scrollMargin',
    'scrollPadding',
    'overscrollBehaviorY',
    'overscrollBehaviorX',
    'overscrollBehavior',
    'scrollSnapStop',
    'scrollSnapAlign',
    'scrollSnapType',
    'scrollPaddingLeft',
    'scrollPaddingBottom',
    'scrollPaddingRight',
    'scrollPaddingTop',
    'scrollMarginLeft',
    'scrollMarginBottom',
    'scrollMarginRight',
    'scrollMarginTop',
    
    // Effects
    'opacity', 'visibility', 'cursor', 'pointerEvents', 'userSelect',
    'willChange',
    'touchAction',
    'transform', 'transformOrigin',
    'perspective',
    'perspectiveOrigin',
    'backfaceVisibility',
    'transformStyle', 'transition', 'transitionProperty',
    'transitionDuration', 'transitionTimingFunction', 'transitionDelay',
    'animation', 'animationName', 'animationDuration', 'animationTimingFunction',
    'animationDelay', 'animationIterationCount', 'animationDirection',
    'animationFillMode', 'animationPlayState',
    
    // Filter & Effects
    'filter', 'backdropFilter', 'mixBlendMode', 'isolation',
    'colorInterpolationFilters',
    'blendMode',
    
    // Other
    'listStyle', 'listStyleType', 'listStylePosition', 'listStyleImage',
    'tableLayout', 'borderCollapse', 'borderSpacing',
    'borderImage',
    'borderImageSource',
    'borderImageSlice',
    'borderImageWidth',
    'borderImageOutset',
    'borderImageRepeat', 'captionSide',
    'emptyCells', 'quotes', 'content', 'counterReset', 'counterIncrement',
    'counterSet',
    'resize', 'appearance', 'objectFit', 'objectPosition'
  ]
  
  // Get related properties for shorthand properties
  const getRelatedProperties = (prop: string): string[] => {
    const relatedProps: { [key: string]: string[] } = {
      'border': ['borderWidth', 'borderStyle', 'borderColor'],
      'borderTop': ['borderTopWidth', 'borderTopStyle', 'borderTopColor'],
      'borderRight': ['borderRightWidth', 'borderRightStyle', 'borderRightColor'],
      'borderBottom': ['borderBottomWidth', 'borderBottomStyle', 'borderBottomColor'],
      'borderLeft': ['borderLeftWidth', 'borderLeftStyle', 'borderLeftColor'],
      'padding': ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
      'margin': ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
      'background': ['backgroundColor', 'backgroundImage', 'backgroundPosition', 'backgroundSize', 'backgroundRepeat', 'backgroundAttachment'],
      'outline': ['outlineWidth', 'outlineStyle', 'outlineColor'],
      'font': ['fontStyle', 'fontVariant', 'fontWeight', 'fontSize', 'lineHeight', 'fontFamily'],
      'flex': ['flexGrow', 'flexShrink', 'flexBasis'],
      'grid': ['gridTemplateColumns', 'gridTemplateRows', 'gridTemplateAreas', 'gridAutoColumns', 'gridAutoRows', 'gridAutoFlow'],
      'transition': ['transitionProperty', 'transitionDuration', 'transitionTimingFunction', 'transitionDelay'],
      'animation': ['animationName', 'animationDuration', 'animationTimingFunction', 'animationDelay', 'animationIterationCount', 'animationDirection', 'animationFillMode', 'animationPlayState'],
      'textDecoration': ['textDecorationLine', 'textDecorationStyle', 'textDecorationColor'],
      'borderRadius': ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'],
      'boxShadow': ['boxShadow'], // Can have multiple values, but we'll show it as one
      'textShadow': ['textShadow'] // Can have multiple values, but we'll show it as one
    }
    return relatedProps[prop] || []
  }
  
  // Check if a property is a shorthand property
  const isShorthandProperty = (prop: string): boolean => {
    const shorthandProps = [
      'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
      'padding', 'margin', 'background', 'outline', 'font', 'flex', 'grid',
      'transition', 'animation', 'textDecoration', 'borderRadius', 'boxShadow', 'textShadow'
    ]
    return shorthandProps.includes(prop)
  }
  
  // Get only properties that have been set (have values)
  const getSetProperties = () => {
    const style = localProps.style || {}
    return Object.keys(style).filter(key => {
      const value = style[key]
      return value !== null && value !== undefined && value !== ''
    })
  }
  
  // Utility function to sort search results: items starting with query come first
  // This can be reused for any search/filter operation
  const sortByStartsWith = <T,>(items: T[], query: string, getValue: (item: T) => string): T[] => {
    const queryLower = query.toLowerCase().trim()
    return [...items].sort((a, b) => {
      const aValue = getValue(a).toLowerCase()
      const bValue = getValue(b).toLowerCase()
      const aStartsWith = aValue.startsWith(queryLower)
      const bStartsWith = bValue.startsWith(queryLower)
      
      // Items starting with query come first
      if (aStartsWith && !bStartsWith) return -1
      if (!aStartsWith && bStartsWith) return 1
      
      // Then alphabetical within the same group
      return aValue.localeCompare(bValue)
    })
  }
  
  // Filter properties based on search query
  const getFilteredProperties = () => {
    const setProps = getSetProperties()
    
    if (!styleSearchQuery.trim()) {
      // Show all CSS properties when no search (onload) - in alphabetical order
      // Exclude "opacity" from the default list
      return [...allCSSProperties]
        .filter(prop => prop.toLowerCase() !== 'opacity')
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    }
    
    // When searching, show matching properties from all CSS properties
    const query = styleSearchQuery.toLowerCase().trim()
    const matchingProps = allCSSProperties.filter(prop => 
      prop.toLowerCase().includes(query)
    )
    
    // Sort matching properties: those starting with query come first, then alphabetical
    matchingProps.sort((a, b) => {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()
      const aStartsWith = aLower.startsWith(query)
      const bStartsWith = bLower.startsWith(query)
      
      // Properties starting with query come first
      if (aStartsWith && !bStartsWith) return -1
      if (!aStartsWith && bStartsWith) return 1
      
      // Within the same group (both start or both don't), sort alphabetically
      return aLower.localeCompare(bLower)
    })
    
    // Find shorthand properties that match the search
    const matchingShorthands = matchingProps.filter(prop => isShorthandProperty(prop))
    
    // Collect all related properties for matching shorthands
    const relatedPropsSet = new Set<string>()
    matchingShorthands.forEach(shorthand => {
      const related = getRelatedProperties(shorthand)
      related.forEach(relProp => relatedPropsSet.add(relProp))
    })
    
    // Handle special search patterns
    // Check if query contains "border" - include ALL border-related properties separately
    if (query.includes('border')) {
      // Find all border-related properties
      const borderProps = allCSSProperties.filter(prop => {
        const propLower = prop.toLowerCase()
        return propLower.includes('border')
      })
      
      // Add all border properties to the set
      borderProps.forEach(prop => {
        relatedPropsSet.add(prop)
        // If it's a shorthand, also add its related properties as separate items
        if (isShorthandProperty(prop)) {
          const related = getRelatedProperties(prop)
          related.forEach(relProp => relatedPropsSet.add(relProp))
        }
      })
      
      // Also explicitly add all border-related properties that might not be in allCSSProperties
      // but are related to border shorthands
      const allBorderShorthands = ['border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft']
      allBorderShorthands.forEach(shorthand => {
        if (isShorthandProperty(shorthand)) {
          const related = getRelatedProperties(shorthand)
          related.forEach(relProp => relatedPropsSet.add(relProp))
        }
      })
    }
    
    // Check for "radius" or "border radius" - include all radius-related properties
    if (query.includes('radius')) {
      const radiusProps = allCSSProperties.filter(prop => {
        const propLower = prop.toLowerCase()
        return propLower.includes('radius')
      })
      
      radiusProps.forEach(prop => {
        if (isShorthandProperty(prop)) {
          const related = getRelatedProperties(prop)
          related.forEach(relProp => relatedPropsSet.add(relProp))
        }
        relatedPropsSet.add(prop)
      })
    }
    
    // Filter setProps to only include those that match the query directly
    // Don't include set properties that don't match the query, even if they're related
    // Also exclude "opacity" to prevent duplicates
    const matchingSetProps = setProps.filter(prop => {
      const propLower = prop.toLowerCase()
      
      // Exclude "opacity" from set properties to prevent duplicates
      if (propLower === 'opacity') {
        return false
      }
      
      // ONLY include if it matches the query directly
      // This prevents properties like "opacity" from appearing when searching for something else
      return propLower.includes(query)
    })
    
    // Filter relatedPropsSet to only include properties that actually match the query or are for border/radius searches
    // Exclude "opacity" to prevent duplicates
    const filteredRelatedProps = Array.from(relatedPropsSet).filter(prop => {
      const propLower = prop.toLowerCase()
      
      // Exclude "opacity" from related props to prevent duplicates
      if (propLower === 'opacity') {
        return false
      }
      
      // Only include if it matches the query, or if it's for border/radius searches
      if (query.includes('border') && propLower.includes('border')) return true
      if (query.includes('radius') && propLower.includes('radius')) return true
      if (propLower.includes(query)) return true
      return false
    })
    
    // Combine: first matching properties (already sorted by "starts with"), then matching set props, then filtered related props
    // This ensures properties starting with query appear first regardless of whether they're set or not
    // Use a Set immediately to prevent any duplicates from being added
    const combinedSet = new Set<string>()
    matchingProps.forEach(prop => combinedSet.add(prop))
    matchingSetProps.forEach(prop => combinedSet.add(prop))
    filteredRelatedProps.forEach(prop => combinedSet.add(prop))
    const combined = Array.from(combinedSet)
    
    // Filter to show ONLY properties that match the query
    // This ensures properties like "opacity" don't appear unless they match the search
    let filtered = combined.filter(prop => {
      const propLower = prop.toLowerCase()
      
      // For border searches, show ONLY border-related properties
      if (query.includes('border')) {
        return propLower.includes('border')
        }
      
      // For radius searches, show ONLY radius-related properties
      if (query.includes('radius')) {
        return propLower.includes('radius')
      }
      
      // For all other searches, show ONLY properties that match the query directly
      // This is the primary and most important filter
      if (propLower.includes(query)) {
        return true
      }
      
      // Don't show properties that don't match the query
      return false
    })
    
    // Remove duplicates but keep all properties as separate items
    // Use a Set to ensure no duplicates, then convert back to array
    const uniqueFiltered = Array.from(new Set(filtered))
    
    // Sort: 1) Properties starting with query come first, 2) Then all in ascending alphabetical order
    // This applies to ALL filtered results (matching props, set props, related props, etc.)
    const sorted = uniqueFiltered.sort((a, b) => {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()
      const aStartsWith = aLower.startsWith(query)
      const bStartsWith = bLower.startsWith(query)
      
      // FIRST PRIORITY: Properties starting with query come first
      if (aStartsWith && !bStartsWith) return -1
      if (!aStartsWith && bStartsWith) return 1
      
      // SECOND PRIORITY: Alphabetical order (ascending) within the same group
      return aLower.localeCompare(bLower)
    })
    
    return sorted
  }
  
  const setProperties = useMemo(() => getSetProperties(), [localProps.style])
  const filteredProperties = useMemo(() => getFilteredProperties(), [styleSearchQuery, setProperties, allCSSProperties])
  const showSearchResults = styleSearchQuery.trim().length > 0

  // Determine if a CSS property accepts color values
  const isColorProperty = (prop: string): boolean => {
    const colorProps = [
      'color',
      'backgroundColor',
      'background',
      'borderColor',
      'borderTopColor',
      'borderRightColor',
      'borderBottomColor',
      'borderLeftColor',
      'outlineColor',
      'textDecorationColor',
      'columnRuleColor',
      'caretColor',
      'fill',
      'stroke'
    ]
    return colorProps.includes(prop) || prop.toLowerCase().includes('color')
  }
  
  // Get predefined values for properties that have standard CSS values
  const getPropertyOptions = (prop: string): string[] | null => {
    const propertyOptions: { [key: string]: string[] } = {
      // Position
      position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
      
      // Display
      display: ['block', 'inline', 'inline-block', 'flex', 'grid', 'none', 'table', 'table-cell', 'table-row', 'inline-flex', 'inline-grid'],
      
      // Border Style
      borderStyle: ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
      borderTopStyle: ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
      borderRightStyle: ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
      borderBottomStyle: ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
      borderLeftStyle: ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
      
      // Outline Style
      outlineStyle: ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
      
      // Text Decoration
      textDecorationStyle: ['solid', 'double', 'dotted', 'dashed', 'wavy'],
      textDecorationLine: ['none', 'underline', 'overline', 'line-through', 'underline overline', 'underline line-through'],
      
      // Text Align
      textAlign: ['left', 'right', 'center', 'justify', 'start', 'end'],
      
      // Font Weight
      fontWeight: ['normal', 'bold', 'lighter', 'bolder', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
      
      // Font Style
      fontStyle: ['normal', 'italic', 'oblique'],
      
      // Font Variant
      fontVariant: ['normal', 'small-caps'],
      
      // Text Transform
      textTransform: ['none', 'uppercase', 'lowercase', 'capitalize', 'full-width'],
      
      // White Space
      whiteSpace: ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'],
      
      // Word Break
      wordBreak: ['normal', 'break-all', 'keep-all', 'break-word'],
      
      // Overflow
      overflow: ['visible', 'hidden', 'scroll', 'auto', 'clip'],
      overflowX: ['visible', 'hidden', 'scroll', 'auto', 'clip'],
      overflowY: ['visible', 'hidden', 'scroll', 'auto', 'clip'],
      
      // Visibility
      visibility: ['visible', 'hidden', 'collapse'],
      
      // Cursor
      cursor: ['auto', 'default', 'none', 'context-menu', 'help', 'pointer', 'progress', 'wait', 'cell', 'crosshair', 'text', 'vertical-text', 'alias', 'copy', 'move', 'no-drop', 'not-allowed', 'grab', 'grabbing', 'all-scroll', 'col-resize', 'row-resize', 'n-resize', 'e-resize', 's-resize', 'w-resize', 'ne-resize', 'nw-resize', 'se-resize', 'sw-resize', 'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize', 'zoom-in', 'zoom-out'],
      
      // Flex Direction
      flexDirection: ['row', 'row-reverse', 'column', 'column-reverse'],
      
      // Flex Wrap
      flexWrap: ['nowrap', 'wrap', 'wrap-reverse'],
      
      // Justify Content
      justifyContent: ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly', 'start', 'end', 'left', 'right'],
      
      // Align Items
      alignItems: ['stretch', 'flex-start', 'flex-end', 'center', 'baseline', 'start', 'end', 'self-start', 'self-end'],
      
      // Align Content
      alignContent: ['stretch', 'flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly', 'start', 'end', 'baseline'],
      
      // Align Self
      alignSelf: ['auto', 'flex-start', 'flex-end', 'center', 'baseline', 'stretch', 'start', 'end', 'self-start', 'self-end'],
      
      // Box Sizing
      boxSizing: ['content-box', 'border-box'],
      
      // Float
      float: ['none', 'left', 'right', 'inline-start', 'inline-end'],
      
      // Clear
      clear: ['none', 'left', 'right', 'both', 'inline-start', 'inline-end'],
      
      // Vertical Align
      verticalAlign: ['baseline', 'sub', 'super', 'text-top', 'text-bottom', 'middle', 'top', 'bottom'],
      
      // Object Fit
      objectFit: ['fill', 'contain', 'cover', 'none', 'scale-down'],
      
      // Pointer Events
      pointerEvents: ['auto', 'none', 'visiblePainted', 'visibleFill', 'visibleStroke', 'visible', 'painted', 'fill', 'stroke', 'all'],
      
      // User Select
      userSelect: ['auto', 'none', 'text', 'all', 'contain'],
      
      // List Style Type
      listStyleType: ['none', 'disc', 'circle', 'square', 'decimal', 'decimal-leading-zero', 'lower-roman', 'upper-roman', 'lower-alpha', 'upper-alpha', 'lower-greek', 'lower-latin', 'upper-latin'],
      
      // List Style Position
      listStylePosition: ['inside', 'outside'],
      
      // Border Collapse
      borderCollapse: ['separate', 'collapse'],
      
      // Table Layout
      tableLayout: ['auto', 'fixed'],
      
      // Caption Side
      captionSide: ['top', 'bottom', 'block-start', 'block-end', 'inline-start', 'inline-end'],
      
      // Empty Cells
      emptyCells: ['show', 'hide'],
      
      // Resize
      resize: ['none', 'both', 'horizontal', 'vertical', 'block', 'inline'],
      
      // Appearance
      appearance: ['none', 'auto', 'button', 'checkbox', 'radio', 'textfield', 'menulist', 'listbox', 'meter', 'progress-bar', 'slider-horizontal', 'searchfield', 'textarea'],
    }
    
    return propertyOptions[prop] || null
  }
  
  // Check if a property should use a select box
  const shouldUseSelect = (prop: string): boolean => {
    return getPropertyOptions(prop) !== null
  }
  
  // Determine if a CSS property typically accepts numeric values
  const isNumericProperty = (prop: string): boolean => {
    const numericProps = [
      // Dimensions
      'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
      // Spacing
      'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'paddingBlockEnd',
    'paddingBlockStart',
    'paddingBlock',
    'paddingInlineEnd',
    'paddingInlineStart',
    'paddingInline',
      'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'marginBlockEnd',
    'marginBlockStart',
    'marginBlock',
    'marginInlineEnd',
    'marginInlineStart',
    'marginInline',
      'gap', 'rowGap', 'columnGap',
      // Position
      'top', 'left', 'right', 'bottom', 'zIndex',
      // Typography
      'fontSize', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent',
      // Border
      'borderWidth', 'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
      'borderBottomLeftRadius', 'borderBottomRightRadius', 'outlineWidth', 'outlineOffset',
      // Effects
      'opacity', 'transform', 'scale', 'rotate', 'translateX', 'translateY',
      // Transitions & Animations
      'transitionDuration', 'animationDuration', 'animationDelay', 'transitionDelay',
      // Filters
      'filter', 'backdropFilter',
      // Other
      'flexBasis', 'order', 'flexGrow', 'flexShrink', 'gridGap', 'gridColumnGap', 'gridRowGap',
      'boxShadow', 'textShadow', 'clip', 'objectPosition'
    ]
    return numericProps.includes(prop)
  }
  
  // Get default min/max/step for numeric properties
  const getNumericPropertyConfig = (prop: string): { min: number; max: number; step: number } => {
    const configs: { [key: string]: { min: number; max: number; step: number } } = {
      width: { min: 0, max: 2000, step: 1 },
      height: { min: 0, max: 2000, step: 1 },
      minWidth: { min: 0, max: 2000, step: 1 },
      minHeight: { min: 0, max: 2000, step: 1 },
      maxWidth: { min: 0, max: 2000, step: 1 },
      maxHeight: { min: 0, max: 2000, step: 1 },
      padding: { min: 0, max: 200, step: 1 },
      paddingTop: { min: 0, max: 200, step: 1 },
      paddingRight: { min: 0, max: 200, step: 1 },
      paddingBottom: { min: 0, max: 200, step: 1 },
      paddingLeft: { min: 0, max: 200, step: 1 },
      margin: { min: -200, max: 200, step: 1 },
      marginTop: { min: -200, max: 200, step: 1 },
      marginRight: { min: -200, max: 200, step: 1 },
      marginBottom: { min: -200, max: 200, step: 1 },
      marginLeft: { min: -200, max: 200, step: 1 },
      gap: { min: 0, max: 100, step: 1 },
      rowGap: { min: 0, max: 100, step: 1 },
      columnGap: { min: 0, max: 100, step: 1 },
      top: { min: -1000, max: 1000, step: 1 },
      left: { min: -1000, max: 1000, step: 1 },
      right: { min: -1000, max: 1000, step: 1 },
      bottom: { min: -1000, max: 1000, step: 1 },
      zIndex: { min: -10, max: 100, step: 1 },
      fontSize: { min: 8, max: 200, step: 1 },
      lineHeight: { min: 0, max: 5, step: 0.1 },
      letterSpacing: { min: -5, max: 10, step: 0.1 },
      wordSpacing: { min: -5, max: 20, step: 0.1 },
      textIndent: { min: -100, max: 500, step: 1 },
      borderWidth: { min: 0, max: 50, step: 1 },
      borderRadius: { min: 0, max: 100, step: 1 },
      borderTopLeftRadius: { min: 0, max: 100, step: 1 },
      borderTopRightRadius: { min: 0, max: 100, step: 1 },
      borderBottomLeftRadius: { min: 0, max: 100, step: 1 },
      borderBottomRightRadius: { min: 0, max: 100, step: 1 },
      outlineWidth: { min: 0, max: 20, step: 1 },
      outlineOffset: { min: -20, max: 20, step: 1 },
      opacity: { min: 0, max: 1, step: 0.01 },
      order: { min: -10, max: 10, step: 1 },
      flexGrow: { min: 0, max: 10, step: 0.1 },
      flexShrink: { min: 0, max: 10, step: 0.1 },
    }
    return configs[prop] || { min: 0, max: 500, step: 1 }
  }

  useEffect(() => {
    if (selectedComponent) {
      const props = selectedComponent.props || {}
      setLocalProps(props)
      
      // Get style object (needed for both gradient sync and numeric values initialization)
      const style = props.style || {}
      
      // Sync gradient state after localProps is set
      // Always sync based on the actual saved value to ensure gradients are restored after page reload
      const bgValue = style.backgroundColor || style.background || ''
      const isGradient = typeof bgValue === 'string' && bgValue.includes('linear-gradient')
      
      // Helper function to parse and set gradient
      const parseAndSetGradient = (gradientValue: string) => {
        const match = gradientValue.match(/linear-gradient\s*\(\s*([^)]+)\s*\)/i)
        if (match) {
          const gradientContent = match[1].trim()
          const parts: string[] = []
          let currentPart = ''
          let parenDepth = 0
          
          for (let i = 0; i < gradientContent.length; i++) {
            const char = gradientContent[i]
            if (char === '(') parenDepth++
            if (char === ')') parenDepth--
            
            if (char === ',' && parenDepth === 0) {
              if (currentPart.trim()) {
                parts.push(currentPart.trim())
                currentPart = ''
              }
            } else {
              currentPart += char
            }
          }
          if (currentPart.trim()) {
            parts.push(currentPart.trim())
          }
          
          const direction = parts[0] && (parts[0].includes('deg') || parts[0].includes('to ')) 
            ? parts[0] 
            : '180deg'
          const colorParts = parts.length > 1 ? parts.slice(1) : parts
          
          const colors = colorParts.map((c: string) => {
            const trimmed = c.trim()
            const stopMatch = trimmed.match(/(.+?)\s+(\d+%?)$/)
            if (stopMatch) {
              return {
                color: stopMatch[1].trim(),
                stop: stopMatch[2].trim()
              }
            }
            return { color: trimmed, stop: '' }
          })
          
          if (colors.length > 0) {
            setGradientDirection(direction)
            setGradientColors(colors)
          }
        }
      }
      
      // Always sync when component ID changes
      // This ensures gradients are properly restored after page reload
      const componentChanged = lastSyncedComponentIdRef.current !== selectedComponent.id
      
      if (componentChanged) {
        lastSyncedComponentIdRef.current = selectedComponent.id
        
        // Always sync gradient state based on actual value
        if (isGradient) {
          setBackgroundType('gradient')
          parseAndSetGradient(bgValue)
        } else if (bgValue && (typeof bgValue === 'string' && (bgValue.match(/^#[0-9a-f]{3,6}$/i) || bgValue.match(/^rgb\(/) || bgValue.match(/^rgba\(/)))) {
          // Only set to solid if we have a clear solid color value
          // Don't reset if bgValue is empty - preserve user's selection
          setBackgroundType('solid')
        }
        // If bgValue is empty, don't change backgroundType - preserve user's selection
      }
      
      // Initialize numeric values from style for all numeric properties
      const newNumericValues: { [key: string]: { value: number; unit: string } } = {}
      
      // Initialize all numeric properties that are set
      Object.keys(style).forEach(key => {
        if (isNumericProperty(key) && style[key]) {
          const parsed = parseValue(style[key])
          // Ensure percentage values are properly parsed
          if (typeof style[key] === 'string' && style[key].includes('%')) {
            parsed.unit = '%'
            // Extract numeric value from percentage string
            const match = style[key].match(/^(-?\d*\.?\d+)%?$/)
            if (match) {
              parsed.value = parseFloat(match[1]) || 0
            }
          }
          newNumericValues[key] = parsed
        }
      })
      
      setNumericValues(prev => {
        // Update numeric values from current style, but preserve user changes if component hasn't changed
        // If component ID changed, reset all values; otherwise merge carefully
        const merged: { [key: string]: { value: number; unit: string } } = {}
        
        // For all numeric properties in the style, use the parsed values
        Object.keys(newNumericValues).forEach(key => {
          merged[key] = newNumericValues[key]
        })
        
        // Preserve any numeric values that exist in prev but aren't in style (user might be editing)
        // But only if the component hasn't changed
        Object.keys(prev).forEach(key => {
          if (!merged[key] && !newNumericValues[key]) {
            // Only preserve if it's a valid numeric property and component hasn't changed
            if (isNumericProperty(key)) {
              merged[key] = prev[key]
            }
          }
        })
        
        return merged
      })
    } else {
      // Clear numeric values when no component is selected
      setNumericValues({})
      // Reset ref when component is deselected to ensure sync on next selection
      lastSyncedComponentIdRef.current = null
    }
    
    // Reset selected action when component changes
    setSelectedAction('')
  }, [selectedComponent?.id, selectedComponent]) // Run when component ID or component object changes
  
  // Separate effect to always sync gradient state based on actual saved value
  // This ensures gradients are restored even if the component object reference doesn't change
  // This effect runs whenever the component or its background value changes
  useEffect(() => {
    if (!selectedComponent) {
      // Reset to solid when no component is selected
      if (backgroundType !== 'solid') {
        setBackgroundType('solid')
      }
      return
    }
    
    // Check both selectedComponent.props (saved value) and localProps (live edits)
    // This ensures we detect gradients even during active editing
    const componentStyle = selectedComponent.props?.style || {}
    const localStyle = localProps.style || {}
    const bgValue = localStyle.backgroundColor || localStyle.background || componentStyle.backgroundColor || componentStyle.background || ''
    const isGradient = typeof bgValue === 'string' && bgValue.includes('linear-gradient')
    
    // Always sync gradient state if we detect a gradient value
    // This ensures gradients are restored after page reload
    if (isGradient) {
      // Always update to gradient if we detect a gradient value (even if already gradient)
      // This ensures the state is correct after page reload
      setBackgroundType('gradient')
      
      // Don't parse/update colors if we're actively editing (to avoid conflicts)
      // But always parse on component selection to restore saved gradients
      if (isEditingGradientRef.current) {
        return
      }
      
      // Always parse and set gradient colors/direction to ensure they're correct
      const match = bgValue.match(/linear-gradient\s*\(\s*([^)]+)\s*\)/i)
      if (match) {
        const gradientContent = match[1].trim()
        const parts: string[] = []
        let currentPart = ''
        let parenDepth = 0
        
        for (let i = 0; i < gradientContent.length; i++) {
          const char = gradientContent[i]
          if (char === '(') parenDepth++
          if (char === ')') parenDepth--
          
          if (char === ',' && parenDepth === 0) {
            if (currentPart.trim()) {
              parts.push(currentPart.trim())
              currentPart = ''
            }
          } else {
            currentPart += char
          }
        }
        if (currentPart.trim()) {
          parts.push(currentPart.trim())
        }
        
        const direction = parts[0] && (parts[0].includes('deg') || parts[0].includes('to ')) 
          ? parts[0] 
          : '180deg'
        const colorParts = parts.length > 1 ? parts.slice(1) : parts
        
        const colors = colorParts.map((c: string) => {
          const trimmed = c.trim()
          const stopMatch = trimmed.match(/(.+?)\s+(\d+%?)$/)
          if (stopMatch) {
            return {
              color: stopMatch[1].trim(),
              stop: stopMatch[2].trim()
            }
          }
          return { color: trimmed, stop: '' }
        })
        
        if (colors.length > 0) {
          setGradientDirection(direction)
          setGradientColors(colors)
        }
      }
    } else if (!isGradient) {
      // Only reset to solid if:
      // 1. We're NOT actively editing a gradient (to prevent resetting during edits)
      // 2. We have a clear solid color value (not empty, not gradient)
      // 3. We're currently in gradient mode (user explicitly switched)
      // This prevents resetting when bgValue is empty or during active editing
      if (!isEditingGradientRef.current) {
        if (backgroundType === 'gradient' && bgValue && (bgValue.match(/^#[0-9a-f]{3,6}$/i) || bgValue.match(/^rgb\(/) || bgValue.match(/^rgba\(/))) {
          // Only reset to solid if we have a clear solid color value AND we're in gradient mode
          // This handles the case where user explicitly switches from gradient to solid
          setBackgroundType('solid')
        }
        // Don't reset if bgValue is empty - preserve user's selection
        // Don't reset if we're already solid - no need to update
      }
    }
    // Don't reset if backgroundType is already 'solid' and value is empty or solid - preserve user's selection
  }, [selectedComponent?.id, selectedComponent?.props?.style?.backgroundColor, selectedComponent?.props?.style?.background, localProps.style?.backgroundColor, localProps.style?.background])

  if (!selectedComponent) {
    return (
      <div className="properties-panel">
        <div className="properties-tabs">
          <button
            className={`tab-button ${activeTab === 'tree' ? 'active' : ''}`}
            onClick={() => setActiveTab('tree')}
          >
            Tree
          </button>
          <button
            className={`tab-button ${activeTab === 'properties' ? 'active' : ''}`}
            onClick={() => setActiveTab('properties')}
          >
            Properties
          </button>
          <button
            className={`tab-button ${activeTab === 'style' ? 'active' : ''}`}
            onClick={() => setActiveTab('style')}
          >
            Style
          </button>
          <button
            className={`tab-button ${activeTab === 'css' ? 'active' : ''}`}
            onClick={() => setActiveTab('css')}
          >
            CSS
          </button>
          <button
            className={`tab-button ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            AI
          </button>
        </div>
        <div className="properties-content">
          {activeTab === 'tree' ? (
            <ComponentTree 
              components={allComponents} 
              selectedId={null} 
              onSelect={onSelect}
              onDelete={onDelete}
              onUpdate={onUpdate}
              onReorder={onReorder}
            />
          ) : activeTab === 'ai' ? (
            <div className="properties-empty">
              <p>Select a component to use AI Assistant</p>
              <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
                The AI Assistant can help you modify component styles using natural language.
              </p>
            </div>
          ) : (
            <div className="properties-empty">
              <p>Select a component to edit its properties</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // AI Prompt Processor - Converts natural language to style changes
  const processAiPrompt = (prompt: string): { [key: string]: string } => {
    const changes: { [key: string]: string } = {}
    const lowerPrompt = prompt.toLowerCase().trim()
    
    // Color changes
    const colorPatterns = [
      { pattern: /(?:make|set|change|color).*?(?:background|bg|background-color).*?(?:to|as|is)?\s*([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))/i, property: 'backgroundColor' },
      { pattern: /(?:make|set|change|color).*?(?:text|font|foreground).*?(?:to|as|is)?\s*([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))/i, property: 'color' },
      { pattern: /(?:background|bg).*?(?:is|to|as)?\s*([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))/i, property: 'backgroundColor' },
      { pattern: /(?:text|font).*?(?:color|is|to|as)?\s*([a-z]+|#[0-9a-f]{3,6}|rgb\([^)]+\))/i, property: 'color' },
    ]
    
    for (const { pattern, property } of colorPatterns) {
      const match = prompt.match(pattern)
      if (match) {
        let color = match[1]
        // Convert common color names to hex if needed
        const colorMap: { [key: string]: string } = {
          'red': '#ff0000', 'blue': '#0000ff', 'green': '#008000',
          'yellow': '#ffff00', 'orange': '#ffa500', 'purple': '#800080',
          'pink': '#ffc0cb', 'black': '#000000', 'white': '#ffffff',
          'gray': '#808080', 'grey': '#808080', 'brown': '#a52a2a',
          'cyan': '#00ffff', 'magenta': '#ff00ff', 'lime': '#00ff00',
          'navy': '#000080', 'teal': '#008080', 'olive': '#808000',
          'maroon': '#800000', 'silver': '#c0c0c0', 'gold': '#ffd700'
        }
        if (colorMap[color.toLowerCase()]) {
          color = colorMap[color.toLowerCase()]
        }
        changes[property] = color
        break
      }
    }
    
    // Size changes
    const sizePatterns = [
      { pattern: /(?:width|w).*?(?:is|to|as)?\s*(\d+)\s*(px|%|em|rem|vh|vw)?/i, property: 'width' },
      { pattern: /(?:height|h).*?(?:is|to|as)?\s*(\d+)\s*(px|%|em|rem|vh|vw)?/i, property: 'height' },
      { pattern: /(?:font|text).*?(?:size|is|to|as)?\s*(\d+)\s*(px|%|em|rem)?/i, property: 'fontSize' },
    ]
    
    for (const { pattern, property } of sizePatterns) {
      const match = prompt.match(pattern)
      if (match) {
        const value = match[1]
        const unit = match[2] || 'px'
        changes[property] = `${value}${unit}`
        break
      }
    }
    
    // Padding/Margin
    const spacingPatterns = [
      { pattern: /(?:add|set|change).*?padding.*?(?:to|as|is)?\s*(\d+)\s*(px|%|em|rem)?/i, property: 'padding' },
      { pattern: /(?:add|set|change).*?margin.*?(?:to|as|is)?\s*(\d+)\s*(px|%|em|rem)?/i, property: 'margin' },
      { pattern: /padding.*?(?:is|to|as)?\s*(\d+)\s*(px|%|em|rem)?/i, property: 'padding' },
      { pattern: /margin.*?(?:is|to|as)?\s*(\d+)\s*(px|%|em|rem)?/i, property: 'margin' },
    ]
    
    for (const { pattern, property } of spacingPatterns) {
      const match = prompt.match(pattern)
      if (match) {
        const value = match[1]
        const unit = match[2] || 'px'
        changes[property] = `${value}${unit}`
        break
      }
    }
    
    // Border radius
    const borderRadiusMatch = prompt.match(/(?:border.*?radius|rounded|round).*?(?:is|to|as)?\s*(\d+)\s*(px|%|em|rem)?/i)
    if (borderRadiusMatch) {
      const value = borderRadiusMatch[1]
      const unit = borderRadiusMatch[2] || 'px'
      changes['borderRadius'] = `${value}${unit}`
    }
    
    // Text alignment
    if (/(?:center|centre).*?(?:text|align)/i.test(prompt) || /(?:align|text).*?(?:center|centre)/i.test(prompt)) {
      changes['textAlign'] = 'center'
    } else if (/(?:left).*?(?:text|align)/i.test(prompt) || /(?:align|text).*?(?:left)/i.test(prompt)) {
      changes['textAlign'] = 'left'
    } else if (/(?:right).*?(?:text|align)/i.test(prompt) || /(?:align|text).*?(?:right)/i.test(prompt)) {
      changes['textAlign'] = 'right'
    }
    
    // Display properties
    if (/(?:make|set|change).*?(?:flex|flexbox)/i.test(prompt)) {
      changes['display'] = 'flex'
    } else if (/(?:make|set|change).*?(?:block)/i.test(prompt)) {
      changes['display'] = 'block'
    } else if (/(?:make|set|change).*?(?:inline)/i.test(prompt)) {
      changes['display'] = 'inline'
    } else if (/(?:make|set|change).*?(?:grid)/i.test(prompt)) {
      changes['display'] = 'grid'
    }
    
    // Flex direction
    if (/(?:column|vertical)/i.test(prompt) && /(?:flex|direction)/i.test(prompt)) {
      changes['flexDirection'] = 'column'
    } else if (/(?:row|horizontal)/i.test(prompt) && /(?:flex|direction)/i.test(prompt)) {
      changes['flexDirection'] = 'row'
    }
    
    // Justify content
    if (/(?:center|centre).*?(?:content|items)/i.test(prompt) || /(?:justify|align).*?(?:center|centre)/i.test(prompt)) {
      changes['justifyContent'] = 'center'
    } else if (/(?:space.*?between)/i.test(prompt)) {
      changes['justifyContent'] = 'space-between'
    } else if (/(?:space.*?around)/i.test(prompt)) {
      changes['justifyContent'] = 'space-around'
    }
    
    // Opacity
    const opacityMatch = prompt.match(/(?:opacity|transparent).*?(?:is|to|as)?\s*(\d+(?:\.\d+)?)/i)
    if (opacityMatch) {
      const value = parseFloat(opacityMatch[1])
      changes['opacity'] = value > 1 ? (value / 100).toString() : value.toString()
    }
    
    // Font weight
    if (/(?:bold|heavy|thick)/i.test(prompt) && /(?:font|text|weight)/i.test(prompt)) {
      changes['fontWeight'] = 'bold'
    } else if (/(?:normal|regular)/i.test(prompt) && /(?:font|text|weight)/i.test(prompt)) {
      changes['fontWeight'] = 'normal'
    } else if (/(?:light|thin)/i.test(prompt) && /(?:font|text|weight)/i.test(prompt)) {
      changes['fontWeight'] = '300'
    }
    
    // Border
    const borderMatch = prompt.match(/(?:border|outline).*?(?:is|to|as)?\s*(\d+)\s*(px)?\s*([a-z]+|#[0-9a-f]{3,6})?/i)
    if (borderMatch) {
      const width = borderMatch[1] || '1'
      const color = borderMatch[3] || '#000000'
      changes['border'] = `${width}px solid ${color}`
    }
    
    return changes
  }
  
  // Helper function to check if prompt is clear enough to auto-apply
  const isClearRequest = (prompt: string): boolean => {
    const lower = prompt.toLowerCase().trim()
    const clearPatterns = [
      /^(make|set|change|update|add|remove|delete|clear)\s+(background|bg|color|text|font|size|width|height|padding|margin|border|opacity|display|position)/i,
      /^(center|align|justify|flex|grid)/i,
      /^(make|set)\s+(it|this|component)\s+(blue|red|green|yellow|black|white|gray|grey|transparent)/i,
      /^(make|set)\s+(it|this|component)\s+(\d+)\s*(px|rem|em|%)/i,
      /^(bold|italic|underline|hidden|visible|block|inline|flex|grid|none)/i
    ]
    
    return clearPatterns.some(pattern => pattern.test(lower))
  }
  
  // Helper function to process a prompt (can be called with any prompt string)
  // Detect if prompt is a creation request (not modification)
  const isCreationRequest = (prompt: string): boolean => {
    const lower = prompt.toLowerCase().trim()
    const creationKeywords = [
      'create', 'make', 'build', 'generate', 'add new', 'new component',
      'new form', 'new page', 'new button', 'new card', 'new chart'
    ]
    return creationKeywords.some(keyword => lower.startsWith(keyword) || lower.includes(` ${keyword} `))
  }

  const processPrompt = async (promptText: string) => {
    // If it's a creation request and we have onAddComponent, create a new component
    if (isCreationRequest(promptText) && onAddComponent) {
      try {
        setAiProcessing(true)
        setAiMessages(prev => [...prev, {
          type: 'user',
          content: promptText,
          timestamp: new Date()
        }])

        // Use AI Development API to generate the component
        const response = await aiDevelopmentAPI.generateComponent({
          description: promptText,
          existing_components: allComponents
        })

        if (response.result && response.result.type) {
          // Convert AI component to ComponentNode format
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

          const allComponentsToAdd = convertAIComponent(response.result)
          
          // Add all components
          allComponentsToAdd.forEach(comp => {
            onAddComponent(comp)
          })

          // Auto-select the root component
          const rootComponent = allComponentsToAdd.find(c => !c.parentId) || allComponentsToAdd[0]
          if (rootComponent && onSelect) {
            onSelect(rootComponent.id)
          }

          setAiMessages(prev => [...prev, {
            type: 'assistant',
            content: `✅ Created ${response.result.type} component and added to canvas! ${response.explanation || ''}`,
            timestamp: new Date(),
            applied: true
          }])

          showToast('Component created and added to canvas!', 'success')
          setAiProcessing(false)
          return
        } else {
          setAiMessages(prev => [...prev, {
            type: 'assistant',
            content: response.explanation || 'Could not create component. Please try again.',
            timestamp: new Date(),
            applied: false
          }])
          setAiProcessing(false)
          return
        }
      } catch (error: any) {
        console.error('Error creating component:', error)
        setAiMessages(prev => [...prev, {
          type: 'assistant',
          content: `Error: ${error.message || 'Failed to create component'}`,
          timestamp: new Date(),
          applied: false
        }])
        setAiProcessing(false)
        return
      }
    }

    // If no component selected and it's not a creation request, show message
    if (!selectedComponent) {
      setAiMessages(prev => [...prev, {
        type: 'assistant',
        content: 'Please select a component to modify, or use "create" to make a new component.',
        timestamp: new Date(),
        applied: false
      }])
      return
    }
    
    try {
      // Call backend LLM API
      const response = await aiAssistantAPI.processPrompt({
        prompt: promptText,
        component_type: selectedComponent.type,
        current_styles: localProps.style || {},
        current_props: localProps || {}
      })
      
      const changes = response.changes
      
      // Handle clarification flow - show guess and ask for confirmation
      if (response.needs_clarification && response.guess) {
        // Track this prompt to avoid asking again
        recentPromptsRef.current.push({ prompt: promptText, timestamp: Date.now() })
        // Keep only last 5 prompts
        if (recentPromptsRef.current.length > 5) {
          recentPromptsRef.current.shift()
        }
        
        setAiProcessing(false)
        
        // Show confirmation dialog - wrap in promise
        const confirmed = await new Promise<boolean>((resolve) => {
          let resolved = false
          confirm({
            title: 'Did you mean this?',
            message: response.message || `Did you mean: "${response.guess}"?`,
            confirmText: 'Yes, apply it',
            cancelText: 'No, cancel',
            confirmButtonStyle: 'primary',
            onConfirm: () => {
              if (!resolved) {
                resolved = true
                resolve(true)
              }
            },
            onCancel: () => {
              if (!resolved) {
                resolved = true
                resolve(false)
              }
            }
          })
        })
        
        if (confirmed) {
          // User confirmed - process the guess as the actual prompt
          setAiMessages(prev => [...prev, {
            type: 'assistant',
            content: `Applying: "${response.guess}"`,
            timestamp: new Date(),
            applied: false
          }])
          
          // Process the confirmed guess (will show confirmation again)
          await processPrompt(response.guess)
          return
        } else {
          // User rejected - show message asking for rephrasing
          setAiMessages(prev => [...prev, {
            type: 'assistant',
            content: 'No changes applied. Please try rephrasing your request or be more specific.',
            timestamp: new Date(),
            applied: false
          }])
          return
        }
      }
      
      if (!changes || Object.keys(changes).length === 0) {
        // Add assistant error message from backend
        setAiMessages(prev => [...prev, {
          type: 'assistant',
          content: response.message || 'I couldn\'t understand that request. Please try again.',
          timestamp: new Date(),
          applied: false
        }])
        setAiProcessing(false)
        return
      }
      
      // Format changes for display
      const formatChanges = (changes: any): string => {
        const parts: string[] = []
        
        if (changes.style && Object.keys(changes.style).length > 0) {
          const styleParts = Object.entries(changes.style).map(([key, value]) => {
            // Convert camelCase to kebab-case for display
            const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase()
            return `  ${kebabKey}: ${value};`
          })
          parts.push('Style Changes:')
          parts.push(...styleParts)
        }
        
        if (changes.customCSS) {
          parts.push('Custom CSS:')
          parts.push(changes.customCSS)
        }
        
        if (changes.type) {
          parts.push(`Component Type: ${changes.type}`)
        }
        
        if (changes.props && Object.keys(changes.props).length > 0) {
          const propParts = Object.entries(changes.props)
            .filter(([key]) => key !== 'children' || changes.props[key] !== 'New Text')
            .map(([key, value]) => {
              if (key === 'children' && typeof value === 'string') {
                return `  Content: "${value}"`
              }
              return `  ${key}: ${JSON.stringify(value)}`
            })
          if (propParts.length > 0) {
            parts.push('Properties:')
            parts.push(...propParts)
          }
        }
        
        return parts.length > 0 ? parts.join('\n') : 'No changes detected'
      }
      
      const changesDisplay = formatChanges(changes)
      
      // Build the full response message including raw AI response if available
      let responseMessage = `I understand your request. Here are the changes I will apply:\n\n${changesDisplay}`
      
      // Add raw AI response if available
      if (response.raw_response) {
        responseMessage += `\n\n--- Full AI Model Response ---\n${response.raw_response}`
      }
      
      responseMessage += `\n\nDo you want to apply these changes?`
      
      // Always show changes in chat first
      setAiProcessing(false)
      setAiMessages(prev => [...prev, {
        type: 'assistant',
        content: responseMessage,
        timestamp: new Date(),
        applied: false
      }])
      
      // Show confirmation dialog
      const confirmed = await new Promise<boolean>((resolve) => {
        let resolved = false
        confirm({
          title: 'Do you want to apply this?',
          message: `The following changes will be applied:\n\n${changesDisplay}`,
          confirmText: 'Yes, apply it',
          cancelText: 'No, cancel',
          confirmButtonStyle: 'primary',
          onConfirm: () => {
            if (!resolved) {
              resolved = true
              resolve(true)
            }
          },
          onCancel: () => {
            if (!resolved) {
              resolved = true
              resolve(false)
            }
          }
        })
      })
      
      if (!confirmed) {
        // User rejected - show message
        setAiMessages(prev => [...prev, {
          type: 'assistant',
          content: 'Changes not applied. You can modify your request and try again.',
          timestamp: new Date(),
          applied: false
        }])
        return
      }
      
      // User confirmed - apply changes to the component
      const updates: Partial<ComponentNode> = {}
      
      // Start with current props
      const newProps = { ...localProps }
      
      // Apply style changes
      if (changes.style && Object.keys(changes.style).length > 0) {
        const currentStyle = newProps.style || {}
        newProps.style = { ...currentStyle, ...changes.style }
      }
      
      // Apply props changes (content, attributes, etc.)
      if (changes.props && Object.keys(changes.props).length > 0) {
        // Merge props changes
        Object.keys(changes.props).forEach(key => {
          newProps[key] = changes.props![key]
        })
      }
      
      // Apply customCSS changes (for hover, pseudo-classes, etc.)
      if (changes.customCSS) {
        newProps.customCSS = changes.customCSS
      }
      
      // Set props if there are any changes
      // Filter out unwanted default "New Text" children
      if (changes.props && changes.props.children) {
        const childrenValue = changes.props.children
        // Remove default "New Text" if it wasn't explicitly requested
        if (typeof childrenValue === 'string' && childrenValue.trim().toLowerCase() === 'new text') {
          delete changes.props.children
        }
      }
      
      if (changes.style || changes.props || changes.customCSS) {
        updates.props = newProps
      }
      
      // Apply component type change
      if (changes.type) {
        updates.type = changes.type
      }
      
      // Apply all updates at once
      if (Object.keys(updates).length > 0) {
        onUpdate(selectedComponent.id, updates)
      }
      
      // Handle wrap_in request - create parent component and move current component as child
      if ((changes as any).wrap_in && onAddComponent) {
        const wrapInType = (changes as any).wrap_in
        const parentId = `comp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
        
        // Create parent component
        const parentComponent: ComponentNode = {
          id: parentId,
          type: wrapInType,
          props: {},
          children: [],
          parentId: selectedComponent.parentId || undefined,
        }
        
        // Add parent component first
        onAddComponent(parentComponent)
        
        // Update selected component to be a child of the new parent
        onUpdate(selectedComponent.id, {
          parentId: parentId,
        })
        
        showToast(`Wrapped component in <${wrapInType}> tag`, 'success')
      }
      
      // Handle modal creation if requested
      if (changes.create_modal && onAddComponent) {
        const convertToComponentNode = (comp: any, parentId?: string): ComponentNode => {
          const componentId = comp.id || `comp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
          
          // Extract children from props if they exist
          const props = { ...comp.props }
          const childrenArray = props.children && Array.isArray(props.children) ? props.children : []
          delete props.children // Remove children from props
          
          const component: ComponentNode = {
            id: componentId,
            type: comp.type || 'div',
            props: props,
            children: [],
            parentId: parentId || undefined,
          }
          
          // Add the component first
          onAddComponent(component)
          
          // Then add all children recursively
          childrenArray.forEach((child: any) => {
            convertToComponentNode(child, componentId)
          })
          
          return component
        }
        
        convertToComponentNode(changes.create_modal)
        showToast('Modal created and added to canvas! Click the button to open it.', 'success')
      }
      
      // Add assistant success message showing what was applied
      const appliedMessage = response.message || 'Changes applied successfully!'
      setAiMessages(prev => [...prev, {
        type: 'assistant',
        content: `${appliedMessage}\n\nApplied changes:\n${changesDisplay}`,
        timestamp: new Date(),
        applied: true
      }])
      
      // Show toast notification
      if (response.explanation) {
        showToast(response.explanation, 'success')
      }
      
      setAiProcessing(false)
    } catch (error: any) {
      console.error('Error processing AI prompt:', error)
      const errorMessage = error?.response?.data?.detail || error?.message || 'Sorry, I encountered an error processing your request. Please try again.'
      setAiMessages(prev => [...prev, {
        type: 'assistant',
        content: errorMessage,
        timestamp: new Date(),
        applied: false
      }])
      setAiProcessing(false)
      showToast('Failed to process AI request', 'error')
    }
  }
  
  const handleAiPrompt = async () => {
    if (!aiPrompt.trim() || !selectedComponent) return
    
    const userMessage = aiPrompt.trim()
    
    // Add user message to chat
    setAiMessages(prev => [...prev, {
      type: 'user',
      content: userMessage,
      timestamp: new Date()
    }])
    
    setAiProcessing(true)
    setAiPrompt('')
    
    // Process the prompt
    await processPrompt(userMessage)
  }
  
  // Clear chat history
  const clearChat = () => {
    setAiMessages([])
  }

  const handleChange = (key: string, value: any) => {
    if (!selectedComponent) {
      console.warn('Cannot update: No component selected')
      return
    }
    
    // If value is empty string, remove the property instead of setting it to empty
    const newProps = { ...localProps }
    if (value === '' || value === null || value === undefined) {
      delete newProps[key]
      // Also set to undefined in the update to ensure it's deleted
      newProps[key] = undefined
    } else {
      newProps[key] = value
    }
    setLocalProps(newProps)
    // Ensure we're updating the correct component by ID
    // Pass the props with undefined for deleted properties
    const updateProps = { ...newProps }
    if (value === '' || value === null || value === undefined) {
      updateProps[key] = undefined
    }
    onUpdate(selectedComponent.id, { props: updateProps })
  }

  const handleStyleChange = (styleKey: string, value: string) => {
    const currentStyle = localProps.style || {}
    let newStyle: any
    
    // If value is empty, remove the property from style object
    if (!value || value.trim() === '') {
      newStyle = { ...currentStyle }
      delete newStyle[styleKey]
    } else {
      // Ensure the value is a string and properly formatted
      const formattedValue = String(value).trim()
      newStyle = { ...currentStyle, [styleKey]: formattedValue }
    }
    
    handleChange('style', newStyle)
  }

  const handleNumericStyleChange = (styleKey: string, value: number, unit: string) => {
    // Ensure value is a valid number
    const numValue = isNaN(value) || value === null || value === undefined ? 0 : Number(value)
    
    // Format the value with the unit - ensure percentage is formatted correctly
    let formattedValue = formatValue(numValue, unit)
    
    // Double-check: ensure percentage values always have the % symbol
    if (unit === '%') {
      formattedValue = `${numValue}%`
    }
    
    // Update numeric values state first to ensure UI updates immediately
    setNumericValues(prev => ({
      ...prev,
      [styleKey]: { value: numValue, unit }
    }))
    
    // Then update the style with the formatted value
    handleStyleChange(styleKey, formattedValue)
  }

  const renderNumericProperty = (key: string, label?: string) => {
    const config = getNumericPropertyConfig(key)
    const currentValue = numericValues[key] || { value: 0, unit: 'px' }
    const value = currentValue.value
    const unit = currentValue.unit
    const displayLabel = label || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())

    return (
      <div key={key} className="property-group numeric-property">
        <label>{displayLabel}</label>
        <div className="numeric-input-group">
          <input
            type="range"
            min={config.min}
            max={config.max}
            step={config.step}
            value={value}
            onChange={(e) => {
              const newValue = parseFloat(e.target.value)
              handleNumericStyleChange(key, newValue, unit)
            }}
            className="range-input"
          />
          <div className="numeric-controls">
            <input
              type="number"
              min={config.min}
              max={config.max}
              step={config.step}
              value={value}
              onChange={(e) => {
                const newValue = parseFloat(e.target.value) || 0
                handleNumericStyleChange(key, newValue, unit)
              }}
              className="number-input"
            />
            <select
              value={unit}
              onChange={(e) => {
                const newUnit = e.target.value
                handleNumericStyleChange(key, value, newUnit)
              }}
              className="unit-select"
            >
              <option value="px">px</option>
              <option value="em">em</option>
              <option value="%">%</option>
              <option value="dvh">dvh</option>
              <option value="dvw">dvw</option>
            </select>
          </div>
        </div>
      </div>
    )
  }

  const renderStyleEditor = () => {
    const commonProps = []
    const styleProps = []

    // Common properties
    if (selectedComponent.type === 'h1' || selectedComponent.type === 'h2' || 
        selectedComponent.type === 'h3' || selectedComponent.type === 'h4' || 
        selectedComponent.type === 'h5' || selectedComponent.type === 'h6' || 
        selectedComponent.type === 'p' || selectedComponent.type === 'button' ||
        selectedComponent.type === 'span' || selectedComponent.type === 'strong' ||
        selectedComponent.type === 'em' || selectedComponent.type === 'small' ||
        selectedComponent.type === 'mark' || selectedComponent.type === 'code' ||
        selectedComponent.type === 'pre' || selectedComponent.type === 'blockquote' ||
        selectedComponent.type === 'abbr' || selectedComponent.type === 'address' ||
        selectedComponent.type === 'time' || selectedComponent.type === 'label' ||
        selectedComponent.type === 'legend' || selectedComponent.type === 'li' ||
        selectedComponent.type === 'dt' || selectedComponent.type === 'dd' ||
        selectedComponent.type === 'th' || selectedComponent.type === 'td' ||
        selectedComponent.type === 'figcaption') {
      commonProps.push(
        <div key="children" className="property-group">
          <label>Text Content</label>
          <input
            type="text"
            value={localProps.children || ''}
            onChange={(e) => handleChange('children', e.target.value)}
          />
        </div>
      )
    }

    if (selectedComponent.type === 'img') {
      commonProps.push(
        <div key="src" className="property-group">
          <label>Image URL</label>
          <input
            type="text"
            value={localProps.src || ''}
            onChange={(e) => handleChange('src', e.target.value)}
          />
        </div>
      )
      commonProps.push(
        <div key="alt" className="property-group">
          <label>Alt Text</label>
          <input
            type="text"
            value={localProps.alt || ''}
            onChange={(e) => handleChange('alt', e.target.value)}
          />
        </div>
      )
    }

    if (selectedComponent.type === 'a') {
      commonProps.push(
        <div key="href" className="property-group">
          <label>Link URL</label>
          <input
            type="text"
            value={localProps.href || ''}
            onChange={(e) => handleChange('href', e.target.value)}
          />
        </div>
      )
    }

    if (selectedComponent.type === 'input' || selectedComponent.type === 'textarea') {
      commonProps.push(
        <div key="placeholder" className="property-group">
          <label>Placeholder</label>
          <input
            type="text"
            value={localProps.placeholder || ''}
            onChange={(e) => handleChange('placeholder', e.target.value)}
          />
        </div>
      )
    }

    // Actions section
    const htmlEventHandlers = [
      { value: 'onClick', label: 'onClick', description: 'Click event handler' },
      { value: 'onChange', label: 'onChange', description: 'Change event handler (for inputs, selects)' },
      { value: 'onBlur', label: 'onBlur', description: 'Blur event handler (when element loses focus)' },
      { value: 'onFocus', label: 'onFocus', description: 'Focus event handler (when element gains focus)' },
      { value: 'onSubmit', label: 'onSubmit', description: 'Submit event handler (for forms)' },
      { value: 'onMouseEnter', label: 'onMouseEnter', description: 'Mouse enter event handler' },
      { value: 'onMouseLeave', label: 'onMouseLeave', description: 'Mouse leave event handler' },
      { value: 'onMouseOver', label: 'onMouseOver', description: 'Mouse over event handler' },
      { value: 'onMouseOut', label: 'onMouseOut', description: 'Mouse out event handler' },
      { value: 'onKeyDown', label: 'onKeyDown', description: 'Key down event handler' },
      { value: 'onKeyUp', label: 'onKeyUp', description: 'Key up event handler' },
      { value: 'onKeyPress', label: 'onKeyPress', description: 'Key press event handler' },
      { value: 'onDoubleClick', label: 'onDoubleClick', description: 'Double click event handler' },
      { value: 'onContextMenu', label: 'onContextMenu', description: 'Right-click context menu handler' },
      { value: 'onDrag', label: 'onDrag', description: 'Drag event handler' },
      { value: 'onDragStart', label: 'onDragStart', description: 'Drag start event handler' },
      { value: 'onDragEnd', label: 'onDragEnd', description: 'Drag end event handler' },
      { value: 'onDrop', label: 'onDrop', description: 'Drop event handler' },
      { value: 'onInput', label: 'onInput', description: 'Input event handler (for text inputs)' },
      { value: 'onInvalid', label: 'onInvalid', description: 'Invalid event handler (for form validation)' },
    ]

    // Get current action value from props
    const currentActionValue = selectedAction || ''
    const currentActionHandler = localProps[currentActionValue] || ''

    commonProps.push(
      <div key="actions-section" className="properties-section">
        <h4>Actions</h4>
        <div className="property-group">
          <label>Select Action</label>
          <select
            value={currentActionValue}
            onChange={(e) => {
              const newAction = e.target.value
              setSelectedAction(newAction)
              // If switching actions, don't clear the previous one
            }}
          >
            <option value="">-- Select Action --</option>
            {htmlEventHandlers.map(handler => (
              <option key={handler.value} value={handler.value}>
                {handler.label} - {handler.description}
              </option>
            ))}
          </select>
        </div>
        {selectedAction && (
          <div className="property-group">
            <label>Handler Function / Code</label>
            <textarea
              value={currentActionHandler}
              onChange={(e) => {
                const handlerCode = e.target.value
                handleChange(selectedAction, handlerCode)
              }}
              placeholder={`Enter function name or code for ${selectedAction}\nExample: handleClick or () => { console.log('clicked') }`}
              rows={4}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                resize: 'vertical',
                minHeight: '80px'
              }}
            />
            <small style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
              Enter a function name (e.g., &quot;handleClick&quot;) or inline code (e.g., &quot;() =&gt; alert('Hello')&quot;)
            </small>
          </div>
        )}
        {/* Show all existing action handlers */}
        {Object.keys(localProps).filter(key => key.startsWith('on')).length > 0 && (
          <div className="property-group" style={{ marginTop: '0.5rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem' }}>Active Handlers:</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {Object.keys(localProps)
                .filter(key => key.startsWith('on') && localProps[key])
                .map(actionKey => (
                  <div key={actionKey} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '0.4rem',
                    background: '#f8f9fa',
                    borderRadius: '4px',
                    fontSize: '0.8rem'
                  }}>
                    <span style={{ fontWeight: '600', color: '#667eea' }}>{actionKey}</span>
                    <button
                      onClick={() => {
                        const newProps = { ...localProps }
                        delete newProps[actionKey]
                        setLocalProps(newProps)
                        if (selectedComponent) {
                          onUpdate(selectedComponent.id, { props: newProps })
                        }
                        if (selectedAction === actionKey) {
                          setSelectedAction('')
                        }
                      }}
                      style={{
                        background: '#e74c3c',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.2rem 0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.7rem'
                      }}
                      title="Remove handler"
                    >
                      Remove
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    )

    // Position properties for layering
    styleProps.push(
      <div key="position-section" className="properties-section">
        <h4>Position & Layering</h4>
        <div className="property-group">
          <label>Position</label>
          <select
            value={localProps.style?.position || 'static'}
            onChange={(e) => handleStyleChange('position', e.target.value)}
          >
            <option value="static">Static</option>
            <option value="relative">Relative</option>
            <option value="absolute">Absolute</option>
            <option value="fixed">Fixed</option>
            <option value="sticky">Sticky</option>
          </select>
        </div>
        {renderNumericProperty('top', 'Top')}
        {renderNumericProperty('left', 'Left')}
        {renderNumericProperty('right', 'Right')}
        {renderNumericProperty('bottom', 'Bottom')}
        {renderNumericProperty('zIndex', 'Z-Index')}
      </div>
    )

    // Size properties
    styleProps.push(
      <div key="size-section" className="properties-section">
        <h4>Size</h4>
        {renderNumericProperty('width', 'Width')}
        {renderNumericProperty('height', 'Height')}
        {renderNumericProperty('minWidth', 'Min Width')}
        {renderNumericProperty('maxWidth', 'Max Width')}
        {renderNumericProperty('minHeight', 'Min Height')}
        {renderNumericProperty('maxHeight', 'Max Height')}
      </div>
    )

    // Spacing properties
    styleProps.push(
      <div key="spacing-section" className="properties-section">
        <h4>Spacing</h4>
        {renderNumericProperty('padding', 'Padding')}
        {renderNumericProperty('margin', 'Margin')}
        {renderNumericProperty('gap', 'Gap')}
      </div>
    )

    // Typography
    styleProps.push(
      <div key="typography-section" className="properties-section">
        <h4>Typography</h4>
        {renderNumericProperty('fontSize', 'Font Size')}
        {renderNumericProperty('lineHeight', 'Line Height')}
        <div className="property-group">
          <label>Font Weight</label>
          <select
            value={localProps.style?.fontWeight || 'normal'}
            onChange={(e) => handleStyleChange('fontWeight', e.target.value)}
          >
            <option value="normal">Normal</option>
            <option value="bold">Bold</option>
            <option value="lighter">Lighter</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="300">300</option>
            <option value="400">400</option>
            <option value="500">500</option>
            <option value="600">600</option>
            <option value="700">700</option>
            <option value="800">800</option>
            <option value="900">900</option>
          </select>
        </div>
        <div className="property-group">
          <label>Text Align</label>
          <select
            value={localProps.style?.textAlign || 'left'}
            onChange={(e) => handleStyleChange('textAlign', e.target.value)}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
            <option value="justify">Justify</option>
          </select>
        </div>
      </div>
    )

    // Colors
    styleProps.push(
      <div key="colors-section" className="properties-section">
        <h4>Colors</h4>
        {(() => {
          const updateGradient = (direction: string, colors: Array<{color: string, stop: string}>) => {
            const colorStops = colors.map(c => `${c.color} ${c.stop}`).join(', ')
            const gradientValue = `linear-gradient(${direction}, ${colorStops})`
            handleStyleChange('backgroundColor', gradientValue)
            // Also set background for compatibility
            handleStyleChange('background', gradientValue)
          }
          
          return (
        <div className="property-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label>Background</label>
                <select
                  value={backgroundType}
                  onChange={(e) => {
                    const newType = e.target.value as 'solid' | 'gradient'
                    setBackgroundType(newType)
                    if (newType === 'solid') {
                      handleStyleChange('backgroundColor', '#ffffff')
                      handleStyleChange('background', '')
                    } else {
                      updateGradient(gradientDirection, gradientColors)
                    }
                  }}
                  style={{
                    padding: '0.2rem 0.4rem',
                    fontSize: '0.7rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="solid">Solid Color</option>
                  <option value="gradient">Linear Gradient</option>
                </select>
              </div>
              
              {backgroundType === 'solid' ? (
                <div className="color-input-group">
          <input
            type="color"
            value={localProps.style?.backgroundColor || '#ffffff'}
            onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                    className="color-picker"
                  />
                  <input
                    type="text"
                    value={localProps.style?.backgroundColor || '#ffffff'}
                    onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                    placeholder="Enter color (hex, rgb, name)..."
                    className="color-text-input"
          />
        </div>
              ) : (
                <div className="gradient-editor">
                  <div style={{ marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: '0.3rem' }}>Direction</label>
                    <select
                      value={gradientDirection}
                      onChange={(e) => {
                        const newDirection = e.target.value
                        setGradientDirection(newDirection)
                        updateGradient(newDirection, gradientColors)
                      }}
                      style={{
                        width: '100%',
                        padding: '0.3rem',
                        fontSize: '0.75rem',
                        border: '1px solid #ddd',
                        borderRadius: '4px'
                      }}
                    >
                      <option value="0deg">To Top</option>
                      <option value="45deg">To Top Right</option>
                      <option value="90deg">To Right</option>
                      <option value="135deg">To Bottom Right</option>
                      <option value="180deg">To Bottom</option>
                      <option value="225deg">To Bottom Left</option>
                      <option value="270deg">To Left</option>
                      <option value="315deg">To Top Left</option>
                    </select>
                  </div>
                  
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                      <label style={{ fontSize: '0.7rem' }}>Color Stops</label>
                      <button
                        onClick={() => {
                          const newColors = [...gradientColors, { color: '#ffffff', stop: `${gradientColors.length * 50}%` }]
                          setGradientColors(newColors)
                          updateGradient(gradientDirection, newColors)
                        }}
                        style={{
                          padding: '0.2rem 0.5rem',
                          fontSize: '0.7rem',
                          backgroundColor: '#667eea',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        + Add Color
                      </button>
                    </div>
                    
                    {gradientColors.map((colorStop, index) => (
                      <div key={index} style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                        <input
                          type="color"
                          value={colorStop.color}
                          onChange={(e) => {
                            const newColors = [...gradientColors]
                            newColors[index].color = e.target.value
                            setGradientColors(newColors)
                            updateGradient(gradientDirection, newColors)
                          }}
                          className="color-picker"
                          style={{ width: '50px', height: '30px' }}
                        />
                        <input
                          type="text"
                          value={colorStop.color}
                          onChange={(e) => {
                            const newColors = [...gradientColors]
                            newColors[index].color = e.target.value
                            setGradientColors(newColors)
                            updateGradient(gradientDirection, newColors)
                          }}
                          placeholder="#ffffff"
                          style={{
                            flex: 1,
                            padding: '0.3rem',
                            fontSize: '0.75rem',
                            border: '1px solid #ddd',
                            borderRadius: '4px'
                          }}
                        />
                        <input
                          type="text"
                          value={colorStop.stop}
                          onChange={(e) => {
                            const newColors = [...gradientColors]
                            newColors[index].stop = e.target.value
                            setGradientColors(newColors)
                            updateGradient(gradientDirection, newColors)
                          }}
                          placeholder="0%"
                          style={{
                            width: '60px',
                            padding: '0.3rem',
                            fontSize: '0.75rem',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            textAlign: 'center'
                          }}
                        />
                        {gradientColors.length > 2 && (
                          <button
                            onClick={() => {
                              const newColors = gradientColors.filter((_, i) => i !== index)
                              setGradientColors(newColors)
                              updateGradient(gradientDirection, newColors)
                            }}
                            style={{
                              padding: '0.2rem 0.4rem',
                              fontSize: '0.7rem',
                              backgroundColor: '#e74c3c',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
        <div className="property-group">
          <label>Text Color</label>
          <div className="color-input-group">
          <input
            type="color"
            value={localProps.style?.color || '#000000'}
            onChange={(e) => handleStyleChange('color', e.target.value)}
              className="color-picker"
            />
            <input
              type="text"
              value={localProps.style?.color || '#000000'}
              onChange={(e) => handleStyleChange('color', e.target.value)}
              placeholder="Enter color (hex, rgb, name)..."
              className="color-text-input"
            />
          </div>
        </div>
        <div className="property-group">
          <label>Border Color</label>
          <div className="color-input-group">
          <input
            type="color"
            value={localProps.style?.borderColor || '#000000'}
            onChange={(e) => handleStyleChange('borderColor', e.target.value)}
              className="color-picker"
            />
            <input
              type="text"
              value={localProps.style?.borderColor || '#000000'}
              onChange={(e) => handleStyleChange('borderColor', e.target.value)}
              placeholder="Enter color (hex, rgb, name)..."
              className="color-text-input"
            />
          </div>
        </div>
      </div>
    )

    // Border & Effects
    styleProps.push(
      <div key="border-section" className="properties-section">
        <h4>Border & Effects</h4>
        {renderNumericProperty('borderRadius', 'Border Radius')}
        {renderNumericProperty('borderWidth', 'Border Width')}
        {renderNumericProperty('opacity', 'Opacity')}
      </div>
    )

    // Layout
    styleProps.push(
      <div key="layout-section" className="properties-section">
        <h4>Layout</h4>
        <div className="property-group">
          <label>Display</label>
          <select
            value={localProps.style?.display || 'block'}
            onChange={(e) => handleStyleChange('display', e.target.value)}
          >
            <option value="block">Block</option>
            <option value="inline">Inline</option>
            <option value="inline-block">Inline Block</option>
            <option value="flex">Flex</option>
            <option value="grid">Grid</option>
            <option value="none">None</option>
          </select>
        </div>
        {localProps.style?.display === 'flex' && (
          <div className="property-group">
            <label>Flex Direction</label>
            <select
              value={localProps.style?.flexDirection || 'row'}
              onChange={(e) => handleStyleChange('flexDirection', e.target.value)}
            >
              <option value="row">Row</option>
              <option value="column">Column</option>
              <option value="row-reverse">Row Reverse</option>
              <option value="column-reverse">Column Reverse</option>
            </select>
          </div>
        )}
      </div>
    )


    return (
      <>
        {commonProps.length > 0 && (
          <div className="properties-section">
            <h4>Content</h4>
            {commonProps}
          </div>
        )}
        {styleProps}
      </>
    )
  }

  return (
    <div className="properties-panel">
      <div className="properties-tabs">
        <button
          className={`tab-button ${activeTab === 'tree' ? 'active' : ''}`}
          onClick={() => setActiveTab('tree')}
        >
          Tree
        </button>
        <button
          className={`tab-button ${activeTab === 'properties' ? 'active' : ''}`}
          onClick={() => setActiveTab('properties')}
        >
          Properties
        </button>
        <button
          className={`tab-button ${activeTab === 'style' ? 'active' : ''}`}
          onClick={() => setActiveTab('style')}
        >
          Style
        </button>
        <button
          className={`tab-button ${activeTab === 'css' ? 'active' : ''}`}
          onClick={() => setActiveTab('css')}
        >
          CSS
        </button>
        <button
          className={`tab-button ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          AI
        </button>
      </div>
      <div className="properties-content">
        {activeTab === 'tree' ? (
          <ComponentTree 
            components={allComponents} 
            selectedId={selectedComponent.id} 
            onSelect={onSelect}
            onDelete={onDelete}
            onUpdate={onUpdate}
            onReorder={onReorder}
          />
        ) : activeTab === 'properties' ? (
          <div className="component-properties-tab">
            <div className="properties-section">
              <h4>Component Properties</h4>
              
              {/* Component ID */}
              <div className="property-group">
                <label>Component ID</label>
                <input
                  type="text"
                  value={selectedComponent.id}
                  onChange={(e) => {
                    const newId = e.target.value.trim()
                    if (newId && newId !== selectedComponent.id) {
                      // Check if ID already exists
                      const idExists = allComponents.some(c => c.id === newId)
                      if (idExists) {
                        showToast('Component ID already exists', 'error')
                        return
                      }
                      if (!newId) {
                        showToast('Component ID cannot be empty', 'error')
                        return
                      }
                      
                      // Since onUpdate can't change the ID (it uses ID to find the component),
                      // we need to: add new component, update children, then delete old
                      if (!onAddComponent || !onDelete) {
                        showToast('Cannot update ID: missing required handlers', 'error')
                        return
                      }
                      
                      // Get all children that need parentId updated
                      const children = allComponents.filter(c => c.parentId === selectedComponent.id)
                      
                      // Create new component with new ID
                      const newComponent = { ...selectedComponent, id: newId }
                      
                      // Add the new component
                      onAddComponent(newComponent, newComponent.parentId)
                      
                      // Update all children's parentId to point to new ID
                      children.forEach(child => {
                        onUpdate(child.id, { parentId: newId })
                      })
                      
                      // Delete the old component
                      onDelete(selectedComponent.id)
                      
                      // Select the new component
                      onSelect(newId)
                      showToast('Component ID updated successfully', 'success')
                    }
                  }}
                  placeholder="Component ID"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
                <small style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                  Unique identifier for this component (changing ID updates all references)
                </small>
              </div>

              {/* Component Type */}
              <div className="property-group">
                <label>Component Type</label>
                <input
                  type="text"
                  value={selectedComponent.type}
                  onChange={(e) => {
                    const newType = e.target.value.trim()
                    if (newType && newType !== selectedComponent.type) {
                      onUpdate(selectedComponent.id, { type: newType })
                    }
                  }}
                  placeholder="Component type (div, button, input, etc.)"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
                <small style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                  HTML element type or custom component name
                </small>
              </div>

              {/* Class Name */}
              <div className="property-group">
                <label>Class Name</label>
                <input
                  type="text"
                  value={localProps.className || ''}
                  onChange={(e) => handleChange('className', e.target.value)}
                  placeholder="CSS class name"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
                <small style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                  CSS class name(s) for this component
                </small>
              </div>

              {/* HTML ID Attribute */}
              <div className="property-group">
                <label>HTML ID Attribute</label>
                <input
                  type="text"
                  value={localProps.id || ''}
                  onChange={(e) => handleChange('id', e.target.value)}
                  placeholder="HTML id attribute"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              {/* Component Name/Label */}
              <div className="property-group">
                <label>Name</label>
                <input
                  type="text"
                  value={localProps.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Component name/label"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              {/* Content */}
              <div className="property-group">
                <label>Content</label>
                {(() => {
                  // Check if component has child components
                  const hasChildComponents = allComponents.some(c => c.parentId === selectedComponent.id)
                  const currentContent = typeof localProps.children === 'string' ? localProps.children : ''
                  
                  return (
                    <>
                      <textarea
                        value={currentContent}
                        onChange={(e) => {
                          // Only allow text content if component has no child components
                          if (!hasChildComponents) {
                            handleChange('children', e.target.value)
                          } else {
                            showToast('Cannot set text content: component has child components. Remove child components first.', 'warning')
                          }
                        }}
                        placeholder={hasChildComponents ? "Component has child components - remove them first" : "Component text content"}
                        rows={3}
                        disabled={hasChildComponents}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          fontSize: '0.875rem',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                          minHeight: '60px',
                          backgroundColor: hasChildComponents ? '#f5f5f5' : 'white',
                          cursor: hasChildComponents ? 'not-allowed' : 'text'
                        }}
                      />
                      <small style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                        {hasChildComponents 
                          ? 'Text content disabled: component has child components. Remove child components to enable text content.'
                          : 'Text content displayed inside this component'}
                      </small>
                    </>
                  )
                })()}
              </div>

              {/* Generate Backend API Button (for forms) */}
              {(selectedComponent.type === 'form' || selectedComponent.type?.toLowerCase().includes('form')) && projectId && (
                <div className="property-group" style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: '600' }}>Backend API</h4>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#666' }}>
                    Generate backend API endpoints, database models, and integrate with this form.
                  </p>
                  <button
                    onClick={async () => {
                      if (!projectId) {
                        showToast('Project ID not available', 'error')
                        return
                      }
                      
                      try {
                        setFormAPIProcessing(true)
                        
                        const request: FormAPIRequest = {
                          component_id: selectedComponent.id,
                          component_data: selectedComponent as any,
                          project_id: projectId
                        }
                        
                        const response = await aiAssistantAPI.generateFormAPI(request)
                        
                        if (response.success) {
                          showToast('Backend API generated successfully!', 'success')
                          
                          // Show detailed summary in a modal or alert
                          const summary = `✅ ${response.message}\n\n${response.summary}`
                          alert(summary)
                        } else {
                          showToast(`API generation completed with errors: ${response.message}`, 'warning')
                          
                          const errorSummary = `❌ ${response.message}\n\nErrors:\n${response.errors.join('\n')}\n\nWarnings:\n${response.warnings.join('\n')}`
                          alert(errorSummary)
                        }
                      } catch (error: any) {
                        console.error('Form API generation error:', error)
                        showToast(`Error generating API: ${error.response?.data?.detail || error.message}`, 'error')
                      } finally {
                        setFormAPIProcessing(false)
                      }
                    }}
                    disabled={formAPIProcessing}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      backgroundColor: formAPIProcessing ? '#ccc' : '#667eea',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: formAPIProcessing ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      transition: 'background-color 0.2s'
                    }}
                  >
                    {formAPIProcessing ? 'Generating API...' : '🔧 Generate Backend API'}
                  </button>
                  {formAPIProcessing && (
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#666', fontStyle: 'italic' }}>
                      This may take a moment. Checking project structure, generating models, routes, and tests...
                    </p>
                  )}
                </div>
              )}

              {/* Data Attributes Section */}
              <div className="properties-section" style={{ marginTop: '1.5rem' }}>
                <h4>Data Attributes</h4>
                {Object.keys(localProps).filter(key => key.startsWith('data-')).length > 0 ? (
                  Object.keys(localProps)
                    .filter(key => key.startsWith('data-'))
                    .map(key => (
                      <div key={key} className="property-group">
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={key}
                            disabled
                            style={{
                              flex: '1',
                              padding: '0.5rem',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              fontSize: '0.875rem',
                              backgroundColor: '#f5f5f5'
                            }}
                          />
                          <input
                            type="text"
                            value={localProps[key] || ''}
                            onChange={(e) => handleChange(key, e.target.value)}
                            placeholder="Value"
                            style={{
                              flex: '2',
                              padding: '0.5rem',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              fontSize: '0.875rem'
                            }}
                          />
                          <button
                            onClick={() => {
                              const newProps = { ...localProps }
                              delete newProps[key]
                              setLocalProps(newProps)
                              onUpdate(selectedComponent.id, { props: newProps })
                            }}
                            className="remove-property-btn"
                            title="Remove attribute"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))
                ) : (
                  <p style={{ color: '#999', fontSize: '0.875rem', fontStyle: 'italic' }}>No data attributes</p>
                )}
                <button
                  onClick={() => {
                    const attrName = prompt('Enter data attribute name (e.g., data-testid):')
                    if (attrName && attrName.trim() && attrName.startsWith('data-')) {
                      handleChange(attrName.trim(), '')
                    } else if (attrName && attrName.trim()) {
                      showToast('Data attributes must start with "data-"', 'error')
                    }
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    marginTop: '0.5rem'
                  }}
                >
                  + Add Data Attribute
                </button>
              </div>

              {/* Other Properties Section */}
              <div className="properties-section" style={{ marginTop: '1.5rem' }}>
                <h4>Other Properties</h4>
                {Object.keys(localProps).filter(key => 
                  !['style', 'children', 'className', 'id', 'name', 'pageId', 'customCSS'].includes(key) &&
                  !key.startsWith('data-') &&
                  !key.startsWith('on') // Exclude event handlers
                ).length > 0 ? (
                  Object.keys(localProps)
                    .filter(key => 
                      !['style', 'children', 'className', 'id', 'name', 'pageId', 'customCSS'].includes(key) &&
                      !key.startsWith('data-') &&
                      !key.startsWith('on')
                    )
                    .map(key => (
                      <div key={key} className="property-group">
                        <div className="property-label-row">
                          <label>{key}</label>
                          <button
                            onClick={() => {
                              const newProps = { ...localProps }
                              delete newProps[key]
                              setLocalProps(newProps)
                              onUpdate(selectedComponent.id, { props: newProps })
                            }}
                            className="remove-property-btn"
                            title="Remove property"
                          >
                            ×
                          </button>
                        </div>
                        <input
                          type="text"
                          value={typeof localProps[key] === 'string' ? localProps[key] : JSON.stringify(localProps[key])}
                          onChange={(e) => {
                            try {
                              // Try to parse as JSON, fallback to string
                              const value = JSON.parse(e.target.value)
                              handleChange(key, value)
                            } catch {
                              handleChange(key, e.target.value)
                            }
                          }}
                          placeholder="Property value"
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                    ))
                ) : (
                  <p style={{ color: '#999', fontSize: '0.875rem', fontStyle: 'italic' }}>No additional properties</p>
                )}
                <button
                  onClick={() => {
                    const propName = prompt('Enter property name:')
                    if (propName && propName.trim()) {
                      const trimmedName = propName.trim()
                      if (['style', 'children', 'className', 'id', 'name', 'pageId', 'customCSS'].includes(trimmedName)) {
                        showToast('This property is managed elsewhere', 'error')
                        return
                      }
                      if (trimmedName.startsWith('data-')) {
                        showToast('Use "Add Data Attribute" for data attributes', 'error')
                        return
                      }
                      if (trimmedName.startsWith('on')) {
                        showToast('Event handlers are not editable here', 'error')
                        return
                      }
                      handleChange(trimmedName, '')
                    }
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    marginTop: '0.5rem'
                  }}
                >
                  + Add Property
                </button>
              </div>

              {/* Action Message Section */}
              <div className="properties-section" style={{ marginTop: '1.5rem' }}>
                <h4>Action Message</h4>
                <div className="action-input-section">
                  <label className="action-label">Describe what should happen when this component is interacted with</label>
                  <textarea
                    className="action-textarea"
                    placeholder="Example: when signup button click then open login page"
                    value={actionMessage}
                    onChange={(e) => setActionMessage(e.target.value)}
                    rows={3}
                  />
                  <button
                    className="action-apply-btn"
                    onClick={async () => {
                      if (!actionMessage.trim() || !selectedComponent) {
                        showToast('Please enter an action message', 'warning')
                        return
                      }
                      
                      const comp = selectedComponent as ComponentNode
                      setActionProcessing(true)
                      try {
                        const response = await aiAssistantAPI.processAction({
                          action_message: actionMessage,
                          component_type: comp.type,
                          component_id: comp.id,
                          current_props: comp.props || {},
                          pages: pages.map(p => ({ id: p.id, name: p.name, route: p.route }))
                        })
                        
                        console.log('Action response received:', response)
                        setActionResponse(response)
                        showToast('Action processed. Please review and confirm.', 'info')
                        // Scroll to review section after a short delay
                        setTimeout(() => {
                          const reviewSection = document.querySelector('.action-review-container')
                          if (reviewSection) {
                            reviewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                          }
                        }, 100)
                      } catch (error: any) {
                        console.error('Error processing action:', error)
                        showToast(error?.response?.data?.detail || 'Failed to process action', 'error')
                      } finally {
                        setActionProcessing(false)
                      }
                    }}
                    disabled={actionProcessing || !actionMessage.trim()}
                  >
                    {actionProcessing ? 'Processing...' : 'Apply'}
                  </button>
                </div>
                
                {/* Debug: Show if response exists */}
                {actionResponse && (
                  <div style={{ padding: '8px', background: '#e3f2fd', borderRadius: '4px', marginTop: '8px', fontSize: '0.75rem' }}>
                    Debug: Action response received (ID: {actionResponse.action_code ? 'Yes' : 'No'})
                  </div>
                )}
                
                {actionResponse && selectedComponent && (
                  <div 
                    className="action-review-container" 
                    style={{ 
                      marginTop: '1rem',
                      display: 'block',
                      visibility: 'visible',
                      opacity: 1,
                      position: 'relative',
                      zIndex: 1
                    }}
                  >
                    <div className="action-review-header">
                      <h3 style={{ margin: 0, fontSize: '1rem', color: '#333' }}>📋 Review Changes Before Applying</h3>
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                        Please review all details below before confirming the changes
                      </p>
                    </div>

                    <div className="action-response-section">
                      <div className="action-response-header">
                        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Action Summary</h4>
                        <button
                          className="action-close-btn"
                          onClick={() => setActionResponse(null)}
                        >
                          ×
                        </button>
                      </div>
                      
                      <div className="action-explanation">
                        <strong>📋 What will happen:</strong>
                        <p>{actionResponse.explanation || 'Action will be applied to the component'}</p>
                      </div>

                      <div className="action-detailed-changes">
                        <strong>🔧 Detailed Changes:</strong>
                        <div className="action-changes-list">
                          {actionResponse.detailed_changes ? (
                            actionResponse.detailed_changes.split('\n').map((line: string, idx: number) => (
                              line.trim() && (
                                <div key={idx} className="action-change-item">
                                  {line}
                                </div>
                              )
                            ))
                          ) : (
                            <div className="action-change-item">
                              {actionResponse.changes?.props ? (
                                Object.entries(actionResponse.changes.props).map(([key, value]) => (
                                  <div key={key}>
                                    • Add/Update property '{key}': {typeof value === 'string' ? value : JSON.stringify(value)}
                                  </div>
                                ))
                              ) : (
                                <div>• No specific changes detected</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {actionResponse.project_impact ? (
                        <div className="action-project-impact">
                          <strong>🚀 Project Impact:</strong>
                          <p>{actionResponse.project_impact}</p>
                        </div>
                      ) : (
                        <div className="action-project-impact">
                          <strong>🚀 Project Impact:</strong>
                          <p>This change will modify the component's behavior. When users interact with this component, the specified action will be triggered.</p>
                        </div>
                      )}

                      <div className="action-code-preview">
                        <strong>💻 Generated Code:</strong>
                        <pre>{actionResponse.action_code || 'No code generated'}</pre>
                      </div>

                      <div className="action-component-info">
                        <strong>📦 Component Details:</strong>
                        <div className="action-info-grid">
                          <div>
                            <span className="action-info-label">Component ID:</span>
                            <span className="action-info-value">{selectedComponent.id}</span>
                          </div>
                          <div>
                            <span className="action-info-label">Component Type:</span>
                            <span className="action-info-value">{selectedComponent.type}</span>
                          </div>
                          {actionResponse.changes?.props && Object.keys(actionResponse.changes.props).length > 0 && (
                            <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                              <span className="action-info-label">Properties to be added/modified:</span>
                              <div className="action-props-list">
                                {Object.keys(actionResponse.changes.props).map((key) => (
                                  <span key={key} className="action-prop-badge">{key}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="action-summary-box">
                        <strong>📝 Summary:</strong>
                        <ul>
                          <li>Component <code>{selectedComponent.id}</code> ({selectedComponent.type}) will be modified</li>
                          {actionResponse.changes?.props && Object.keys(actionResponse.changes.props).length > 0 && (
                            <li>
                              {Object.keys(actionResponse.changes.props).length} propert{Object.keys(actionResponse.changes.props).length === 1 ? 'y' : 'ies'} will be added/modified: {Object.keys(actionResponse.changes.props).join(', ')}
                            </li>
                          )}
                          <li>This change will affect the generated application behavior</li>
                          <li>Review the generated code above to see exactly what will be added</li>
                        </ul>
                      </div>

                      <div className="action-confirm-buttons">
                        <button
                          className="action-confirm-btn"
                          onClick={async () => {
                            if (!actionResponse || !selectedComponent) return
                            
                            // Build detailed confirmation message
                            const confirmationMessage = `
📋 REVIEW CHANGES BEFORE APPLYING

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 WHAT WILL HAPPEN:
${actionResponse.explanation || 'Action will be applied to the component'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔧 DETAILED CHANGES:
${actionResponse.detailed_changes || 
  (actionResponse.changes?.props ? 
    Object.entries(actionResponse.changes.props).map(([key, value]) => 
      `• Add/Update property '${key}': ${typeof value === 'string' ? value : JSON.stringify(value)}`
    ).join('\n') : 
    'No specific changes detected')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 PROJECT IMPACT:
${actionResponse.project_impact || 
  'This change will modify the component\'s behavior. When users interact with this component, the specified action will be triggered.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💻 GENERATED CODE:
${actionResponse.action_code || 'No code generated'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 COMPONENT DETAILS:
• Component ID: ${selectedComponent.id}
• Component Type: ${selectedComponent.type}
${actionResponse.changes?.props && Object.keys(actionResponse.changes.props).length > 0 ? 
  `• Properties to be added/modified: ${Object.keys(actionResponse.changes.props).join(', ')}` : 
  ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ Please review all changes above. Once confirmed, these changes will be applied to your component and will affect the generated application.

Do you want to proceed with applying these changes?
                            `.trim()
                            
                            const confirmed = await new Promise<boolean>((resolve) => {
                              let resolved = false
                              confirm({
                                title: '⚠️ Confirm Action Application',
                                message: confirmationMessage,
                                confirmText: 'Yes, Apply Changes',
                                cancelText: 'No, Cancel',
                                confirmButtonStyle: 'success',
                                onConfirm: () => {
                                  if (!resolved) {
                                    resolved = true
                                    resolve(true)
                                  }
                                },
                                onCancel: () => {
                                  if (!resolved) {
                                    resolved = true
                                    resolve(false)
                                  }
                                }
                              })
                            })
                            
                            if (!confirmed) {
                              showToast('Changes not applied. You can review and try again.', 'info')
                              return
                            }
                            
                            // Apply changes after confirmation
                            if (actionResponse.changes?.props && selectedComponent) {
                              const comp = selectedComponent as ComponentNode
                              const updates: Partial<ComponentNode> = {
                                props: {
                                  ...comp.props,
                                  ...actionResponse.changes.props
                                }
                              }
                              onUpdate(comp.id, updates)
                              showToast('Action applied successfully!', 'success')
                              setActionResponse(null)
                              setActionMessage('')
                            }
                          }}
                        >
                          ✓ Confirm & Apply Changes
                        </button>
                        <button
                          className="action-cancel-btn"
                          onClick={() => setActionResponse(null)}
                        >
                          ✗ Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'css' ? (
          <div className="custom-css-tab">
            <div className="properties-section">
              <h4>Custom CSS / Pseudo Classes</h4>
              <div className="property-group">
                <div className="property-label-row">
                  <label>Custom CSS</label>
                  {localProps.customCSS && (
                    <button
                      className="remove-property-btn"
                      onClick={() => handleChange('customCSS', '')}
                      title="Remove custom CSS"
                    >
                      ×
                    </button>
                  )}
                </div>
                <textarea
                  value={localProps.customCSS || ''}
                  onChange={(e) => handleChange('customCSS', e.target.value)}
                  placeholder="Enter custom CSS including pseudo-classes (e.g., :hover, :before, :after)&#10;&#10;Example:&#10;:hover {&#10;  background-color: #ff0000;&#10;  transform: scale(1.1);&#10;}&#10;&#10;:before {&#10;  content: '★';&#10;  color: gold;&#10;}"
                  className="custom-css-input"
                  rows={12}
                />
                <div className="custom-css-hint">
                  <small>You can use pseudo-classes like :hover, :active, :focus, :before, :after, :first-child, etc.</small>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'ai' ? (
          <div className="ai-chat-container">
            <div className="ai-chat-header">
              <div className="ai-chat-header-content">
                <h3>AI Assistant</h3>
                <p>Ask me to modify your component styles</p>
              </div>
              {aiMessages.length > 0 && (
                <button onClick={clearChat} className="ai-clear-button" title="Clear chat">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>
            
            <div className="ai-chat-messages">
              {aiMessages.length === 0 ? (
                <div className="ai-welcome-message">
                  <div className="ai-welcome-icon">✨</div>
                  <h4>Welcome to AI Assistant!</h4>
                  <p>I can help you modify component styles using natural language.</p>
                  <div className="ai-examples-grid">
                    <div className="ai-example-card">
                      <strong>Colors</strong>
                      <span>"make background blue"</span>
                      <span>"set text color to red"</span>
                    </div>
                    <div className="ai-example-card">
                      <strong>Sizing</strong>
                      <span>"set width to 300px"</span>
                      <span>"font size 24px"</span>
                    </div>
                    <div className="ai-example-card">
                      <strong>Spacing</strong>
                      <span>"add padding 20px"</span>
                      <span>"set margin to 10px"</span>
                    </div>
                    <div className="ai-example-card">
                      <strong>Layout</strong>
                      <span>"center the text"</span>
                      <span>"make it flex"</span>
                    </div>
                  </div>
                </div>
              ) : (
                aiMessages.map((message, index) => (
                  <div key={index} className={`ai-message ai-message-${message.type}`}>
                    <div className="ai-message-avatar">
                      {message.type === 'user' ? '👤' : message.applied ? '✅' : '🤖'}
                    </div>
                    <div className="ai-message-content">
                      <div className="ai-message-text">
                        {message.content.split('\n').map((line, i) => (
                          <span key={i}>
                            {line}
                            {i < message.content.split('\n').length - 1 && <br />}
                          </span>
                        ))}
                      </div>
                      <div className="ai-message-time">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
              {aiProcessing && (
                <div className="ai-message ai-message-assistant ai-message-typing">
                  <div className="ai-message-avatar">🤖</div>
                  <div className="ai-message-content">
                    <div className="ai-typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            
            <div className="ai-chat-input-container">
              <div className="ai-chat-input-wrapper">
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !aiProcessing) {
                      e.preventDefault()
                      handleAiPrompt()
                    }
                  }}
                  placeholder="Type your request... (Press Enter to send)"
                  className="ai-chat-input"
                  rows={1}
                  disabled={aiProcessing}
                />
                <button
                  onClick={handleAiPrompt}
                  disabled={!aiPrompt.trim() || aiProcessing}
                  className="ai-chat-send-button"
                  title="Send message (Enter)"
                >
                  {aiProcessing ? (
                    <div className="ai-spinner"></div>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18 2L9 11M18 2L12 18L9 11M18 2L2 8L9 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </div>
              {selectedComponent && (
                <div className="ai-component-badge">
                  <span>Editing: {selectedComponent.type}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="property-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1', minWidth: '120px' }}>
              <label>Component Type</label>
              <input type="text" value={selectedComponent.type} disabled />
            </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
                {onAddComponent && (
                  <button
                    onClick={() => {
                      if (!selectedComponent || !onAddComponent) {
                        showToast('Please select a component first', 'warning')
                        return
                      }
                      const comp = selectedComponent as ComponentNode
                      
                      // Clone the component and all its children recursively
                      const cloneComponent = (component: ComponentNode, newParentId?: string): ComponentNode => {
                        const newId = `comp-${Date.now()}-${Math.random().toString(36).substring(7)}`
                        const cloned: ComponentNode = {
                          ...component,
                          id: newId,
                          parentId: newParentId,
                          props: {
                            ...component.props,
                            // Remove pageId from cloned component (it will be assigned to current page)
                            pageId: undefined
                          }
                        }
                        return cloned
                      }
                      
                      // Get all children of the selected component
                      const componentChildren = allComponents.filter(c => c.parentId === comp.id)
                      
                      // Clone the main component
                      const clonedComponent = cloneComponent(comp, comp.parentId)
                      
                      // Add the cloned component
                      onAddComponent(clonedComponent, clonedComponent.parentId)
                      
                      // Clone all children recursively
                      const cloneChildrenRecursively = (parentId: string, children: ComponentNode[]) => {
                        children.forEach(child => {
                          const clonedChild = cloneComponent(child, parentId)
                          onAddComponent(clonedChild, parentId)
                          
                          // Get children of this child
                          const childChildren = allComponents.filter(c => c.parentId === child.id)
                          if (childChildren.length > 0) {
                            cloneChildrenRecursively(clonedChild.id, childChildren)
                          }
                        })
                      }
                      
                      // Clone all children
                      if (componentChildren.length > 0) {
                        cloneChildrenRecursively(clonedComponent.id, componentChildren)
                      }
                      
                      showToast('Component duplicated successfully', 'success')
                    }}
                    disabled={!selectedComponent}
                    style={{
                      padding: '0.5rem',
                      backgroundColor: selectedComponent ? '#10b981' : '#cbd5e0',
                      color: selectedComponent ? 'white' : '#718096',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: selectedComponent ? 'pointer' : 'not-allowed',
                      fontSize: '1.2rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: selectedComponent ? 1 : 0.6,
                      transition: 'all 0.2s',
                      minWidth: '36px',
                      height: '36px'
                    }}
                    title={selectedComponent ? 'Duplicate this component' : 'Select a component first'}
                    onMouseEnter={(e) => {
                      if (selectedComponent) {
                        e.currentTarget.style.backgroundColor = '#059669'
                        e.currentTarget.style.transform = 'scale(1.05)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedComponent) {
                        e.currentTarget.style.backgroundColor = '#10b981'
                        e.currentTarget.style.transform = 'scale(1)'
                      }
                    }}
                  >
                    <FiCopy />
                  </button>
                )}
              </div>
            </div>
            {selectedComponent && (selectedComponent as ComponentNode).props?.pageId && (
              <div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', color: '#666', backgroundColor: '#f7fafc', borderRadius: '4px', marginBottom: '0.5rem' }}>
                Linked to page: <strong>{pages.find(p => p.id === (selectedComponent as ComponentNode).props?.pageId)?.name || 'Unknown'}</strong>
              </div>
            )}
            
            {/* CSS Style Search */}
            <div className="style-search-container">
              <div className="style-search-box">
                <input
                  type="text"
                  placeholder="Search CSS properties..."
                  value={styleSearchQuery}
                  onChange={(e) => setStyleSearchQuery(e.target.value)}
                  className="style-search-input"
                />
              </div>
              
              {filteredProperties.length > 0 ? (
                <div className="style-search-results">
                  <div className="style-search-header">
                    <span>
                      {showSearchResults 
                        ? `Found ${filteredProperties.length} properties` 
                        : `${filteredProperties.length} CSS properties (${setProperties.length} set)`}
                    </span>
                  </div>
                  <div className="style-properties-list">
                    {(() => {
                      // Check if any border color properties are in the filtered list
                      const borderColorProps = ['borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor']
                      const hasBorderColors = borderColorProps.some(bcProp => filteredProperties.includes(bcProp))
                      let borderColorsRendered = false
                      
                      // Check if any border style properties are in the filtered list
                      const borderStyleProps = ['borderStyle', 'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle']
                      const hasBorderStyles = borderStyleProps.some(bsProp => filteredProperties.includes(bsProp))
                      let borderStylesRendered = false
                      
                      // Check if any border width properties are in the filtered list
                      const borderWidthProps = ['borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']
                      const hasBorderWidths = borderWidthProps.some(bwProp => filteredProperties.includes(bwProp))
                      let borderWidthsRendered = false
                      
                      // Check if any border radius properties are in the filtered list
                      const borderRadiusProps = ['borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']
                      const hasBorderRadius = borderRadiusProps.some(brProp => filteredProperties.includes(brProp))
                      let borderRadiusRendered = false
                      
                      // Check if shadow properties are in the filtered list
                      const shadowProps = ['boxShadow', 'textShadow']
                      const hasShadows = shadowProps.some(shProp => filteredProperties.includes(shProp))
                      let shadowsRendered = false
                      
                      // Check if margin properties are in the filtered list
                      const marginProps = ['margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft']
                      const hasMargins = marginProps.some(mProp => filteredProperties.includes(mProp))
                      let marginsRendered = false
                      
                      return filteredProperties.map((prop) => {
                        const currentValue = localProps.style?.[prop] || ''
                        const isSet = setProperties.includes(prop)
                        const isNumeric = isNumericProperty(prop)
                        const isColor = isColorProperty(prop)
                        const isShorthand = isShorthandProperty(prop)
                        const relatedProps = isShorthand ? getRelatedProperties(prop) : []
                        const hasRelatedProps = relatedProps.length > 0
                        const isExpanded = expandedShorthand[prop] || false
                        const toggleExpand = () => {
                          setExpandedShorthand(prev => ({ ...prev, [prop]: !prev[prop] }))
                        }
                        
                        // Handle border color grouping
                        const isBorderColor = prop === 'borderColor' || prop === 'borderTopColor' || prop === 'borderRightColor' || prop === 'borderBottomColor' || prop === 'borderLeftColor'
                        
                        // Render border colors group once if any border color property is present
                        if (hasBorderColors && isBorderColor && !borderColorsRendered) {
                          borderColorsRendered = true
                          
                          // Render border colors group
                          const borderColor = localProps.style?.borderColor || ''
                          const borderTopColor = localProps.style?.borderTopColor || borderColor
                          const borderRightColor = localProps.style?.borderRightColor || borderColor
                          const borderBottomColor = localProps.style?.borderBottomColor || borderColor
                          const borderLeftColor = localProps.style?.borderLeftColor || borderColor
                          
                          const getColorValue = (value: string): string => {
                            if (!value) return '#000000'
                            if (value.startsWith('#')) return value
                            const colorMap: { [key: string]: string } = {
                              'white': '#ffffff',
                              'black': '#000000',
                              'red': '#ff0000',
                              'green': '#008000',
                              'blue': '#0000ff',
                              'yellow': '#ffff00',
                              'cyan': '#00ffff',
                              'magenta': '#ff00ff',
                              'transparent': '#000000'
                            }
                            const lowerValue = value.toLowerCase().trim()
                            return colorMap[lowerValue] || value
                          }
                          
                          const borderColorValue = getColorValue(borderColor)
                          const borderTopColorValue = getColorValue(borderTopColor)
                          const borderRightColorValue = getColorValue(borderRightColor)
                          const borderBottomColorValue = getColorValue(borderBottomColor)
                          const borderLeftColorValue = getColorValue(borderLeftColor)
                          
                          const hasAnySet = borderColor || borderTopColor || borderRightColor || borderBottomColor || borderLeftColor
                          
                          return (
                            <div key="border-colors-group" className={`property-group border-colors-group ${hasAnySet ? 'property-set' : 'property-unset'}`}>
                              <div className="property-label-row">
                                <label>Border Colors</label>
                                {hasAnySet && (
                                  <button
                                    className="remove-property-btn"
                                    onClick={() => {
                                      handleStyleChange('borderColor', '')
                                      handleStyleChange('borderTopColor', '')
                                      handleStyleChange('borderRightColor', '')
                                      handleStyleChange('borderBottomColor', '')
                                      handleStyleChange('borderLeftColor', '')
                                    }}
                                    title="Remove all border colors"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                              <div className="border-colors-grid">
                                <div className="border-color-item">
                                  <label>All</label>
                                  <div className="color-input-group">
                                    <input
                                      type="color"
                                      value={borderColorValue}
                                      onChange={(e) => {
                                        const color = e.target.value
                                        // Update all border colors in a single batch
                                        const currentStyle = localProps.style || {}
                                        const newStyle = {
                                          ...currentStyle,
                                          borderColor: color,
                                          borderTopColor: color,
                                          borderRightColor: color,
                                          borderBottomColor: color,
                                          borderLeftColor: color
                                        }
                                        handleChange('style', newStyle)
                                      }}
                                      className="color-picker"
                                    />
                                    <input
                                      type="text"
                                      value={borderColorValue}
                                      onChange={(e) => {
                                        const color = e.target.value
                                        // Update all border colors in a single batch
                                        const currentStyle = localProps.style || {}
                                        const newStyle = {
                                          ...currentStyle,
                                          borderColor: color,
                                          borderTopColor: color,
                                          borderRightColor: color,
                                          borderBottomColor: color,
                                          borderLeftColor: color
                                        }
                                        handleChange('style', newStyle)
                                      }}
                                      placeholder="Enter color..."
                                      className="color-text-input"
                                    />
                                  </div>
                                </div>
                                <div className="border-color-item">
                                  <label>Top</label>
                                  <div className="color-input-group">
                                    <input
                                      type="color"
                                      value={borderTopColorValue}
                                      onChange={(e) => handleStyleChange('borderTopColor', e.target.value)}
                                      className="color-picker"
                                    />
                                    <input
                                      type="text"
                                      value={borderTopColorValue}
                                      onChange={(e) => handleStyleChange('borderTopColor', e.target.value)}
                                      placeholder="Enter color..."
                                      className="color-text-input"
                                    />
                                  </div>
                                </div>
                                <div className="border-color-item">
                                  <label>Right</label>
                                  <div className="color-input-group">
                                    <input
                                      type="color"
                                      value={borderRightColorValue}
                                      onChange={(e) => handleStyleChange('borderRightColor', e.target.value)}
                                      className="color-picker"
                                    />
                                    <input
                                      type="text"
                                      value={borderRightColorValue}
                                      onChange={(e) => handleStyleChange('borderRightColor', e.target.value)}
                                      placeholder="Enter color..."
                                      className="color-text-input"
                                    />
                                  </div>
                                </div>
                                <div className="border-color-item">
                                  <label>Bottom</label>
                                  <div className="color-input-group">
                                    <input
                                      type="color"
                                      value={borderBottomColorValue}
                                      onChange={(e) => handleStyleChange('borderBottomColor', e.target.value)}
                                      className="color-picker"
                                    />
                                    <input
                                      type="text"
                                      value={borderBottomColorValue}
                                      onChange={(e) => handleStyleChange('borderBottomColor', e.target.value)}
                                      placeholder="Enter color..."
                                      className="color-text-input"
                                    />
                                  </div>
                                </div>
                                <div className="border-color-item">
                                  <label>Left</label>
                                  <div className="color-input-group">
                                    <input
                                      type="color"
                                      value={borderLeftColorValue}
                                      onChange={(e) => handleStyleChange('borderLeftColor', e.target.value)}
                                      className="color-picker"
                                    />
                                    <input
                                      type="text"
                                      value={borderLeftColorValue}
                                      onChange={(e) => handleStyleChange('borderLeftColor', e.target.value)}
                                      placeholder="Enter color..."
                                      className="color-text-input"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        }
                        
                        // Skip individual border color properties - they're handled in the group above
                        if (isBorderColor) {
                          return null
                        }
                        
                        // Handle border style properties grouping
                        const isBorderStyle = prop === 'borderStyle' || prop === 'borderTopStyle' || prop === 'borderRightStyle' || prop === 'borderBottomStyle' || prop === 'borderLeftStyle'
                        
                        // Render border styles group once if any border style property is present
                        if (hasBorderStyles && isBorderStyle && !borderStylesRendered) {
                          borderStylesRendered = true
                          
                          const borderStyle = localProps.style?.borderStyle || ''
                          const borderTopStyle = localProps.style?.borderTopStyle || borderStyle
                          const borderRightStyle = localProps.style?.borderRightStyle || borderStyle
                          const borderBottomStyle = localProps.style?.borderBottomStyle || borderStyle
                          const borderLeftStyle = localProps.style?.borderLeftStyle || borderStyle
                          
                          const hasAnySet = borderStyle || borderTopStyle || borderRightStyle || borderBottomStyle || borderLeftStyle
                          const styleOptions = ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']
                          
                          return (
                            <div key="border-styles-group" className={`property-group border-styles-group ${hasAnySet ? 'property-set' : 'property-unset'}`}>
                              <div className="property-label-row">
                                <label>Border Styles</label>
                                {hasAnySet && (
                                  <button
                                    className="remove-property-btn"
                                    onClick={() => {
                                      handleStyleChange('borderStyle', '')
                                      handleStyleChange('borderTopStyle', '')
                                      handleStyleChange('borderRightStyle', '')
                                      handleStyleChange('borderBottomStyle', '')
                                      handleStyleChange('borderLeftStyle', '')
                                    }}
                                    title="Remove all border styles"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                              <div className="border-styles-grid">
                                <div className="border-style-item">
                                  <label>All</label>
                                  <select
                                    value={borderStyle || borderTopStyle || borderRightStyle || borderBottomStyle || borderLeftStyle || ''}
                                    onChange={(e) => {
                                      const style = e.target.value
                                      // Update all border styles in a single batch using handleChange
                                      const currentStyle = localProps.style || {}
                                      const newStyle = { ...currentStyle }
                                      
                                      if (!style || style.trim() === '') {
                                        // Remove all border style properties
                                        delete newStyle.borderStyle
                                        delete newStyle.borderTopStyle
                                        delete newStyle.borderRightStyle
                                        delete newStyle.borderBottomStyle
                                        delete newStyle.borderLeftStyle
                                      } else {
                                        // Set all border style properties
                                        newStyle.borderStyle = style
                                        newStyle.borderTopStyle = style
                                        newStyle.borderRightStyle = style
                                        newStyle.borderBottomStyle = style
                                        newStyle.borderLeftStyle = style
                                      }
                                      
                                      handleChange('style', newStyle)
                                    }}
                                    className="style-select"
                                  >
                                    <option value="">--</option>
                                    {styleOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                </div>
                                <div className="border-style-item">
                                  <label>Top</label>
                                  <select
                                    value={borderTopStyle}
                                    onChange={(e) => handleStyleChange('borderTopStyle', e.target.value)}
                                    className="style-select"
                                  >
                                    {styleOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                </div>
                                <div className="border-style-item">
                                  <label>Right</label>
                                  <select
                                    value={borderRightStyle}
                                    onChange={(e) => handleStyleChange('borderRightStyle', e.target.value)}
                                    className="style-select"
                                  >
                                    {styleOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                </div>
                                <div className="border-style-item">
                                  <label>Bottom</label>
                                  <select
                                    value={borderBottomStyle}
                                    onChange={(e) => handleStyleChange('borderBottomStyle', e.target.value)}
                                    className="style-select"
                                  >
                                    {styleOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                </div>
                                <div className="border-style-item">
                                  <label>Left</label>
                                  <select
                                    value={borderLeftStyle}
                                    onChange={(e) => handleStyleChange('borderLeftStyle', e.target.value)}
                                    className="style-select"
                                  >
                                    {styleOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                </div>
                              </div>
                            </div>
                          )
                        }
                        
                        // Skip individual border style properties - they're handled in the group above
                        if (isBorderStyle) {
    
                      
                      // Check if property should use select box (e.g., position, display, etc.)
                      const propertyOptions = getPropertyOptions(prop)
                      const useSelect = shouldUseSelect(prop)
                      
                      if (useSelect && propertyOptions) {
                        const displayLabel = prop.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
                        
                        return (
                          <div key={prop} className={`property-group select-property ${isSet ? 'property-set' : 'property-unset'}`}>
                            <div className="property-label-row">
                              <label>{displayLabel}</label>
                              {isSet && (
                                <button
                                  className="remove-property-btn"
                                  onClick={() => handleStyleChange(prop, '')}
                                  title="Remove property"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                            <select
                              value={currentValue}
                              onChange={(e) => handleStyleChange(prop, e.target.value)}
                              className="style-select"
                            >
                              <option value="">-- Select --</option>
                              {propertyOptions.map(option => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>
                        )
                      }
                      
                      return null
                        }
                        
                        // Handle border width properties grouping
                        const isBorderWidth = prop === 'borderWidth' || prop === 'borderTopWidth' || prop === 'borderRightWidth' || prop === 'borderBottomWidth' || prop === 'borderLeftWidth'
                        
                        // Render border widths group once if any border width property is present
                        if (hasBorderWidths && isBorderWidth && !borderWidthsRendered) {
                          borderWidthsRendered = true
                          
                          const borderWidth = localProps.style?.borderWidth || ''
                          const borderTopWidth = localProps.style?.borderTopWidth || borderWidth
                          const borderRightWidth = localProps.style?.borderRightWidth || borderWidth
                          const borderBottomWidth = localProps.style?.borderBottomWidth || borderWidth
                          const borderLeftWidth = localProps.style?.borderLeftWidth || borderWidth
                          
                          const hasAnySet = borderWidth || borderTopWidth || borderRightWidth || borderBottomWidth || borderLeftWidth
                          
                          return (
                            <div key="border-widths-group" className={`property-group border-widths-group ${hasAnySet ? 'property-set' : 'property-unset'}`}>
                              <div className="property-label-row">
                                <label>Border Widths</label>
                                {hasAnySet && (
                                  <button
                                    className="remove-property-btn"
                                    onClick={() => {
                                      handleStyleChange('borderWidth', '')
                                      handleStyleChange('borderTopWidth', '')
                                      handleStyleChange('borderRightWidth', '')
                                      handleStyleChange('borderBottomWidth', '')
                                      handleStyleChange('borderLeftWidth', '')
                                    }}
                                    title="Remove all border widths"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                              <div className="border-widths-grid">
                                <div className="border-width-item">
                                  <label>All</label>
                                  {(() => {
                                    const widthNumeric = numericValues.borderWidth || (borderWidth ? parseValue(borderWidth) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('borderWidth')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={widthNumeric.value}
                                          onChange={(e) => {
                                            const newValue = parseFloat(e.target.value)
                                            const formattedValue = formatValue(newValue, widthNumeric.unit)
                                            // Update all border widths in a single batch
                                            const currentStyle = localProps.style || {}
                                            const newStyle = {
                                              ...currentStyle,
                                              borderWidth: formattedValue,
                                              borderTopWidth: formattedValue,
                                              borderRightWidth: formattedValue,
                                              borderBottomWidth: formattedValue,
                                              borderLeftWidth: formattedValue
                                            }
                                            handleChange('style', newStyle)
                                            // Update numeric values state
                                            setNumericValues(prev => ({
                                              ...prev,
                                              borderWidth: { value: newValue, unit: widthNumeric.unit },
                                              borderTopWidth: { value: newValue, unit: widthNumeric.unit },
                                              borderRightWidth: { value: newValue, unit: widthNumeric.unit },
                                              borderBottomWidth: { value: newValue, unit: widthNumeric.unit },
                                              borderLeftWidth: { value: newValue, unit: widthNumeric.unit }
                                            }))
                                          }}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={widthNumeric.value}
                                          onChange={(e) => {
                                            const newValue = parseFloat(e.target.value) || 0
                                            const formattedValue = formatValue(newValue, widthNumeric.unit)
                                            // Update all border widths in a single batch
                                            const currentStyle = localProps.style || {}
                                            const newStyle = {
                                              ...currentStyle,
                                              borderWidth: formattedValue,
                                              borderTopWidth: formattedValue,
                                              borderRightWidth: formattedValue,
                                              borderBottomWidth: formattedValue,
                                              borderLeftWidth: formattedValue
                                            }
                                            handleChange('style', newStyle)
                                            // Update numeric values state
                                            setNumericValues(prev => ({
                                              ...prev,
                                              borderWidth: { value: newValue, unit: widthNumeric.unit },
                                              borderTopWidth: { value: newValue, unit: widthNumeric.unit },
                                              borderRightWidth: { value: newValue, unit: widthNumeric.unit },
                                              borderBottomWidth: { value: newValue, unit: widthNumeric.unit },
                                              borderLeftWidth: { value: newValue, unit: widthNumeric.unit }
                                            }))
                                          }}
                                          className="number-input"
                                        />
                                        <select
                                          value={widthNumeric.unit}
                                          onChange={(e) => {
                                            const newUnit = e.target.value
                                            const formattedValue = formatValue(widthNumeric.value, newUnit)
                                            // Update all border widths in a single batch
                                            const currentStyle = localProps.style || {}
                                            const newStyle = {
                                              ...currentStyle,
                                              borderWidth: formattedValue,
                                              borderTopWidth: formattedValue,
                                              borderRightWidth: formattedValue,
                                              borderBottomWidth: formattedValue,
                                              borderLeftWidth: formattedValue
                                            }
                                            handleChange('style', newStyle)
                                            // Update numeric values state
                                            setNumericValues(prev => ({
                                              ...prev,
                                              borderWidth: { value: widthNumeric.value, unit: newUnit },
                                              borderTopWidth: { value: widthNumeric.value, unit: newUnit },
                                              borderRightWidth: { value: widthNumeric.value, unit: newUnit },
                                              borderBottomWidth: { value: widthNumeric.value, unit: newUnit },
                                              borderLeftWidth: { value: widthNumeric.value, unit: newUnit }
                                            }))
                                          }}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                                <div className="border-width-item">
                                  <label>Top</label>
                                  {(() => {
                                    const widthNumeric = numericValues.borderTopWidth || (borderTopWidth ? parseValue(borderTopWidth) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('borderTopWidth')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={widthNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderTopWidth', parseFloat(e.target.value), widthNumeric.unit)}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={widthNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderTopWidth', parseFloat(e.target.value) || 0, widthNumeric.unit)}
                                          className="number-input"
                                        />
                                        <select
                                          value={widthNumeric.unit}
                                          onChange={(e) => handleNumericStyleChange('borderTopWidth', widthNumeric.value, e.target.value)}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                                <div className="border-width-item">
                                  <label>Right</label>
                                  {(() => {
                                    const widthNumeric = numericValues.borderRightWidth || (borderRightWidth ? parseValue(borderRightWidth) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('borderRightWidth')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={widthNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderRightWidth', parseFloat(e.target.value), widthNumeric.unit)}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={widthNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderRightWidth', parseFloat(e.target.value) || 0, widthNumeric.unit)}
                                          className="number-input"
                                        />
                                        <select
                                          value={widthNumeric.unit}
                                          onChange={(e) => handleNumericStyleChange('borderRightWidth', widthNumeric.value, e.target.value)}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                                <div className="border-width-item">
                                  <label>Bottom</label>
                                  {(() => {
                                    const widthNumeric = numericValues.borderBottomWidth || (borderBottomWidth ? parseValue(borderBottomWidth) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('borderBottomWidth')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={widthNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderBottomWidth', parseFloat(e.target.value), widthNumeric.unit)}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={widthNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderBottomWidth', parseFloat(e.target.value) || 0, widthNumeric.unit)}
                                          className="number-input"
                                        />
                                        <select
                                          value={widthNumeric.unit}
                                          onChange={(e) => handleNumericStyleChange('borderBottomWidth', widthNumeric.value, e.target.value)}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                                <div className="border-width-item">
                                  <label>Left</label>
                                  {(() => {
                                    const widthNumeric = numericValues.borderLeftWidth || (borderLeftWidth ? parseValue(borderLeftWidth) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('borderLeftWidth')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={widthNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderLeftWidth', parseFloat(e.target.value), widthNumeric.unit)}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={widthNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderLeftWidth', parseFloat(e.target.value) || 0, widthNumeric.unit)}
                                          className="number-input"
                                        />
                                        <select
                                          value={widthNumeric.unit}
                                          onChange={(e) => handleNumericStyleChange('borderLeftWidth', widthNumeric.value, e.target.value)}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                              </div>
                            </div>
                          )
                        }
                        
                        // Skip individual border width properties - they're handled in the group above
                        if (isBorderWidth) {
                          return null
                        }
                        
                        // Handle border radius properties grouping
                        const isBorderRadius = prop === 'borderRadius' || prop === 'borderTopLeftRadius' || prop === 'borderTopRightRadius' || prop === 'borderBottomRightRadius' || prop === 'borderBottomLeftRadius'
                        
                        // Render border radius group once if any border radius property is present
                        if (hasBorderRadius && isBorderRadius && !borderRadiusRendered) {
                          borderRadiusRendered = true
                          
                          const borderRadius = localProps.style?.borderRadius || ''
                          const borderTopLeftRadius = localProps.style?.borderTopLeftRadius || borderRadius
                          const borderTopRightRadius = localProps.style?.borderTopRightRadius || borderRadius
                          const borderBottomRightRadius = localProps.style?.borderBottomRightRadius || borderRadius
                          const borderBottomLeftRadius = localProps.style?.borderBottomLeftRadius || borderRadius
                          
                          const hasAnySet = borderRadius || borderTopLeftRadius || borderTopRightRadius || borderBottomRightRadius || borderBottomLeftRadius
                          
                          return (
                            <div key="border-radius-group" className={`property-group border-radius-group ${hasAnySet ? 'property-set' : 'property-unset'}`}>
                              <div className="property-label-row">
                                <label>Border Radius</label>
                                {hasAnySet && (
                                  <button
                                    className="remove-property-btn"
                                    onClick={() => {
                                      handleStyleChange('borderRadius', '')
                                      handleStyleChange('borderTopLeftRadius', '')
                                      handleStyleChange('borderTopRightRadius', '')
                                      handleStyleChange('borderBottomRightRadius', '')
                                      handleStyleChange('borderBottomLeftRadius', '')
                                    }}
                                    title="Remove all border radius"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                              <div className="border-radius-grid">
                                <div className="border-radius-item">
                                  <label>All</label>
                                  {(() => {
                                    const radiusNumeric = numericValues.borderRadius || (borderRadius ? parseValue(borderRadius) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('borderRadius')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={radiusNumeric.value}
                                          onChange={(e) => {
                                            const newValue = parseFloat(e.target.value)
                                            const formattedValue = formatValue(newValue, radiusNumeric.unit)
                                            // Update all border radius in a single batch
                                            const currentStyle = localProps.style || {}
                                            const newStyle = {
                                              ...currentStyle,
                                              borderRadius: formattedValue,
                                              borderTopLeftRadius: formattedValue,
                                              borderTopRightRadius: formattedValue,
                                              borderBottomRightRadius: formattedValue,
                                              borderBottomLeftRadius: formattedValue
                                            }
                                            handleChange('style', newStyle)
                                            // Update numeric values state
                                            setNumericValues(prev => ({
                                              ...prev,
                                              borderRadius: { value: newValue, unit: radiusNumeric.unit },
                                              borderTopLeftRadius: { value: newValue, unit: radiusNumeric.unit },
                                              borderTopRightRadius: { value: newValue, unit: radiusNumeric.unit },
                                              borderBottomRightRadius: { value: newValue, unit: radiusNumeric.unit },
                                              borderBottomLeftRadius: { value: newValue, unit: radiusNumeric.unit }
                                            }))
                                          }}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={radiusNumeric.value}
                                          onChange={(e) => {
                                            const newValue = parseFloat(e.target.value) || 0
                                            const formattedValue = formatValue(newValue, radiusNumeric.unit)
                                            // Update all border radius in a single batch
                                            const currentStyle = localProps.style || {}
                                            const newStyle = {
                                              ...currentStyle,
                                              borderRadius: formattedValue,
                                              borderTopLeftRadius: formattedValue,
                                              borderTopRightRadius: formattedValue,
                                              borderBottomRightRadius: formattedValue,
                                              borderBottomLeftRadius: formattedValue
                                            }
                                            handleChange('style', newStyle)
                                            // Update numeric values state
                                            setNumericValues(prev => ({
                                              ...prev,
                                              borderRadius: { value: newValue, unit: radiusNumeric.unit },
                                              borderTopLeftRadius: { value: newValue, unit: radiusNumeric.unit },
                                              borderTopRightRadius: { value: newValue, unit: radiusNumeric.unit },
                                              borderBottomRightRadius: { value: newValue, unit: radiusNumeric.unit },
                                              borderBottomLeftRadius: { value: newValue, unit: radiusNumeric.unit }
                                            }))
                                          }}
                                          className="number-input"
                                        />
                                        <select
                                          value={radiusNumeric.unit}
                                          onChange={(e) => {
                                            const newUnit = e.target.value
                                            const formattedValue = formatValue(radiusNumeric.value, newUnit)
                                            // Update all border radius in a single batch
                                            const currentStyle = localProps.style || {}
                                            const newStyle = {
                                              ...currentStyle,
                                              borderRadius: formattedValue,
                                              borderTopLeftRadius: formattedValue,
                                              borderTopRightRadius: formattedValue,
                                              borderBottomRightRadius: formattedValue,
                                              borderBottomLeftRadius: formattedValue
                                            }
                                            handleChange('style', newStyle)
                                            // Update numeric values state
                                            setNumericValues(prev => ({
                                              ...prev,
                                              borderRadius: { value: radiusNumeric.value, unit: newUnit },
                                              borderTopLeftRadius: { value: radiusNumeric.value, unit: newUnit },
                                              borderTopRightRadius: { value: radiusNumeric.value, unit: newUnit },
                                              borderBottomRightRadius: { value: radiusNumeric.value, unit: newUnit },
                                              borderBottomLeftRadius: { value: radiusNumeric.value, unit: newUnit }
                                            }))
                                          }}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                                <div className="border-radius-item">
                                  <label>Top Left</label>
                                  {(() => {
                                    const radiusNumeric = numericValues.borderTopLeftRadius || (borderTopLeftRadius ? parseValue(borderTopLeftRadius) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('borderTopLeftRadius')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={radiusNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderTopLeftRadius', parseFloat(e.target.value), radiusNumeric.unit)}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={radiusNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderTopLeftRadius', parseFloat(e.target.value) || 0, radiusNumeric.unit)}
                                          className="number-input"
                                        />
                                        <select
                                          value={radiusNumeric.unit}
                                          onChange={(e) => handleNumericStyleChange('borderTopLeftRadius', radiusNumeric.value, e.target.value)}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                                <div className="border-radius-item">
                                  <label>Top Right</label>
                                  {(() => {
                                    const radiusNumeric = numericValues.borderTopRightRadius || (borderTopRightRadius ? parseValue(borderTopRightRadius) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('borderTopRightRadius')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={radiusNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderTopRightRadius', parseFloat(e.target.value), radiusNumeric.unit)}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={radiusNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderTopRightRadius', parseFloat(e.target.value) || 0, radiusNumeric.unit)}
                                          className="number-input"
                                        />
                                        <select
                                          value={radiusNumeric.unit}
                                          onChange={(e) => handleNumericStyleChange('borderTopRightRadius', radiusNumeric.value, e.target.value)}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                                <div className="border-radius-item">
                                  <label>Bottom Right</label>
                                  {(() => {
                                    const radiusNumeric = numericValues.borderBottomRightRadius || (borderBottomRightRadius ? parseValue(borderBottomRightRadius) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('borderBottomRightRadius')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={radiusNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderBottomRightRadius', parseFloat(e.target.value), radiusNumeric.unit)}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={radiusNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderBottomRightRadius', parseFloat(e.target.value) || 0, radiusNumeric.unit)}
                                          className="number-input"
                                        />
                                        <select
                                          value={radiusNumeric.unit}
                                          onChange={(e) => handleNumericStyleChange('borderBottomRightRadius', radiusNumeric.value, e.target.value)}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                                <div className="border-radius-item">
                                  <label>Bottom Left</label>
                                  {(() => {
                                    const radiusNumeric = numericValues.borderBottomLeftRadius || (borderBottomLeftRadius ? parseValue(borderBottomLeftRadius) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('borderBottomLeftRadius')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={radiusNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderBottomLeftRadius', parseFloat(e.target.value), radiusNumeric.unit)}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={radiusNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('borderBottomLeftRadius', parseFloat(e.target.value) || 0, radiusNumeric.unit)}
                                          className="number-input"
                                        />
                                        <select
                                          value={radiusNumeric.unit}
                                          onChange={(e) => handleNumericStyleChange('borderBottomLeftRadius', radiusNumeric.value, e.target.value)}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                              </div>
                            </div>
                          )
                        }
                        
                        // Skip individual border radius properties - they're handled in the group above
                        if (isBorderRadius) {
                          return null
                        }
                        
                        // Handle margin properties grouping
                        const isMargin = prop === 'margin' || prop === 'marginTop' || prop === 'marginRight' || prop === 'marginBottom' || prop === 'marginLeft'
                        
                        // Render margin group once if any margin property is present
                        if (hasMargins && isMargin && !marginsRendered) {
                          marginsRendered = true
                          
                          const margin = localProps.style?.margin || ''
                          const marginTop = localProps.style?.marginTop || margin
                          const marginRight = localProps.style?.marginRight || margin
                          const marginBottom = localProps.style?.marginBottom || margin
                          const marginLeft = localProps.style?.marginLeft || margin
                          
                          const hasAnySet = margin || marginTop || marginRight || marginBottom || marginLeft
                          
                          return (
                            <div key="margins-group" className={`property-group margins-group ${hasAnySet ? 'property-set' : 'property-unset'}`}>
                              <div className="property-label-row">
                                <label>Margins</label>
                                {hasAnySet && (
                                  <button
                                    className="remove-property-btn"
                                    onClick={() => {
                                      handleStyleChange('margin', '')
                                      handleStyleChange('marginTop', '')
                                      handleStyleChange('marginRight', '')
                                      handleStyleChange('marginBottom', '')
                                      handleStyleChange('marginLeft', '')
                                    }}
                                    title="Remove all margins"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                              <div className="margins-grid">
                                <div className="margin-item">
                                  <label>All</label>
                                  {(() => {
                                    const marginNumeric = numericValues.margin || (margin ? parseValue(margin) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('margin')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={marginNumeric.value}
                                          onChange={(e) => {
                                            const newValue = parseFloat(e.target.value)
                                            const formattedValue = formatValue(newValue, marginNumeric.unit)
                                            // Update all margins in a single batch
                                            const currentStyle = localProps.style || {}
                                            const newStyle = {
                                              ...currentStyle,
                                              margin: formattedValue,
                                              marginTop: formattedValue,
                                              marginRight: formattedValue,
                                              marginBottom: formattedValue,
                                              marginLeft: formattedValue
                                            }
                                            handleChange('style', newStyle)
                                            // Update numeric values state
                                            setNumericValues(prev => ({
                                              ...prev,
                                              margin: { value: newValue, unit: marginNumeric.unit },
                                              marginTop: { value: newValue, unit: marginNumeric.unit },
                                              marginRight: { value: newValue, unit: marginNumeric.unit },
                                              marginBottom: { value: newValue, unit: marginNumeric.unit },
                                              marginLeft: { value: newValue, unit: marginNumeric.unit }
                                            }))
                                          }}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={marginNumeric.value}
                                          onChange={(e) => {
                                            const newValue = parseFloat(e.target.value) || 0
                                            const formattedValue = formatValue(newValue, marginNumeric.unit)
                                            // Update all margins in a single batch
                                            const currentStyle = localProps.style || {}
                                            const newStyle = {
                                              ...currentStyle,
                                              margin: formattedValue,
                                              marginTop: formattedValue,
                                              marginRight: formattedValue,
                                              marginBottom: formattedValue,
                                              marginLeft: formattedValue
                                            }
                                            handleChange('style', newStyle)
                                            // Update numeric values state
                                            setNumericValues(prev => ({
                                              ...prev,
                                              margin: { value: newValue, unit: marginNumeric.unit },
                                              marginTop: { value: newValue, unit: marginNumeric.unit },
                                              marginRight: { value: newValue, unit: marginNumeric.unit },
                                              marginBottom: { value: newValue, unit: marginNumeric.unit },
                                              marginLeft: { value: newValue, unit: marginNumeric.unit }
                                            }))
                                          }}
                                          className="number-input"
                                        />
                                        <select
                                          value={marginNumeric.unit}
                                          onChange={(e) => {
                                            const newUnit = e.target.value
                                            const formattedValue = formatValue(marginNumeric.value, newUnit)
                                            // Update all margins in a single batch
                                            const currentStyle = localProps.style || {}
                                            const newStyle = {
                                              ...currentStyle,
                                              margin: formattedValue,
                                              marginTop: formattedValue,
                                              marginRight: formattedValue,
                                              marginBottom: formattedValue,
                                              marginLeft: formattedValue
                                            }
                                            handleChange('style', newStyle)
                                            // Update numeric values state
                                            setNumericValues(prev => ({
                                              ...prev,
                                              margin: { value: marginNumeric.value, unit: newUnit },
                                              marginTop: { value: marginNumeric.value, unit: newUnit },
                                              marginRight: { value: marginNumeric.value, unit: newUnit },
                                              marginBottom: { value: marginNumeric.value, unit: newUnit },
                                              marginLeft: { value: marginNumeric.value, unit: newUnit }
                                            }))
                                          }}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                                <div className="margin-item">
                                  <label>Top</label>
                                  {(() => {
                                    const marginNumeric = numericValues.marginTop || (marginTop ? parseValue(marginTop) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('marginTop')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={marginNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('marginTop', parseFloat(e.target.value), marginNumeric.unit)}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={marginNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('marginTop', parseFloat(e.target.value) || 0, marginNumeric.unit)}
                                          className="number-input"
                                        />
                                        <select
                                          value={marginNumeric.unit}
                                          onChange={(e) => handleNumericStyleChange('marginTop', marginNumeric.value, e.target.value)}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                                <div className="margin-item">
                                  <label>Right</label>
                                  {(() => {
                                    const marginNumeric = numericValues.marginRight || (marginRight ? parseValue(marginRight) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('marginRight')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={marginNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('marginRight', parseFloat(e.target.value), marginNumeric.unit)}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={marginNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('marginRight', parseFloat(e.target.value) || 0, marginNumeric.unit)}
                                          className="number-input"
                                        />
                                        <select
                                          value={marginNumeric.unit}
                                          onChange={(e) => handleNumericStyleChange('marginRight', marginNumeric.value, e.target.value)}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                                <div className="margin-item">
                                  <label>Bottom</label>
                                  {(() => {
                                    const marginNumeric = numericValues.marginBottom || (marginBottom ? parseValue(marginBottom) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('marginBottom')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={marginNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('marginBottom', parseFloat(e.target.value), marginNumeric.unit)}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={marginNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('marginBottom', parseFloat(e.target.value) || 0, marginNumeric.unit)}
                                          className="number-input"
                                        />
                                        <select
                                          value={marginNumeric.unit}
                                          onChange={(e) => handleNumericStyleChange('marginBottom', marginNumeric.value, e.target.value)}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                                <div className="margin-item">
                                  <label>Left</label>
                                  {(() => {
                                    const marginNumeric = numericValues.marginLeft || (marginLeft ? parseValue(marginLeft) : { value: 0, unit: 'px' })
                                    const config = getNumericPropertyConfig('marginLeft')
                                    return (
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={marginNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('marginLeft', parseFloat(e.target.value), marginNumeric.unit)}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={config.min}
                                          max={config.max}
                                          step={config.step}
                                          value={marginNumeric.value}
                                          onChange={(e) => handleNumericStyleChange('marginLeft', parseFloat(e.target.value) || 0, marginNumeric.unit)}
                                          className="number-input"
                                        />
                                        <select
                                          value={marginNumeric.unit}
                                          onChange={(e) => handleNumericStyleChange('marginLeft', marginNumeric.value, e.target.value)}
                                          className="unit-select"
                                        >
                                          <option value="px">px</option>
                                          <option value="em">em</option>
                                          <option value="%">%</option>
                                          <option value="dvh">dvh</option>
                                          <option value="dvw">dvw</option>
                                        </select>
                                      </div>
                                    )
                                  })()}
                                </div>
                              </div>
                            </div>
                          )
                        }
                        
                        // Skip individual margin properties - they're handled in the group above
                        if (isMargin) {
                          return null
                        }
                        
                        // Handle shadow properties grouping
                        const isShadow = prop === 'boxShadow' || prop === 'textShadow'
                        
                        // Render shadow group once if any shadow property is present
                        if (hasShadows && isShadow && !shadowsRendered) {
                          shadowsRendered = true
                          
                          const boxShadow = localProps.style?.boxShadow || ''
                          const textShadow = localProps.style?.textShadow || ''
                          const hasAnySet = boxShadow || textShadow
                          
                          const boxShadowParsed = parseShadow(boxShadow, true) // box-shadow has spread
                          const textShadowParsed = parseShadow(textShadow, false) // text-shadow doesn't have spread
                          
                          return (
                            <div key="shadows-group" className={`property-group shadows-group ${hasAnySet ? 'property-set' : 'property-unset'}`}>
                              <div className="property-label-row">
                                <label>Shadows</label>
                                {hasAnySet && (
                                  <button
                                    className="remove-property-btn"
                                    onClick={() => {
                                      handleStyleChange('boxShadow', '')
                                      handleStyleChange('textShadow', '')
                                    }}
                                    title="Remove all shadows"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                              <div className="shadows-container">
                                {/* Box Shadow */}
                                <div className="shadow-item">
                                  <label className="shadow-label">Box Shadow</label>
                                  <div className="shadow-controls">
                                    <div className="shadow-control-row">
                                      <label>Offset X</label>
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={-50}
                                          max={50}
                                          step={1}
                                          value={boxShadowParsed.offsetX}
                                          onChange={(e) => {
                                            const newOffsetX = parseFloat(e.target.value)
                                            const newValue = formatShadow(newOffsetX, boxShadowParsed.offsetY, boxShadowParsed.blur, boxShadowParsed.spread, boxShadowParsed.color, true)
                                            handleStyleChange('boxShadow', newValue)
                                          }}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={-50}
                                          max={50}
                                          step={1}
                                          value={boxShadowParsed.offsetX}
                                          onChange={(e) => {
                                            const newOffsetX = parseFloat(e.target.value) || 0
                                            const newValue = formatShadow(newOffsetX, boxShadowParsed.offsetY, boxShadowParsed.blur, boxShadowParsed.spread, boxShadowParsed.color, true)
                                            handleStyleChange('boxShadow', newValue)
                                          }}
                                          className="number-input"
                                        />
                                        <span className="unit-label">px</span>
                                      </div>
                                    </div>
                                    <div className="shadow-control-row">
                                      <label>Offset Y</label>
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={-50}
                                          max={50}
                                          step={1}
                                          value={boxShadowParsed.offsetY}
                                          onChange={(e) => {
                                            const newOffsetY = parseFloat(e.target.value)
                                            const newValue = formatShadow(boxShadowParsed.offsetX, newOffsetY, boxShadowParsed.blur, boxShadowParsed.spread, boxShadowParsed.color, true)
                                            handleStyleChange('boxShadow', newValue)
                                          }}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={-50}
                                          max={50}
                                          step={1}
                                          value={boxShadowParsed.offsetY}
                                          onChange={(e) => {
                                            const newOffsetY = parseFloat(e.target.value) || 0
                                            const newValue = formatShadow(boxShadowParsed.offsetX, newOffsetY, boxShadowParsed.blur, boxShadowParsed.spread, boxShadowParsed.color, true)
                                            handleStyleChange('boxShadow', newValue)
                                          }}
                                          className="number-input"
                                        />
                                        <span className="unit-label">px</span>
                                      </div>
                                    </div>
                                    <div className="shadow-control-row">
                                      <label>Blur</label>
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={0}
                                          max={50}
                                          step={1}
                                          value={boxShadowParsed.blur}
                                          onChange={(e) => {
                                            const newBlur = parseFloat(e.target.value)
                                            const newValue = formatShadow(boxShadowParsed.offsetX, boxShadowParsed.offsetY, newBlur, boxShadowParsed.spread, boxShadowParsed.color, true)
                                            handleStyleChange('boxShadow', newValue)
                                          }}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={0}
                                          max={50}
                                          step={1}
                                          value={boxShadowParsed.blur}
                                          onChange={(e) => {
                                            const newBlur = parseFloat(e.target.value) || 0
                                            const newValue = formatShadow(boxShadowParsed.offsetX, boxShadowParsed.offsetY, newBlur, boxShadowParsed.spread, boxShadowParsed.color, true)
                                            handleStyleChange('boxShadow', newValue)
                                          }}
                                          className="number-input"
                                        />
                                        <span className="unit-label">px</span>
                                      </div>
                                    </div>
                                    <div className="shadow-control-row">
                                      <label>Spread</label>
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={-20}
                                          max={20}
                                          step={1}
                                          value={boxShadowParsed.spread}
                                          onChange={(e) => {
                                            const newSpread = parseFloat(e.target.value)
                                            const newValue = formatShadow(boxShadowParsed.offsetX, boxShadowParsed.offsetY, boxShadowParsed.blur, newSpread, boxShadowParsed.color, true)
                                            handleStyleChange('boxShadow', newValue)
                                          }}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={-20}
                                          max={20}
                                          step={1}
                                          value={boxShadowParsed.spread}
                                          onChange={(e) => {
                                            const newSpread = parseFloat(e.target.value) || 0
                                            const newValue = formatShadow(boxShadowParsed.offsetX, boxShadowParsed.offsetY, boxShadowParsed.blur, newSpread, boxShadowParsed.color, true)
                                            handleStyleChange('boxShadow', newValue)
                                          }}
                                          className="number-input"
                                        />
                                        <span className="unit-label">px</span>
                                      </div>
                                    </div>
                                    <div className="shadow-control-row">
                                      <label>Color</label>
                                      <div className="color-input-group">
                                        <input
                                          type="color"
                                          value={boxShadowParsed.colorForPicker || '#000000'}
                                          onChange={(e) => {
                                            const newColor = e.target.value
                                            const newValue = formatShadow(boxShadowParsed.offsetX, boxShadowParsed.offsetY, boxShadowParsed.blur, boxShadowParsed.spread, newColor, true)
                                            handleStyleChange('boxShadow', newValue)
                                          }}
                                          className="color-picker"
                                        />
                                        <input
                                          type="text"
                                          value={boxShadowParsed.color || '#000000'}
                                          onChange={(e) => {
                                            const newColor = e.target.value
                                            const newValue = formatShadow(boxShadowParsed.offsetX, boxShadowParsed.offsetY, boxShadowParsed.blur, boxShadowParsed.spread, newColor, true)
                                            handleStyleChange('boxShadow', newValue)
                                          }}
                                          placeholder="Enter color..."
                                          className="color-text-input"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Text Shadow */}
                                <div className="shadow-item">
                                  <label className="shadow-label">Text Shadow</label>
                                  <div className="shadow-controls">
                                    <div className="shadow-control-row">
                                      <label>Offset X</label>
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={-50}
                                          max={50}
                                          step={1}
                                          value={textShadowParsed.offsetX}
                                          onChange={(e) => {
                                            const newOffsetX = parseFloat(e.target.value)
                                            const newValue = formatShadow(newOffsetX, textShadowParsed.offsetY, textShadowParsed.blur, 0, textShadowParsed.color, false)
                                            handleStyleChange('textShadow', newValue)
                                          }}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={-50}
                                          max={50}
                                          step={1}
                                          value={textShadowParsed.offsetX}
                                          onChange={(e) => {
                                            const newOffsetX = parseFloat(e.target.value) || 0
                                            const newValue = formatShadow(newOffsetX, textShadowParsed.offsetY, textShadowParsed.blur, 0, textShadowParsed.color, false)
                                            handleStyleChange('textShadow', newValue)
                                          }}
                                          className="number-input"
                                        />
                                        <span className="unit-label">px</span>
                                      </div>
                                    </div>
                                    <div className="shadow-control-row">
                                      <label>Offset Y</label>
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={-50}
                                          max={50}
                                          step={1}
                                          value={textShadowParsed.offsetY}
                                          onChange={(e) => {
                                            const newOffsetY = parseFloat(e.target.value)
                                            const newValue = formatShadow(textShadowParsed.offsetX, newOffsetY, textShadowParsed.blur, 0, textShadowParsed.color, false)
                                            handleStyleChange('textShadow', newValue)
                                          }}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={-50}
                                          max={50}
                                          step={1}
                                          value={textShadowParsed.offsetY}
                                          onChange={(e) => {
                                            const newOffsetY = parseFloat(e.target.value) || 0
                                            const newValue = formatShadow(textShadowParsed.offsetX, newOffsetY, textShadowParsed.blur, 0, textShadowParsed.color, false)
                                            handleStyleChange('textShadow', newValue)
                                          }}
                                          className="number-input"
                                        />
                                        <span className="unit-label">px</span>
                                      </div>
                                    </div>
                                    <div className="shadow-control-row">
                                      <label>Blur</label>
                                      <div className="numeric-input-group">
                                        <input
                                          type="range"
                                          min={0}
                                          max={50}
                                          step={1}
                                          value={textShadowParsed.blur}
                                          onChange={(e) => {
                                            const newBlur = parseFloat(e.target.value)
                                            const newValue = formatShadow(textShadowParsed.offsetX, textShadowParsed.offsetY, newBlur, 0, textShadowParsed.color, false)
                                            handleStyleChange('textShadow', newValue)
                                          }}
                                          className="range-input"
                                        />
                                        <input
                                          type="number"
                                          min={0}
                                          max={50}
                                          step={1}
                                          value={textShadowParsed.blur}
                                          onChange={(e) => {
                                            const newBlur = parseFloat(e.target.value) || 0
                                            const newValue = formatShadow(textShadowParsed.offsetX, textShadowParsed.offsetY, newBlur, 0, textShadowParsed.color, false)
                                            handleStyleChange('textShadow', newValue)
                                          }}
                                          className="number-input"
                                        />
                                        <span className="unit-label">px</span>
                                      </div>
                                    </div>
                                    <div className="shadow-control-row">
                                      <label>Color</label>
                                      <div className="color-input-group">
                                        <input
                                          type="color"
                                          value={textShadowParsed.colorForPicker || '#000000'}
                                          onChange={(e) => {
                                            const newColor = e.target.value
                                            const newValue = formatShadow(textShadowParsed.offsetX, textShadowParsed.offsetY, textShadowParsed.blur, 0, newColor, false)
                                            handleStyleChange('textShadow', newValue)
                                          }}
                                          className="color-picker"
                                        />
                                        <input
                                          type="text"
                                          value={textShadowParsed.color || '#000000'}
                                          onChange={(e) => {
                                            const newColor = e.target.value
                                            const newValue = formatShadow(textShadowParsed.offsetX, textShadowParsed.offsetY, textShadowParsed.blur, 0, newColor, false)
                                            handleStyleChange('textShadow', newValue)
                                          }}
                                          placeholder="Enter color..."
                                          className="color-text-input"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        }
                        
                        // Skip individual shadow properties - they're handled in the group above
                        if (isShadow) {
                          return null
                        }
                        
                        // Get numeric value or initialize if needed
                        let numericValue = numericValues[prop]
                        if (isNumeric && !numericValue && currentValue) {
                          numericValue = parseValue(currentValue)
                        } else if (isNumeric && !numericValue) {
                          numericValue = { value: 0, unit: 'px' }
                        }
                      
                        // Helper to convert color value to hex for color picker
                        const getColorValue = (value: string): string => {
                          if (!value) return '#000000'
                          // If already hex, return as is
                          if (value.startsWith('#')) return value
                          // Try to convert common color names (basic conversion)
                          const colorMap: { [key: string]: string } = {
                            'white': '#ffffff',
                            'black': '#000000',
                            'red': '#ff0000',
                            'green': '#008000',
                            'blue': '#0000ff',
                            'yellow': '#ffff00',
                            'cyan': '#00ffff',
                            'magenta': '#ff00ff',
                            'transparent': '#000000'
                          }
                          const lowerValue = value.toLowerCase().trim()
                          return colorMap[lowerValue] || value
                        }
                      
                      if (isNumeric) {
                        // Use the numeric value from state or parsed value
                        const config = getNumericPropertyConfig(prop)
                        const value = numericValue?.value || 0
                        const unit = numericValue?.unit || 'px'
                        const displayLabel = prop.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
                        
                        return (
                          <div key={prop} className={`property-group numeric-property ${isSet ? 'property-set' : 'property-unset'}`}>
                            <div className="property-label-row">
                              <label>{displayLabel}</label>
                              {isSet && (
                                <button
                                  className="remove-property-btn"
                                  onClick={() => handleStyleChange(prop, '')}
                                  title="Remove property"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                            <div className="numeric-input-group">
                              <input
                                type="range"
                                min={config.min}
                                max={config.max}
                                step={config.step}
                                value={value}
                                onChange={(e) => {
                                  const newValue = parseFloat(e.target.value)
                                  handleNumericStyleChange(prop, newValue, unit)
                                }}
                                className="range-input"
                              />
                              <input
                                type="number"
                                min={config.min}
                                max={config.max}
                                step={config.step}
                                value={value}
                                onChange={(e) => {
                                  const newValue = parseFloat(e.target.value) || 0
                                  handleNumericStyleChange(prop, newValue, unit)
                                }}
                                className="number-input"
                              />
                              <select
                                value={unit}
                                onChange={(e) => {
                                  const newUnit = e.target.value
                                  handleNumericStyleChange(prop, value, newUnit)
                                }}
                                className="unit-select"
                              >
                                <option value="px">px</option>
                                <option value="em">em</option>
                                <option value="%">%</option>
                                <option value="dvh">dvh</option>
                                <option value="dvw">dvw</option>
                              </select>
                            </div>
                          </div>
                        )
                      }
                      
                      if (isColor) {
                        const displayLabel = prop.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
                        const colorValue = getColorValue(currentValue)
                        
                        // Special handling for backgroundColor with gradient support
                        if (prop === 'backgroundColor') {
                          // Always check the actual component value first (source of truth)
                          // Then check localProps (for live edits)
                          // This ensures saved gradients are detected even if localProps isn't updated yet
                          const componentBgValue = selectedComponent?.props?.style?.[prop] || selectedComponent?.props?.style?.background || ''
                          const localBgValue = currentValue || ''
                          // Prioritize localBgValue (current input) over componentBgValue (saved value)
                          // This ensures the dropdown updates immediately when user types a gradient
                          const bgValue = localBgValue || componentBgValue
                          const isGradient = typeof bgValue === 'string' && bgValue.includes('linear-gradient')
                          
                          // Always use the actual gradient value to determine type, not just state
                          // This ensures the dropdown shows correctly even if state hasn't synced yet
                          // If we detect a gradient in the current value, always show gradient type
                          const currentBgType = isGradient ? 'gradient' : (backgroundType || 'solid')
                          
                          const updateGradient = (direction: string, colors: Array<{color: string, stop: string}>) => {
                            // Mark that we're editing a gradient to prevent useEffect from interfering
                            isEditingGradientRef.current = true
                            const colorStops = colors.map(c => `${c.color} ${c.stop}`).join(', ')
                            const gradientValue = `linear-gradient(${direction}, ${colorStops})`
                            handleStyleChange('backgroundColor', gradientValue)
                            handleStyleChange('background', gradientValue)
                            // Reset the flag after a delay to allow useEffect to run for other changes
                            // Use a longer delay to ensure all useEffect runs complete
                            setTimeout(() => {
                              isEditingGradientRef.current = false
                            }, 300)
                          }
                          
                          return (
                            <div key={prop} className={`property-group color-property ${isSet ? 'property-set' : 'property-unset'}`}>
                              <div className="property-label-row">
                                <label>{displayLabel}</label>
                                {isSet && (
                                  <button
                                    className="remove-property-btn"
                                    onClick={() => {
                                      handleStyleChange(prop, '')
                                      handleStyleChange('background', '')
                                      setBackgroundType('solid')
                                    }}
                                    title="Remove property"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontSize: '0.7rem', color: '#666' }}>Type:</span>
                                <select
                                  value={currentBgType}
                                  onChange={(e) => {
                                    const newType = e.target.value as 'solid' | 'gradient'
                                    setBackgroundType(newType)
                                    if (newType === 'solid') {
                                      handleStyleChange('backgroundColor', '#ffffff')
                                      handleStyleChange('background', '')
                                    } else {
                                      updateGradient(gradientDirection, gradientColors)
                                    }
                                  }}
                                  style={{
                                    padding: '0.2rem 0.4rem',
                                    fontSize: '0.7rem',
                                    border: '1px solid #ddd',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <option value="solid">Solid Color</option>
                                  <option value="gradient">Linear Gradient</option>
                                </select>
                              </div>
                              
                              {currentBgType === 'solid' ? (
                                <div className="color-input-group">
                                  <input
                                    type="color"
                                    value={colorValue}
                                    onChange={(e) => handleStyleChange(prop, e.target.value)}
                                    className="color-picker"
                                  />
                                  <input
                                    type="text"
                                    value={currentValue}
                                    onChange={(e) => {
                                      const newValue = e.target.value
                                      handleStyleChange(prop, newValue)
                                      // If user types a gradient, automatically switch to gradient type
                                      if (typeof newValue === 'string' && newValue.includes('linear-gradient')) {
                                        setBackgroundType('gradient')
                                        // Parse and set gradient values if possible
                                        const match = newValue.match(/linear-gradient\s*\(\s*([^)]+)\s*\)/i)
                                        if (match) {
                                          const gradientContent = match[1].trim()
                                          const parts: string[] = []
                                          let currentPart = ''
                                          let parenDepth = 0
                                          
                                          for (let i = 0; i < gradientContent.length; i++) {
                                            const char = gradientContent[i]
                                            if (char === '(') parenDepth++
                                            if (char === ')') parenDepth--
                                            
                                            if (char === ',' && parenDepth === 0) {
                                              if (currentPart.trim()) {
                                                parts.push(currentPart.trim())
                                                currentPart = ''
                                              }
                                            } else {
                                              currentPart += char
                                            }
                                          }
                                          if (currentPart.trim()) {
                                            parts.push(currentPart.trim())
                                          }
                                          
                                          const direction = parts[0] && (parts[0].includes('deg') || parts[0].includes('to ')) 
                                            ? parts[0] 
                                            : '180deg'
                                          const colorParts = parts.length > 1 ? parts.slice(1) : parts
                                          
                                          const colors = colorParts.map((c: string) => {
                                            const trimmed = c.trim()
                                            const stopMatch = trimmed.match(/(.+?)\s+(\d+%?)$/)
                                            if (stopMatch) {
                                              return {
                                                color: stopMatch[1].trim(),
                                                stop: stopMatch[2].trim()
                                              }
                                            }
                                            return { color: trimmed, stop: '' }
                                          })
                                          
                                          if (colors.length > 0) {
                                            setGradientDirection(direction)
                                            setGradientColors(colors)
                                          }
                                        }
                                      }
                                    }}
                                    placeholder="Enter color (hex, rgb, name)..."
                                    className="color-text-input"
                                  />
                                </div>
                              ) : (
                                <div className="gradient-editor">
                                  <div style={{ marginBottom: '0.5rem' }}>
                                    <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: '0.3rem' }}>Direction</label>
                                    <select
                                      value={gradientDirection}
                                      onChange={(e) => {
                                        const newDirection = e.target.value
                                        setGradientDirection(newDirection)
                                        updateGradient(newDirection, gradientColors)
                                      }}
                                      style={{
                                        width: '100%',
                                        padding: '0.3rem',
                                        fontSize: '0.75rem',
                                        border: '1px solid #ddd',
                                        borderRadius: '4px'
                                      }}
                                    >
                                      <option value="0deg">To Top</option>
                                      <option value="45deg">To Top Right</option>
                                      <option value="90deg">To Right</option>
                                      <option value="135deg">To Bottom Right</option>
                                      <option value="180deg">To Bottom</option>
                                      <option value="225deg">To Bottom Left</option>
                                      <option value="270deg">To Left</option>
                                      <option value="315deg">To Top Left</option>
                                    </select>
                                  </div>
                                  
                                  <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                      <label style={{ fontSize: '0.7rem' }}>Color Stops</label>
                                      <button
                                        onClick={() => {
                                          const newColors = [...gradientColors, { color: '#ffffff', stop: `${gradientColors.length * 50}%` }]
                                          setGradientColors(newColors)
                                          updateGradient(gradientDirection, newColors)
                                        }}
                                        style={{
                                          padding: '0.2rem 0.5rem',
                                          fontSize: '0.7rem',
                                          backgroundColor: '#667eea',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: '4px',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        + Add Color
                                      </button>
                                    </div>
                                    
                                    {gradientColors.map((colorStop, index) => (
                                      <div key={index} style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                                        <input
                                          type="color"
                                          value={colorStop.color}
                                          onChange={(e) => {
                                            const newColors = [...gradientColors]
                                            newColors[index].color = e.target.value
                                            setGradientColors(newColors)
                                            updateGradient(gradientDirection, newColors)
                                          }}
                                          className="color-picker"
                                          style={{ width: '50px', height: '30px' }}
                                        />
                                        <input
                                          type="text"
                                          value={colorStop.color}
                                          onChange={(e) => {
                                            const newColors = [...gradientColors]
                                            newColors[index].color = e.target.value
                                            setGradientColors(newColors)
                                            updateGradient(gradientDirection, newColors)
                                          }}
                                          placeholder="#ffffff"
                                          style={{
                                            flex: 1,
                                            padding: '0.3rem',
                                            fontSize: '0.75rem',
                                            border: '1px solid #ddd',
                                            borderRadius: '4px'
                                          }}
                                        />
                                        <input
                                          type="text"
                                          value={colorStop.stop}
                                          onChange={(e) => {
                                            const newColors = [...gradientColors]
                                            newColors[index].stop = e.target.value
                                            setGradientColors(newColors)
                                            updateGradient(gradientDirection, newColors)
                                          }}
                                          placeholder="0%"
                                          style={{
                                            width: '60px',
                                            padding: '0.3rem',
                                            fontSize: '0.75rem',
                                            border: '1px solid #ddd',
                                            borderRadius: '4px',
                                            textAlign: 'center'
                                          }}
                                        />
                                        {gradientColors.length > 2 && (
                                          <button
                                            onClick={() => {
                                              const newColors = gradientColors.filter((_, i) => i !== index)
                                              setGradientColors(newColors)
                                              updateGradient(gradientDirection, newColors)
                                            }}
                                            style={{
                                              padding: '0.2rem 0.4rem',
                                              fontSize: '0.7rem',
                                              backgroundColor: '#e74c3c',
                                              color: 'white',
                                              border: 'none',
                                              borderRadius: '4px',
                                              cursor: 'pointer'
                                            }}
                                          >
                                            ×
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        }
                        
                        // Regular color property (not backgroundColor)
                        return (
                          <div key={prop} className={`property-group color-property ${isSet ? 'property-set' : 'property-unset'}`}>
                            <div className="property-label-row">
                              <label>{displayLabel}</label>
                              {isSet && (
                                <button
                                  className="remove-property-btn"
                                  onClick={() => handleStyleChange(prop, '')}
                                  title="Remove property"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                            <div className="color-input-group">
                              <input
                                type="color"
                                value={colorValue}
                                onChange={(e) => handleStyleChange(prop, e.target.value)}
                                className="color-picker"
                              />
                              <input
                                type="text"
                                value={currentValue}
                                onChange={(e) => handleStyleChange(prop, e.target.value)}
                                placeholder="Enter color (hex, rgb, name)..."
                                className="color-text-input"
                              />
                            </div>
                            {hasRelatedProps && (
                              <div className="shorthand-properties-box">
                                <button 
                                  className="shorthand-toggle-btn"
                                  onClick={toggleExpand}
                                  type="button"
                                >
                                  <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
                                  <span className="toggle-label">
                                    {relatedProps.length} related {relatedProps.length === 1 ? 'property' : 'properties'}
                                  </span>
                                </button>
                                {isExpanded && (
                                  <div className="related-properties-grid">
                                    {relatedProps.map((relatedProp) => {
                                      const relatedValue = localProps.style?.[relatedProp] || ''
                                      const relatedIsNumeric = isNumericProperty(relatedProp)
                                      const relatedIsColor = isColorProperty(relatedProp)
                                      
                                      if (relatedIsNumeric) {
                                        let relatedNumericValue = numericValues[relatedProp]
                                        if (!relatedNumericValue && relatedValue) {
                                          relatedNumericValue = parseValue(relatedValue)
                                        } else if (!relatedNumericValue) {
                                          relatedNumericValue = { value: 0, unit: 'px' }
                                        }
                                        const config = getNumericPropertyConfig(relatedProp)
                                        const value = relatedNumericValue?.value || 0
                                        const unit = relatedNumericValue?.unit || 'px'
                                        const displayLabel = relatedProp.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
                                        
                                        return (
                                          <div key={relatedProp} className="related-property-compact">
                                            <label>{displayLabel}</label>
                                            <div className="numeric-input-group">
                                              <input
                                                type="range"
                                                min={config.min}
                                                max={config.max}
                                                step={config.step}
                                                value={value}
                                                onChange={(e) => {
                                                  const newValue = parseFloat(e.target.value)
                                                  handleNumericStyleChange(relatedProp, newValue, unit)
                                                }}
                                                className="range-input"
                                              />
                                              <input
                                                type="number"
                                                min={config.min}
                                                max={config.max}
                                                step={config.step}
                                                value={value}
                                                onChange={(e) => {
                                                  const newValue = parseFloat(e.target.value) || 0
                                                  handleNumericStyleChange(relatedProp, newValue, unit)
                                                }}
                                                className="number-input"
                                              />
                                              <select
                                                value={unit}
                                                onChange={(e) => {
                                                  handleNumericStyleChange(relatedProp, value, e.target.value)
                                                }}
                                                className="unit-select"
                                              >
                                                <option value="px">px</option>
                                                <option value="em">em</option>
                                                <option value="%">%</option>
                                                <option value="dvh">dvh</option>
                                                <option value="dvw">dvw</option>
                                              </select>
                                            </div>
                                          </div>
                                        )
                                      }
                                      
                                      if (relatedIsColor) {
                                        const relatedColorValue = getColorValue(relatedValue)
                                        const displayLabel = relatedProp.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
                                        
                                        return (
                                          <div key={relatedProp} className="related-property-compact">
                                            <label>{displayLabel}</label>
                                            <div className="color-input-group">
                                              <input
                                                type="color"
                                                value={relatedColorValue}
                                                onChange={(e) => handleStyleChange(relatedProp, e.target.value)}
                                                className="color-picker"
                                              />
                                              <input
                                                type="text"
                                                value={relatedValue}
                                                onChange={(e) => handleStyleChange(relatedProp, e.target.value)}
                                                placeholder="Enter color..."
                                                className="color-text-input"
                                              />
                                            </div>
                                          </div>
                                        )
                                      }
                                      
                                      const displayLabel = relatedProp.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
                                      const relatedPropertyOptions = getPropertyOptions(relatedProp)
                                      const relatedUseSelect = shouldUseSelect(relatedProp)
                                      
                                      if (relatedUseSelect && relatedPropertyOptions) {
                                        return (
                                          <div key={relatedProp} className="related-property-compact">
                                            <label>{displayLabel}</label>
                                            <select
                                              value={relatedValue}
                                              onChange={(e) => handleStyleChange(relatedProp, e.target.value)}
                                              className="style-select"
                                            >
                                              <option value="">-- Select --</option>
                                              {relatedPropertyOptions.map(option => (
                                                <option key={option} value={option}>{option}</option>
                                              ))}
                                            </select>
                                          </div>
                                        )
                                      }
                                      
                                      return (
                                        <div key={relatedProp} className="related-property-compact">
                                          <label>{displayLabel}</label>
                                          <input
                                            type="text"
                                            value={relatedValue}
                                            onChange={(e) => handleStyleChange(relatedProp, e.target.value)}
                                            placeholder="Enter value..."
                                            className="text-input-compact"
                                          />
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      }
                      
                      
                      // Check if property should use select box (e.g., position, display, etc.)
                      const propertyOptions = getPropertyOptions(prop)
                      const useSelect = shouldUseSelect(prop)
                      
                      if (useSelect && propertyOptions) {
                        const displayLabel = prop.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
                        
                        return (
                          <div key={prop} className={`property-group select-property ${isSet ? 'property-set' : 'property-unset'}`}>
                            <div className="property-label-row">
                              <label>{displayLabel}</label>
                              {isSet && (
                                <button
                                  className="remove-property-btn"
                                  onClick={() => handleStyleChange(prop, '')}
                                  title="Remove property"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                            <select
                              value={currentValue}
                              onChange={(e) => handleStyleChange(prop, e.target.value)}
                              className="style-select"
                            >
                              <option value="">-- Select --</option>
                              {propertyOptions.map(option => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>
                        )
                      }
                      
                      
                    })
                    })()}
                  </div>
                </div>
              ) : (
                <div className="no-properties-message">
                  {showSearchResults ? (
                    <p>No properties found matching "{styleSearchQuery}"</p>
                  ) : (
                    <p>No CSS properties set. Use the search box above to add properties.</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default PropertiesPanel
