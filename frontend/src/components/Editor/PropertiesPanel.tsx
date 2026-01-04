import { useState, useEffect, useMemo, useRef } from 'react'
import { useDrag, useDrop } from 'react-dnd'
import { ComponentNode } from '../../types/editor'
import { FiTrash2 } from 'react-icons/fi'
import { useConfirmation } from '../ConfirmationModal'
import { aiAssistantAPI } from '../../api/aiAssistant'
import { useToast } from '../Toast'
import './PropertiesPanel.css'

interface PropertiesPanelProps {
  selectedComponent: ComponentNode | null
  allComponents: ComponentNode[]
  onUpdate: (id: string, updates: Partial<ComponentNode>) => void
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
  onAddComponent?: (component: ComponentNode) => void
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
  onUpdate
}: { 
  components: ComponentNode[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<ComponentNode>) => void
}) => {
  const { confirm } = useConfirmation()
  const selectedNodeRef = useRef<HTMLDivElement | null>(null)
  const treeContainerRef = useRef<HTMLDivElement | null>(null)

  // Scroll selected node into view when selectedId changes
  useEffect(() => {
    if (selectedId && selectedNodeRef.current && treeContainerRef.current) {
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
  }, [selectedId])

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

  // Tree node component with drag and drop
  const TreeNode = ({ component, level }: { component: ComponentNode; level: number; parentId?: string | undefined }) => {
    const hasChildren = components.some(c => c.parentId === component.id)
    const isSelected = selectedId === component.id
    
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

    // Make this node accept drops
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

    // Combine drag and drop refs
    const dragDropRef = (node: HTMLDivElement | null) => {
      drag(node)
      drop(node)
    }

    return (
      <li key={component.id} className="tree-item">
        <div
          ref={isSelected ? selectedNodeRef : null}
          className={`tree-node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isOver ? 'drag-over' : ''}`}
          onClick={() => onSelect(component.id)}
          style={{ paddingLeft: `${level * 0.5}rem` }}
        >
          <div ref={dragDropRef} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, cursor: 'move' }}>
            <span className="tree-icon">{hasChildren ? '📁' : '📄'}</span>
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
        {hasChildren && renderTree(component.id, level + 1)}
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
        {children.map(component => (
          <TreeNode 
            key={component.id}
            component={component}
            level={level}
            parentId={parentId}
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

const PropertiesPanel = ({ selectedComponent, allComponents, onUpdate, onSelect, onDelete, onAddComponent }: PropertiesPanelProps) => {
  const { confirm } = useConfirmation()
  const [localProps, setLocalProps] = useState<any>({})
  const [activeTab, setActiveTab] = useState<'tree' | 'style' | 'ai'>('style')
  const [numericValues, setNumericValues] = useState<{ [key: string]: { value: number; unit: string } }>({})
  const [styleSearchQuery, setStyleSearchQuery] = useState('')
  const [expandedShorthand, setExpandedShorthand] = useState<{ [key: string]: boolean }>({})
  const [selectedAction, setSelectedAction] = useState<string>('')
  const [aiPrompt, setAiPrompt] = useState<string>('')
  const [aiProcessing, setAiProcessing] = useState<boolean>(false)
  const [aiMessages, setAiMessages] = useState<Array<{ type: 'user' | 'assistant'; content: string; timestamp: Date; applied?: boolean }>>([])
  const { showToast } = useToast()
  
  // Auto-scroll to bottom when new messages arrive (must be before any conditional returns)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
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
  
  // Filter properties based on search query
  const getFilteredProperties = () => {
    const setProps = getSetProperties()
    
    if (!styleSearchQuery.trim()) {
      // Show only set properties when no search
      return setProps
    }
    
    // When searching, show matching properties from all CSS properties
    const query = styleSearchQuery.toLowerCase().trim()
    const matchingProps = allCSSProperties.filter(prop => 
      prop.toLowerCase().includes(query)
    )
    
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
    
    // Combine set properties, matching properties, and related properties
    const combined = [...new Set([...setProps, ...matchingProps, ...Array.from(relatedPropsSet)])]
    
    // Filter to show all matching properties and related properties as separate items
    let filtered = combined.filter(prop => {
      const propLower = prop.toLowerCase()
      
      // For border searches, show ALL border-related properties separately
      if (query.includes('border')) {
        if (propLower.includes('border')) {
          return true
        }
      }
      
      // Show if it matches the query directly
      if (propLower.includes(query)) {
        return true
      }
      
      // Show if it's a related property of a matching shorthand (list separately)
      for (const shorthand of matchingShorthands) {
        const related = getRelatedProperties(shorthand)
        if (related.includes(prop)) {
          return true
        }
      }
      
      // Show if it's in the related props set (for border/radius searches)
      if (relatedPropsSet.has(prop)) {
        return true
      }
      
      return false
    })
    
    // Remove duplicates but keep all properties as separate items
    const uniqueFiltered = [...new Set(filtered)]
    
    // Sort to show main properties first, then related properties
    const sorted = uniqueFiltered.sort((a, b) => {
      const aIsShorthand = isShorthandProperty(a)
      const bIsShorthand = isShorthandProperty(b)
      
      // Shorthand properties come first
      if (aIsShorthand && !bIsShorthand) return -1
      if (!aIsShorthand && bIsShorthand) return 1
      
      // Then alphabetical
      return a.localeCompare(b)
    })
    
    return sorted
  }
  
  const setProperties = useMemo(() => getSetProperties(), [localProps.style])
  const filteredProperties = useMemo(() => getFilteredProperties(), [styleSearchQuery, setProperties])
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
      
      // Initialize numeric values from style for all numeric properties
      const style = props.style || {}
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
    }
    
    // Reset selected action when component changes
    setSelectedAction('')
  }, [selectedComponent?.id, selectedComponent?.props?.style]) // Also run when style changes

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
            className={`tab-button ${activeTab === 'style' ? 'active' : ''}`}
            onClick={() => setActiveTab('style')}
          >
            Style
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
  
  // Helper function to process a prompt (can be called with any prompt string)
  const processPrompt = async (promptText: string) => {
    if (!selectedComponent) return
    
    try {
      // Call backend LLM API
      const response = await aiAssistantAPI.processPrompt({
        prompt: promptText,
        component_type: selectedComponent.type,
        current_styles: localProps.style || {},
        current_props: localProps || {}
      })
      
      const changes = response.changes
      
      // Handle clarification flow - if system needs confirmation
      if (response.needs_clarification && response.guess) {
        setAiProcessing(false)
        
        // Show confirmation dialog - wrap in promise
        const confirmed = await new Promise<boolean>((resolve) => {
          let resolved = false
          confirm({
            title: 'Did you mean this?',
            message: response.message || `Did you mean: "${response.guess}"?`,
            confirmText: 'Yes, that\'s correct',
            cancelText: 'No, try again',
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
            content: `Processing: "${response.guess}"`,
            timestamp: new Date(),
            applied: false
          }])
          
          // Process the confirmed guess
          await processPrompt(response.guess)
          return
        } else {
          // User rejected - show message asking for rephrasing
          setAiMessages(prev => [...prev, {
            type: 'assistant',
            content: response.message + '\n\nPlease try rephrasing your request or be more specific.',
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
      
      // Apply changes to the component
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
      
      // Set props if there are any changes
      // Filter out unwanted default "New Text" children
      if (changes.props && changes.props.children) {
        const childrenValue = changes.props.children
        // Remove default "New Text" if it wasn't explicitly requested
        if (typeof childrenValue === 'string' && childrenValue.trim().toLowerCase() === 'new text') {
          delete changes.props.children
        }
      }
      
      if (changes.style || changes.props) {
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
      
      // Add assistant success message from backend
      setAiMessages(prev => [...prev, {
        type: 'assistant',
        content: response.message,
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
    const newProps = { ...localProps, [key]: value }
    setLocalProps(newProps)
    if (selectedComponent) {
      onUpdate(selectedComponent.id, { props: newProps })
    }
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
        <div className="property-group">
          <label>Background Color</label>
          <input
            type="color"
            value={localProps.style?.backgroundColor || '#ffffff'}
            onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
          />
        </div>
        <div className="property-group">
          <label>Text Color</label>
          <input
            type="color"
            value={localProps.style?.color || '#000000'}
            onChange={(e) => handleStyleChange('color', e.target.value)}
          />
        </div>
        <div className="property-group">
          <label>Border Color</label>
          <input
            type="color"
            value={localProps.style?.borderColor || '#000000'}
            onChange={(e) => handleStyleChange('borderColor', e.target.value)}
          />
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
          className={`tab-button ${activeTab === 'style' ? 'active' : ''}`}
          onClick={() => setActiveTab('style')}
        >
          Style
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
          />
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
            <div className="property-group">
              <label>Component Type</label>
              <input type="text" value={selectedComponent.type} disabled />
            </div>
            
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
                        : `${setProperties.length} set properties`}
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
