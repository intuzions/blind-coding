import { useState, useEffect, useMemo } from 'react'
import { ComponentNode } from '../../types/editor'
import { FiTrash2 } from 'react-icons/fi'
import './PropertiesPanel.css'

interface PropertiesPanelProps {
  selectedComponent: ComponentNode | null
  allComponents: ComponentNode[]
  onUpdate: (id: string, updates: Partial<ComponentNode>) => void
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
}

// Parse value and unit from a string like "100px" or "50%"
const parseValue = (value: string | undefined): { value: number; unit: string } => {
  if (!value || typeof value !== 'string') {
    return { value: 0, unit: 'px' }
  }
  
  const match = value.match(/^(-?\d*\.?\d+)(px|em|%|dvh|dvw|rem|vh|vw)?$/)
  if (match) {
    return {
      value: parseFloat(match[1]) || 0,
      unit: match[2] || 'px'
    }
  }
  
  return { value: 0, unit: 'px' }
}

// Format value with unit
const formatValue = (value: number, unit: string): string => {
  if (value === 0 && unit === 'px') return '0'
  return `${value}${unit}`
}

const ComponentTree = ({ 
  components, 
  selectedId, 
  onSelect,
  onDelete
}: { 
  components: ComponentNode[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
}) => {
  const handleDelete = (e: React.MouseEvent, componentId: string) => {
    e.stopPropagation()
    if (window.confirm('Delete this component and all its children?')) {
      onDelete(componentId)
    }
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
        {children.map(component => {
          const hasChildren = components.some(c => c.parentId === component.id)
          return (
            <li key={component.id} className="tree-item">
              <div
                className={`tree-node ${selectedId === component.id ? 'selected' : ''}`}
                onClick={() => onSelect(component.id)}
                style={{ paddingLeft: `${level * 0.5}rem` }}
              >
                <span className="tree-icon">{hasChildren ? '📁' : '📄'}</span>
                <span className="tree-label">
                  <strong>{component.type}</strong>
                  {component.id.substring(0, 8)}
                </span>
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
        })}
      </ul>
    )
  }

  return (
    <div className="component-tree">
      <h4>Component Hierarchy</h4>
      <div className="tree-container">
        {renderTree()}
      </div>
    </div>
  )
}

const PropertiesPanel = ({ selectedComponent, allComponents, onUpdate, onSelect, onDelete }: PropertiesPanelProps) => {
  const [localProps, setLocalProps] = useState<any>({})
  const [activeTab, setActiveTab] = useState<'tree' | 'style'>('style')
  const [numericValues, setNumericValues] = useState<{ [key: string]: { value: number; unit: string } }>({})
  const [styleSearchQuery, setStyleSearchQuery] = useState('')
  const [expandedShorthand, setExpandedShorthand] = useState<{ [key: string]: boolean }>({})
  
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
    
    // Box Model
    'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'boxSizing', 'border', 'borderWidth', 'borderStyle', 'borderColor',
    'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
    'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
    'borderBottomLeftRadius', 'borderBottomRightRadius',
    
    // Flexbox
    'flex', 'flexDirection', 'flexWrap', 'flexFlow', 'justifyContent',
    'alignItems', 'alignContent', 'alignSelf', 'order', 'flexGrow',
    'flexShrink', 'flexBasis', 'gap', 'rowGap', 'columnGap',
    
    // Grid
    'grid', 'gridTemplateColumns', 'gridTemplateRows', 'gridTemplateAreas',
    'gridColumn', 'gridRow', 'gridArea', 'gridAutoColumns', 'gridAutoRows',
    'gridAutoFlow', 'gridGap', 'gridColumnGap', 'gridRowGap',
    
    // Typography
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'lineHeight', 'letterSpacing', 'wordSpacing', 'textAlign', 'textDecoration',
    'textTransform', 'textIndent', 'textShadow', 'whiteSpace', 'wordWrap',
    'wordBreak', 'textOverflow', 'verticalAlign',
    
    // Colors & Background
    'color', 'backgroundColor', 'background', 'backgroundImage',
    'backgroundPosition', 'backgroundSize', 'backgroundRepeat',
    'backgroundAttachment', 'backgroundClip', 'opacity',
    
    // Border & Outline
    'outline', 'outlineWidth', 'outlineStyle', 'outlineColor',
    'outlineOffset', 'boxShadow',
    
    // Effects
    'opacity', 'visibility', 'cursor', 'pointerEvents', 'userSelect',
    'transform', 'transformOrigin', 'transition', 'transitionProperty',
    'transitionDuration', 'transitionTimingFunction', 'transitionDelay',
    'animation', 'animationName', 'animationDuration', 'animationTimingFunction',
    'animationDelay', 'animationIterationCount', 'animationDirection',
    'animationFillMode', 'animationPlayState',
    
    // Filter & Effects
    'filter', 'backdropFilter', 'mixBlendMode', 'isolation',
    
    // Other
    'listStyle', 'listStyleType', 'listStylePosition', 'listStyleImage',
    'tableLayout', 'borderCollapse', 'borderSpacing', 'captionSide',
    'emptyCells', 'quotes', 'content', 'counterReset', 'counterIncrement',
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
      float: ['none', 'left', 'right'],
      
      // Clear
      clear: ['none', 'left', 'right', 'both'],
      
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
      'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
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
          newNumericValues[key] = parseValue(style[key])
        }
      })
      
      setNumericValues(prev => {
        // Only initialize values that don't exist in prev
        // This prevents overwriting user changes when unit is changed
        const merged = { ...prev }
        Object.keys(newNumericValues).forEach(key => {
          if (!prev[key]) {
            merged[key] = newNumericValues[key]
          }
        })
        return merged
      })
    } else {
      // Clear numeric values when no component is selected
      setNumericValues({})
    }
  }, [selectedComponent?.id]) // Only run when component ID changes, not when style changes

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
            />
          ) : (
            <div className="properties-empty">
              <p>Select a component to edit its properties</p>
            </div>
          )}
        </div>
      </div>
    )
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
      newStyle = { ...currentStyle, [styleKey]: value }
    }
    
    handleChange('style', newStyle)
  }

  const handleNumericStyleChange = (styleKey: string, value: number, unit: string) => {
    const formattedValue = formatValue(value, unit)
    
    // Update numeric values state first to ensure UI updates immediately
    setNumericValues(prev => ({
      ...prev,
      [styleKey]: { value, unit }
    }))
    
    // Then update the style
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
          />
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
                      
                      return null
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
