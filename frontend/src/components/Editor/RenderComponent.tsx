import { useDrop, useDrag } from 'react-dnd'
import { ComponentNode } from '../../types/editor'
import React, { useEffect, useRef, useState } from 'react'
import './RenderComponent.css'

interface RenderComponentProps {
  component: ComponentNode
  allComponents: ComponentNode[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUpdate: (id: string, updates: Partial<ComponentNode>) => void
  onDelete: (id: string) => void
  onAdd: (component: ComponentNode, parentId?: string) => void
}

const RenderComponent = ({
  component,
  allComponents,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  onAdd,
}: RenderComponentProps) => {
  const isSelected = selectedId === component.id
  const children = allComponents.filter((c) => c.parentId === component.id)
  
  // Force re-render when selection changes to ensure highlighting updates
  useEffect(() => {
    // This ensures the component re-renders when selectedId changes
  }, [selectedId, component.id])

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

  // Make this component draggable so it can be moved to other components
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: () => ({
      type: component.type,
      props: component.props,
      componentId: component.id, // Include the component ID to identify existing components
    }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  const [{ isOver }, drop] = useDrop({
    accept: 'component',
    drop: (item: { type: string; props?: any; componentId?: string }, monitor) => {
      // Only handle drop if it's directly on this component (not bubbled from child)
      if (monitor.didDrop()) {
        return
      }
      
      // If this is an existing component being moved (has componentId), reparent it
      if (item.componentId && item.componentId !== component.id) {
        // Don't allow moving a component into itself or its own children
        const isDescendant = (parentId: string, childId: string): boolean => {
          const child = allComponents.find(c => c.id === childId)
          if (!child || !child.parentId) return false
          if (child.parentId === parentId) return true
          return isDescendant(parentId, child.parentId)
        }
        
        if (isDescendant(item.componentId, component.id)) {
          return // Prevent circular parent-child relationships
        }
        
        // Update the component's parentId to move it here
        onUpdate(item.componentId, {
          parentId: component.id,
        })
        return { nested: true }
      }
      
      // Otherwise, create a new component (from component library)
      // Preserve ALL props including data attributes, style, className, etc.
      const newProps: any = { ...(item.props || {}) }
      
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
        parentId: component.id,
      }
      
      // Add the root component first
      onAdd(newComponent, component.id)
      
      // Then create and add child components if they exist
      if (childrenArray && childrenArray.length > 0) {
        const childComponents = createChildComponents(childrenArray, newComponent.id, baseTimestamp)
        childComponents.forEach(child => {
          onAdd(child, newComponent.id)
        })
      }
      
      console.log('Adding component as child:', {
        type: newComponent.type,
        hasChildren: !!childrenArray,
        childrenCount: childrenArray?.length || 0,
        hasChartType: !!newProps['data-chart-type'],
        hasChartData: !!newProps['data-chart-data'],
        className: newProps.className
      })
      
      // Stop propagation to prevent canvas drop handler from also firing
      return { nested: true }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver() && monitor.canDrop(),
    }),
  })

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(component.id)
  }

  const renderElement = () => {
    const { type, props } = component
    const style = props?.style || {}
    // Preserve ALL original styles exactly as they are - don't override
    // Only add position: relative if absolutely necessary for selection highlighting
    const finalStyle = {
      ...style,
      // Only add position: relative if not set AND component is selected (for highlighting)
      // This ensures components maintain their original positioning
      ...(style.position ? {} : (isSelected ? { position: 'relative' } : {})),
    }
    // Extract event handlers from props
    const eventHandlers: { [key: string]: any } = {}
    const eventHandlerKeys = [
      'onClick', 'onChange', 'onBlur', 'onFocus', 'onSubmit', 'onMouseEnter', 'onMouseLeave',
      'onMouseOver', 'onMouseOut', 'onKeyDown', 'onKeyUp', 'onKeyPress', 'onDoubleClick',
      'onContextMenu', 'onDrag', 'onDragStart', 'onDragEnd', 'onDrop', 'onInput', 'onInvalid'
    ]
    
    eventHandlerKeys.forEach(key => {
      if (props?.[key]) {
        // If it's a string (function name or code), create a wrapper
        if (typeof props[key] === 'string') {
          const handlerCode = props[key] as string
          eventHandlers[key] = (e: any) => {
            // For onClick, always handle selection first
            if (key === 'onClick') {
              handleClick(e)
            }
            // Then try to execute the custom handler
            try {
              // Check if it's inline code (arrow function or function expression)
              if (handlerCode.trim().startsWith('(') || handlerCode.trim().startsWith('()') || handlerCode.includes('=>')) {
                // It's inline code, evaluate it
                const func = new Function('event', `return (${handlerCode})`)(e)
                if (typeof func === 'function') {
                  func(e)
                } else {
                  // Try direct evaluation
                  eval(`(${handlerCode})(e)`)
                }
              } else {
                // It's a function name, try to call it from window
                const func = (window as any)[handlerCode]
                if (typeof func === 'function') {
                  func(e)
                } else {
                  console.warn(`Handler function "${handlerCode}" not found. Make sure it's defined in the global scope.`)
                }
              }
            } catch (error) {
              console.error(`Error executing handler for ${key}:`, error)
            }
          }
        } else if (typeof props[key] === 'function') {
          // It's already a function
          eventHandlers[key] = (e: any) => {
            if (key === 'onClick') {
              handleClick(e)
            }
            props[key](e)
          }
        }
      }
    })
    
    // For onClick specifically, always include selection handling if no custom handler
    if (!props?.onClick) {
      eventHandlers.onClick = handleClick
    }

    // Preserve all props including non-style properties
    const elementProps: any = {
      ...props,
      style: finalStyle,
      className: `${props?.className || ''} ${isSelected ? 'selected' : ''}`.trim(),
      ...eventHandlers,
    }
    
    // Remove children from elementProps if it's a string (we'll render it separately)
    // But keep it if it's an array (for nested components)
    if (typeof elementProps.children === 'string') {
      delete elementProps.children
    }

    // Keep children in props for rendering, but don't pass it as a prop to the DOM element
    // We'll render it separately
    const textContent = typeof props?.children === 'string' ? props.children : null
    if (textContent) {
      delete elementProps.children
    }

    // Combine drag and drop refs - attach drop to wrapper, drag to actual element
    const DropWrapper = ({ children: wrapperChildren }: { children: React.ReactNode }) => (
      <div ref={drop} style={{ display: 'contents', position: 'relative' }}>
        {wrapperChildren}
      </div>
    )

    const renderChildren = () => {
      if (children.length > 0) {
        return children.map((child) => (
          <RenderComponent
            key={child.id}
            component={child}
            allComponents={allComponents}
            selectedId={selectedId}
            onSelect={onSelect}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onAdd={onAdd}
          />
        ))
      }
      return null
    }

    const renderWithChildren = (Tag: keyof JSX.IntrinsicElements) => {
      // Get text content from props.children if it's a string
      const textContent = typeof props?.children === 'string' ? props.children : null
      
      return (
        <DropWrapper>
          <Tag {...elementProps} ref={drag as any}>
            {textContent}
            {renderChildren()}
          </Tag>
        </DropWrapper>
      )
    }

    // Self-closing tags
    const selfClosingTags = ['hr', 'br', 'img', 'input', 'checkbox', 'radio']
    if (selfClosingTags.includes(type)) {
      if (type === 'img') {
        return (
          <DropWrapper>
            <img
              {...elementProps}
              src={props?.src || 'https://via.placeholder.com/300x200'}
              alt={props?.alt || 'Image'}
            />
          </DropWrapper>
        )
      }
      if (type === 'input' || type === 'checkbox' || type === 'radio') {
        return (
          <DropWrapper>
            <input {...elementProps} type={type === 'checkbox' ? 'checkbox' : type === 'radio' ? 'radio' : props?.type || 'text'} />
          </DropWrapper>
        )
      }
      if (type === 'hr') {
        return (
          <DropWrapper>
            <hr {...elementProps} />
          </DropWrapper>
        )
      }
      if (type === 'br') {
        return (
          <DropWrapper>
            <br {...elementProps} />
          </DropWrapper>
        )
      }
    }

    // Check if this is an AG Grid table
    const isAGGrid = props?.['data-ag-grid'] === 'true' || props?.['dataAgGrid'] === 'true'
    const agGridConfigStr = props?.['data-ag-grid-config'] || props?.['dataAgGridConfig']
    
    if (isAGGrid) {
      let agGridConfig = null
      try {
        if (agGridConfigStr) {
          agGridConfig = typeof agGridConfigStr === 'string' ? JSON.parse(agGridConfigStr) : agGridConfigStr
        }
      } catch (error) {
        console.error('Error parsing AG Grid config:', error)
      }
      
      return (
        <AGGridComponent
          component={component}
          agGridConfig={agGridConfig}
          elementProps={elementProps}
          DropWrapper={DropWrapper}
          renderChildren={renderChildren}
        />
      )
    }

    // Check if this is a chart container - render Google Chart
    // Check both className and data-chart-type to ensure charts are detected
    const chartType = props?.['data-chart-type'] || props?.['dataChartType']
    const chartDataStr = props?.['data-chart-data'] || props?.['dataChartData']
    
    if (chartType && (props?.className === 'chart-container' || chartDataStr)) {
      let chartData = null
      
      try {
        if (chartDataStr) {
          chartData = typeof chartDataStr === 'string' ? JSON.parse(chartDataStr) : chartDataStr
          console.log('Rendering chart on canvas:', { chartType, chartData, componentId: component.id })
        }
      } catch (error) {
        console.error('Error parsing chart data:', error, chartDataStr)
      }
      
      // Ensure className is set for chart container
      if (!elementProps.className || !elementProps.className.includes('chart-container')) {
        elementProps.className = `chart-container ${elementProps.className || ''}`.trim()
      }
      
      return (
        <ChartComponent
          component={component}
          chartType={chartType}
          chartData={chartData}
          elementProps={elementProps}
          DropWrapper={DropWrapper}
          renderChildren={renderChildren}
        />
      )
    }

    // Standard HTML elements
    switch (type) {
      // Layout & Structure
      case 'div':
      case 'section':
      case 'article':
      case 'aside':
      case 'header':
      case 'footer':
        // Check if this div has text content or children
        const hasTextContent = typeof props?.children === 'string' && props.children.trim().length > 0
        const hasChildren = children.length > 0
        
        return (
          <DropWrapper>
            <div {...elementProps} ref={drag as any}>
              {hasTextContent && textContent}
              {hasChildren && renderChildren()}
              {!hasTextContent && !hasChildren && (
                <div className="component-placeholder">
                  {isOver ? 'Drop here' : 'Empty'}
                </div>
              )}
            </div>
          </DropWrapper>
        )

      case 'main':
        // Render main element properly
        const mainHasTextContent = typeof props?.children === 'string' && props.children.trim().length > 0
        const mainHasChildren = children.length > 0
        
        // Add selection class directly to main element for highlighting
        // Ensure style includes position relative for highlighting to work
        const mainFinalStyle = {
          ...elementProps.style,
          ...(isSelected ? { 
            position: elementProps.style?.position || 'relative',
            zIndex: elementProps.style?.zIndex || '10'
          } : {})
        }
        const mainElementProps = {
          ...elementProps,
          style: mainFinalStyle,
          className: `${elementProps.className || ''} ${isSelected ? 'selected-main-form' : ''}`.trim(),
          'data-component-selected': isSelected ? 'true' : 'false',
          'data-is-selected': isSelected ? 'true' : 'false'
        }
        
        return (
          <DropWrapper>
            <main {...mainElementProps} ref={drag as any}>
              {mainHasTextContent && textContent}
              {mainHasChildren && renderChildren()}
              {!mainHasTextContent && !mainHasChildren && (
                <div className="component-placeholder">
                  {isOver ? 'Drop here' : 'Empty'}
                </div>
              )}
            </main>
          </DropWrapper>
        )

      case 'nav':
        // Render nav element with proper structure
        const navHasTextContent = typeof props?.children === 'string' && props.children.trim().length > 0
        const navHasChildren = children.length > 0
        
        return (
          <DropWrapper>
            <nav {...elementProps}>
              {navHasTextContent && textContent}
              {navHasChildren && renderChildren()}
              {!navHasTextContent && !navHasChildren && (
                <div className="component-placeholder">
                  {isOver ? 'Drop here' : 'Empty'}
                </div>
              )}
            </nav>
          </DropWrapper>
        )

      // Headings
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return renderWithChildren(type as keyof JSX.IntrinsicElements)

      // Text Content
      case 'p':
      case 'span':
      case 'strong':
      case 'em':
      case 'small':
      case 'mark':
      case 'code':
      case 'pre':
      case 'blockquote':
      case 'abbr':
      case 'address':
      case 'time':
        return renderWithChildren(type as keyof JSX.IntrinsicElements)

      // Lists
      case 'ul':
      case 'ol':
      case 'dl':
        return (
          <DropWrapper>
            {type === 'ul' ? (
              <ul {...elementProps}>{renderChildren()}</ul>
            ) : type === 'ol' ? (
              <ol {...elementProps}>{renderChildren()}</ol>
            ) : (
              <dl {...elementProps}>{renderChildren()}</dl>
            )}
          </DropWrapper>
        )

      case 'li':
      case 'dt':
      case 'dd':
        return renderWithChildren(type as keyof JSX.IntrinsicElements)

      // Links & Media
      case 'a':
        return (
          <DropWrapper>
            <a {...elementProps} href={props?.href || '#'}>
              {props?.children || 'Link text'}
              {renderChildren()}
            </a>
          </DropWrapper>
        )

      case 'video':
      case 'audio':
        return (
          <DropWrapper>
            {type === 'video' ? (
              <video {...elementProps} controls={props?.controls !== false}>
                {renderChildren()}
              </video>
            ) : (
              <audio {...elementProps} controls={props?.controls !== false}>
                {renderChildren()}
              </audio>
            )}
          </DropWrapper>
        )

      case 'iframe':
        return (
          <DropWrapper>
            <iframe {...elementProps} src={props?.src || ''} />
          </DropWrapper>
        )

      // Forms
      case 'form':
        // Add selection class directly to form element for highlighting
        const formElementProps = {
          ...elementProps,
          className: `${elementProps.className || ''} ${isSelected ? 'selected-main-form' : ''}`.trim(),
          'data-component-selected': isSelected ? 'true' : 'false',
          action: props?.action || '#',
          method: props?.method || 'post'
        }
        
        return (
          <DropWrapper>
            <form {...formElementProps} ref={drag as any}>
              {renderChildren()}
            </form>
          </DropWrapper>
        )

      case 'textarea':
        return (
          <DropWrapper>
            <textarea {...elementProps} rows={props?.rows || 4}>
              {props?.children || ''}
            </textarea>
          </DropWrapper>
        )

      case 'button':
        const buttonText = typeof props?.children === 'string' ? props.children : 'Button'
        return (
          <DropWrapper>
            <button {...elementProps} ref={drag as any}>
              {buttonText}
              {renderChildren()}
            </button>
          </DropWrapper>
        )

      case 'select':
        return (
          <DropWrapper>
            <select {...elementProps}>
              {renderChildren()}
            </select>
          </DropWrapper>
        )

      case 'option':
        return (
          <DropWrapper>
            <option {...elementProps}>
              {props?.children || 'Option'}
            </option>
          </DropWrapper>
        )

      case 'label':
      case 'legend':
        return renderWithChildren(type as keyof JSX.IntrinsicElements)

      case 'fieldset':
        return (
          <DropWrapper>
            <fieldset {...elementProps}>
              {renderChildren()}
            </fieldset>
          </DropWrapper>
        )

      // Tables
      case 'table':
      case 'thead':
      case 'tbody':
      case 'tfoot':
      case 'tr':
        return (
          <DropWrapper>
            {type === 'table' ? (
              <table {...elementProps}>{renderChildren()}</table>
            ) : type === 'thead' ? (
              <thead {...elementProps}>{renderChildren()}</thead>
            ) : type === 'tbody' ? (
              <tbody {...elementProps}>{renderChildren()}</tbody>
            ) : type === 'tfoot' ? (
              <tfoot {...elementProps}>{renderChildren()}</tfoot>
            ) : (
              <tr {...elementProps}>{renderChildren()}</tr>
            )}
          </DropWrapper>
        )

      case 'th':
      case 'td':
        return renderWithChildren(type as keyof JSX.IntrinsicElements)

      // Other
      case 'figure':
        return (
          <DropWrapper>
            <figure {...elementProps}>
              {renderChildren()}
            </figure>
          </DropWrapper>
        )

      case 'figcaption':
        return renderWithChildren(type as keyof JSX.IntrinsicElements)

      default:
        // Fallback for any other HTML tag
        const Tag = type as keyof JSX.IntrinsicElements
        return (
          <DropWrapper>
            <Tag {...elementProps} ref={drag as any}>
              {typeof props?.children === 'string' && props.children}
              {renderChildren()}
            </Tag>
          </DropWrapper>
        )
    }
  }

  // Determine wrapper display based on component's display property
  // Use 'contents' for block-level and flex/grid layouts to avoid interfering
  const componentDisplay = component.props?.style?.display
  const wrapperStyle: React.CSSProperties = {}
  
  // For main and form elements, NEVER use display: contents on wrapper to ensure highlighting works
  // These elements need the wrapper to be visible for proper highlighting
  const isMainOrForm = component.type === 'main' || component.type === 'form'
  
  // If component has block, flex, grid, or table display, use contents
  // This prevents the wrapper from interfering with the component's layout
  // BUT: Never use contents for main and form elements - they need visible wrapper for highlighting
  if (!isMainOrForm && componentDisplay && ['block', 'flex', 'grid', 'table', 'table-row', 'table-cell', 'inline-flex', 'inline-grid'].includes(componentDisplay)) {
    wrapperStyle.display = 'contents'
  } else if (isMainOrForm) {
    // For form and main, ensure wrapper doesn't constrain width
    wrapperStyle.display = 'block'
    wrapperStyle.width = '100%'
    wrapperStyle.maxWidth = '100%'
  }
  
  // Add data attribute to help with CSS selection when display: contents is used
  // For main and form, add special data attribute to ensure highlighting works
  const wrapperProps: any = {
    className: `render-component-wrapper ${isSelected ? 'selected-wrapper' : ''} ${isDragging ? 'dragging' : ''} ${isOver ? 'drag-over' : ''}`.trim(),
    style: wrapperStyle,
    'data-selected': isSelected ? 'true' : 'false',
    'data-display-contents': wrapperStyle.display === 'contents' ? 'true' : 'false',
    'data-component-type': component.type,
    ...(isMainOrForm && isSelected ? { 'data-main-form-selected': 'true' } : {})
  }
  
  return (
    <div {...wrapperProps}>
      {renderElement()}
    </div>
  )
}

// Google Chart Component
interface ChartComponentProps {
  component: ComponentNode
  chartType: string
  chartData: any
  elementProps: any
  DropWrapper: ({ children }: { children: React.ReactNode }) => JSX.Element
  renderChildren: () => React.ReactNode
}

const ChartComponent = ({ component, chartType, chartData, elementProps, DropWrapper, renderChildren }: ChartComponentProps) => {
  const chartRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!chartRef.current || !chartData) {
      console.warn('ChartComponent: Missing ref or data', { hasRef: !!chartRef.current, hasData: !!chartData, chartType })
      return
    }
    
    console.log('ChartComponent: Starting render', { chartType, chartData })

    // Load Google Charts library
    const loadGoogleCharts = () => {
      // If Google Charts is already loaded and visualization is available, render immediately
      if (window.google && window.google.visualization) {
        renderChart()
        return
      }

      // If loader is already loaded but visualization not ready, wait for it
      if (window.google && window.google.charts) {
        window.google.charts.setOnLoadCallback(() => {
          renderChart()
        })
        return
      }

      // Load the script if not already present
      const existingScript = document.querySelector('script[src="https://www.gstatic.com/charts/loader.js"]')
      if (existingScript) {
        // Script is loading, wait for it
        const checkInterval = setInterval(() => {
          if (window.google && window.google.charts) {
            clearInterval(checkInterval)
            window.google.charts.load('current', { 
              packages: ['corechart', 'bar', 'line', 'gauge', 'table', 'scatter', 'candlestick'] 
            })
            window.google.charts.setOnLoadCallback(() => {
              renderChart()
            })
          }
        }, 100)
        return
      }

      // Create and load the script
      const script = document.createElement('script')
      script.src = 'https://www.gstatic.com/charts/loader.js'
      script.async = true
      script.onload = () => {
        if (window.google && window.google.charts) {
          window.google.charts.load('current', { 
            packages: ['corechart', 'bar', 'line', 'gauge', 'table', 'scatter', 'candlestick'] 
          })
          window.google.charts.setOnLoadCallback(() => {
            renderChart()
          })
        }
      }
      document.head.appendChild(script)
    }

    function renderChart() {
      if (!chartRef.current || !chartData || !window.google || !window.google.visualization) {
        console.warn('Chart rendering skipped:', { 
          hasRef: !!chartRef.current, 
          hasData: !!chartData, 
          hasGoogle: !!window.google,
          hasVisualization: !!(window.google?.visualization)
        })
        return
      }

      try {
        const data = new window.google.visualization.DataTable()
        let hasData = false
        
        // Prepare data based on chart type
        if (chartType.toLowerCase() === 'candlestick') {
          // Candlestick chart format: [low, open, close, high]
          data.addColumn('string', 'Date')
          data.addColumn('number', 'Low')
          data.addColumn('number', 'Open')
          data.addColumn('number', 'Close')
          data.addColumn('number', 'High')
          
          if (chartData.labels && chartData.datasets && chartData.datasets[0]?.data) {
            chartData.labels.forEach((label: string, index: number) => {
              const candleData = chartData.datasets[0].data[index]
              if (Array.isArray(candleData) && candleData.length >= 4) {
                data.addRow([label, candleData[0], candleData[1], candleData[2], candleData[3]])
                hasData = true
              }
            })
          }
        } else if (chartType.toLowerCase() === 'table') {
          // Table chart format
          if (chartData.labels && chartData.datasets && chartData.datasets[0]?.data) {
            chartData.labels.forEach((label: string) => {
              data.addColumn('string', label)
            })
            chartData.datasets[0].data.forEach((row: any[]) => {
              if (Array.isArray(row)) {
                data.addRow(row)
                hasData = true
              }
            })
          }
        } else if (chartData.labels && chartData.datasets) {
          // Line/Bar/Area chart format
          data.addColumn('string', 'Label')
          chartData.datasets.forEach((dataset: any, index: number) => {
            data.addColumn('number', dataset.label || `Series ${index + 1}`)
          })
          
          const rows: any[] = []
          chartData.labels.forEach((label: string, labelIndex: number) => {
            const row: any[] = [label]
            chartData.datasets.forEach((dataset: any) => {
              row.push(dataset.data[labelIndex] || 0)
            })
            rows.push(row)
          })
          if (rows.length > 0) {
            data.addRows(rows)
            hasData = true
          }
        } else if (Array.isArray(chartData)) {
          // Simple array format
          data.addColumn('string', 'Label')
          data.addColumn('number', 'Value')
          chartData.forEach((item: any) => {
            data.addRow([item.label || item[0], item.value || item[1]])
            hasData = true
          })
        }

        if (!hasData) {
          console.warn('No data to render for chart:', chartType, chartData)
          return
        }

        // Ensure container has dimensions - wait if needed
        let containerWidth = chartRef.current.offsetWidth
        let containerHeight = chartRef.current.offsetHeight
        
        // If dimensions are 0, try to get from style
        if (!containerWidth || containerWidth === 0) {
          const widthStr = elementProps.style?.width || '400px'
          containerWidth = parseInt(String(widthStr).replace('px', '')) || 400
        }
        
        if (!containerHeight || containerHeight === 0) {
          const heightStr = elementProps.style?.height || '300px'
          containerHeight = parseInt(String(heightStr).replace('px', '')) || 300
        }

        console.log('Chart container dimensions:', { containerWidth, containerHeight, chartType, dataRows: data.getNumberOfRows() })

        let chart: any
        const options: any = {
          title: chartData.title || '',
          width: containerWidth,
          height: containerHeight,
          backgroundColor: 'transparent',
          legend: { position: 'right' },
          chartArea: { width: '70%', height: '70%' }
        }

        switch (chartType.toLowerCase()) {
          case 'line':
            chart = new window.google.visualization.LineChart(chartRef.current)
            break
          case 'bar':
            chart = new window.google.visualization.BarChart(chartRef.current)
            break
          case 'column':
            chart = new window.google.visualization.ColumnChart(chartRef.current)
            break
          case 'pie':
            chart = new window.google.visualization.PieChart(chartRef.current)
            break
          case 'donut':
            chart = new window.google.visualization.PieChart(chartRef.current)
            options.pieHole = 0.4
            break
          case 'area':
            chart = new window.google.visualization.AreaChart(chartRef.current)
            break
          case 'steppedarea':
            chart = new window.google.visualization.SteppedAreaChart(chartRef.current)
            break
          case 'scatter':
            chart = new window.google.visualization.ScatterChart(chartRef.current)
            break
          case 'combo':
            chart = new window.google.visualization.ComboChart(chartRef.current)
            break
          case 'histogram':
            chart = new window.google.visualization.Histogram(chartRef.current)
            break
          case 'candlestick':
            chart = new window.google.visualization.CandlestickChart(chartRef.current)
            break
          case 'gauge':
            chart = new window.google.visualization.Gauge(chartRef.current)
            break
          case 'table':
            chart = new window.google.visualization.Table(chartRef.current)
            break
          default:
            chart = new window.google.visualization.LineChart(chartRef.current)
        }

        // Check if we have data before drawing
        if (data.getNumberOfRows() === 0) {
          const errorMsg = 'No data rows available for chart'
          console.warn(errorMsg, { chartType, chartData })
          setError(errorMsg)
          return
        }

        console.log('Drawing chart:', { 
          chartType, 
          rows: data.getNumberOfRows(), 
          cols: data.getNumberOfColumns(),
          width: options.width,
          height: options.height
        })
        
        chart.draw(data, options)
        console.log('Chart rendered successfully:', chartType)
        setError(null)
      } catch (error: any) {
        const errorMsg = error?.message || 'Failed to render chart'
        console.error('Error rendering chart:', error, { chartType, chartData })
        setError(errorMsg)
      }
    }

    loadGoogleCharts()

    return () => {
      if (chartRef.current) {
        chartRef.current.innerHTML = ''
      }
    }
  }, [chartType, chartData, component.id])

  // Get dimensions from props or use defaults
  // Extract numeric values from style if they're in pixels
  const getDimension = (dim: string | undefined) => {
    if (!dim) return '100%'
    if (typeof dim === 'string' && dim.includes('px')) {
      return dim
    }
    return dim
  }
  
  const chartWidth = getDimension(elementProps.style?.width) || '100%'
  const chartHeight = getDimension(elementProps.style?.height) || '100%'

  return (
    <DropWrapper>
      <div {...elementProps}>
        <div 
          ref={chartRef} 
          style={{ 
            width: chartWidth, 
            height: chartHeight, 
            minHeight: '200px',
            minWidth: '200px'
          }} 
        />
        {error && (
          <div style={{ 
            padding: '10px', 
            color: 'red', 
            fontSize: '12px',
            backgroundColor: '#ffebee',
            border: '1px solid #f44336',
            borderRadius: '4px',
            margin: '10px'
          }}>
            Chart Error: {error}
          </div>
        )}
        {renderChildren()}
      </div>
    </DropWrapper>
  )
}

// AG Grid Component
interface AGGridComponentProps {
  component: ComponentNode
  agGridConfig: any
  elementProps: any
  DropWrapper: ({ children }: { children: React.ReactNode }) => JSX.Element
  renderChildren: () => React.ReactNode
}

const AGGridComponent = ({ component, agGridConfig, elementProps, DropWrapper, renderChildren }: AGGridComponentProps) => {
  const gridRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    if (!gridRef.current || !agGridConfig) {
      console.warn('AGGridComponent: Missing ref or config', { hasRef: !!gridRef.current, hasConfig: !!agGridConfig })
      return
    }

    // Check if AG Grid is available
    if (typeof window !== 'undefined' && (window as any).agGrid) {
      try {
        const { agGrid } = window as any
        const gridOptions = {
          columnDefs: agGridConfig.columnDefs || [],
          rowData: agGridConfig.rowData || [],
          defaultColDef: agGridConfig.defaultColDef || {
            resizable: true,
            sortable: true,
            filter: true,
          },
        }

        // Create AG Grid instance
        new agGrid.Grid(gridRef.current, gridOptions)
        setIsLoaded(true)
        setError(null)
      } catch (err: any) {
        const errorMsg = err?.message || 'Failed to initialize AG Grid'
        console.error('Error initializing AG Grid:', err)
        setError(errorMsg)
      }
    } else {
      // AG Grid not loaded - show placeholder
      setError('AG Grid library not loaded. Please include AG Grid in your project.')
      console.warn('AG Grid library not available. Install with: npm install ag-grid-react ag-grid-community')
    }

    return () => {
      if (gridRef.current) {
        gridRef.current.innerHTML = ''
      }
    }
  }, [agGridConfig, component.id])

  const gridWidth = elementProps.style?.width || '100%'
  const gridHeight = elementProps.style?.height || '400px'

  return (
    <DropWrapper>
      <div {...elementProps}>
        {error ? (
          <div style={{
            width: gridWidth,
            height: gridHeight,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
            border: '2px dashed rgba(102, 126, 234, 0.3)',
            borderRadius: '8px',
            padding: '20px',
            color: '#667eea',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '8px' }}>AG Grid Table</div>
            <div style={{ fontSize: '12px', color: '#666' }}>{error}</div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
              Install: npm install ag-grid-react ag-grid-community
            </div>
          </div>
        ) : (
          <div
            ref={gridRef}
            style={{
              width: gridWidth,
              height: gridHeight,
              minHeight: '200px',
            }}
            className="ag-theme-alpine"
          />
        )}
        {renderChildren()}
      </div>
    </DropWrapper>
  )
}

// Extend Window interface for Google Charts and AG Grid
declare global {
  interface Window {
    google?: {
      charts: {
        load: (version: string, options: { packages: string[] }) => void
        setOnLoadCallback: (callback: () => void) => void
      }
      visualization: {
        DataTable: new () => any
        LineChart: new (container: HTMLElement) => any
        BarChart: new (container: HTMLElement) => any
        ColumnChart: new (container: HTMLElement) => any
        PieChart: new (container: HTMLElement) => any
        AreaChart: new (container: HTMLElement) => any
        SteppedAreaChart: new (container: HTMLElement) => any
        ScatterChart: new (container: HTMLElement) => any
        ComboChart: new (container: HTMLElement) => any
        Histogram: new (container: HTMLElement) => any
        CandlestickChart: new (container: HTMLElement) => any
        Gauge: new (container: HTMLElement) => any
        Table: new (container: HTMLElement) => any
      }
    }
    agGrid?: {
      Grid: new (element: HTMLElement, options: any) => any
    }
  }
}

export default RenderComponent
