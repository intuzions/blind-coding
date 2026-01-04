import { ComponentNode } from '../types/editor'
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Pre-built card components (matching PreBuiltComponentsModal)
const PREBUILT_CARDS = [
  {
    label: 'User Card',
    defaultProps: {
      className: 'card-container',
      style: {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '24px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        minWidth: '250px',
        minHeight: '180px'
      },
      children: [
        {
          type: 'div',
          props: {
            style: { 
              fontSize: '32px', 
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            },
            children: '👤',
            'data-icon': 'user'
          }
        },
        {
          type: 'div',
          props: {
            style: { fontSize: '28px', fontWeight: 'bold', textAlign: 'center' },
            children: '1,234'
          }
        },
        {
          type: 'div',
          props: {
            style: { fontSize: '14px', opacity: 0.9, textAlign: 'center' },
            children: 'Total Users'
          }
        }
      ]
    }
  },
  {
    label: 'Stats Card',
    defaultProps: {
      className: 'card-container',
      style: {
        background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        color: 'white',
        padding: '24px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(67, 233, 123, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        minWidth: '250px',
        minHeight: '180px'
      },
      children: [
        {
          type: 'div',
          props: {
            style: { 
              fontSize: '32px', 
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            },
            children: '📈',
            'data-icon': 'trending'
          }
        },
        {
          type: 'div',
          props: {
            style: { fontSize: '28px', fontWeight: 'bold', textAlign: 'center' },
            children: '+12.5%'
          }
        },
        {
          type: 'div',
          props: {
            style: { fontSize: '14px', opacity: 0.9, textAlign: 'center' },
            children: 'Growth Rate'
          }
        }
      ]
    }
  },
  {
    label: 'Revenue Card',
    defaultProps: {
      className: 'card-container',
      style: {
        background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        color: 'white',
        padding: '24px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(245, 87, 108, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        minWidth: '250px',
        minHeight: '180px'
      },
      children: [
        {
          type: 'div',
          props: {
            style: { 
              fontSize: '32px', 
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            },
            children: '💰',
            'data-icon': 'dollar'
          }
        },
        {
          type: 'div',
          props: {
            style: { fontSize: '28px', fontWeight: 'bold', textAlign: 'center' },
            children: '$45,678'
          }
        },
        {
          type: 'div',
          props: {
            style: { fontSize: '14px', opacity: 0.9, textAlign: 'center' },
            children: 'Total Revenue'
          }
        }
      ]
    }
  },
  {
    label: 'Activity Card',
    defaultProps: {
      className: 'card-container',
      style: {
        background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        color: 'white',
        padding: '24px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(79, 172, 254, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        minWidth: '250px',
        minHeight: '180px'
      },
      children: [
        {
          type: 'div',
          props: {
            style: { 
              fontSize: '32px', 
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            },
            children: '⚡',
            'data-icon': 'activity'
          }
        },
        {
          type: 'div',
          props: {
            style: { fontSize: '28px', fontWeight: 'bold', textAlign: 'center' },
            children: '892'
          }
        },
        {
          type: 'div',
          props: {
            style: { fontSize: '14px', opacity: 0.9, textAlign: 'center' },
            children: 'Active Users'
          }
        }
      ]
    }
  },
  {
    label: 'User Group Card',
    defaultProps: {
      className: 'card-container',
      style: {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '24px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        minWidth: '250px',
        minHeight: '180px'
      },
      children: [
        {
          type: 'div',
          props: {
            style: { 
              fontSize: '32px', 
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            },
            children: '👥',
            'data-icon': 'user-group'
          }
        },
        {
          type: 'div',
          props: {
            style: { fontSize: '28px', fontWeight: 'bold', textAlign: 'center' },
            children: '156'
          }
        },
        {
          type: 'div',
          props: {
            style: { fontSize: '14px', opacity: 0.9, textAlign: 'center' },
            children: 'User Groups'
          }
        }
      ]
    }
  }
]

// Get a random pre-built card
function getRandomPrebuiltCard() {
  const randomIndex = Math.floor(Math.random() * PREBUILT_CARDS.length)
  return PREBUILT_CARDS[randomIndex]
}

export interface ImageAnalysisResult {
  components: ComponentNode[]
  detectedElements: {
    type: 'text' | 'image' | 'graph' | 'button' | 'input' | 'container' | 'card'
    bounds: { x: number; y: number; width: number; height: number }
    componentName?: string // Name of the selected pre-built component
    content?: string // Extracted text content from the region
    imageData?: string // base64 for cropped images
    chartType?: 'line' | 'bar' | 'pie' | 'area'
    chartData?: any
    color?: string // Extracted color from the marked region
    parentFrameId?: string // ID of the parent frame/container
  }[]
  annotatedImage?: string // base64 data URL of image with bounding boxes
}

/**
 * Analyzes an uploaded image and generates React components
 * This is a placeholder implementation that can be enhanced with actual AI/ML services
 */
export async function analyzeImageAndGenerateComponents(file: File): Promise<ComponentNode[]> {
  try {
    // Get auth token
    const token = localStorage.getItem('token')
    if (!token) {
      throw new Error('Authentication required')
    }

    // Create FormData for file upload
    const formData = new FormData()
    formData.append('image', file)

    // Call backend API for image analysis
    console.log('Uploading image to backend...', file.name, file.size)
    const response = await axios.post<ImageAnalysisResult>(
      `${API_BASE_URL}/api/analyze-image`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`,
        },
      }
    )

    console.log('Backend response received:', {
      hasComponents: !!response.data.components,
      componentsCount: response.data.components?.length || 0,
      hasDetectedElements: !!response.data.detectedElements,
      detectedElementsCount: response.data.detectedElements?.length || 0
    })

    // Backend returns components directly - flatten nested structure
    if (response.data.components && response.data.components.length > 0) {
      console.log('Raw components from backend:', JSON.stringify(response.data.components, null, 2))
      const flattened = flattenComponents(response.data.components as ComponentNode[])
      console.log('Flattened components:', flattened.length, 'components')
      console.log('Root components:', flattened.filter(c => !c.parentId).length)
      return flattened
    }

    // If no components, try to convert from detectedElements
    if (response.data.detectedElements && response.data.detectedElements.length > 0) {
      return convertAnalysisToComponents(response.data)
    }

    // If still no components, use fallback
    return await createFallbackComponent(file)
  } catch (error) {
    console.error('Image analysis error:', error)
    // Fallback: create a simple container with the image
    return createFallbackComponent(file)
  }
}

/**
 * Flattens nested component structure to flat array with parentId
 */
function flattenComponents(components: ComponentNode[], parentId?: string): ComponentNode[] {
  const flattened: ComponentNode[] = []
  
  components.forEach((comp) => {
    // Extract children array (separate from props.children which is for text content)
    const nestedChildren = comp.children
    const { children: _, ...compWithoutChildren } = comp
    
    // For chart containers, skip placeholder children (they have "Chart will be rendered here" text)
    // Charts should render directly without nested placeholder divs
    const isChartContainer = comp.props?.className === 'chart-container' || comp.props?.['data-chart-type']
    
    // Create flat component without nested children array
    const flatComp: ComponentNode = {
      ...compWithoutChildren,
      parentId: parentId || undefined,
      // Explicitly remove children array - we use parentId for hierarchy
      children: undefined,
    }
    flattened.push(flatComp)
    
    // Recursively flatten nested children
    // Skip placeholder children for chart containers
    if (nestedChildren && Array.isArray(nestedChildren) && nestedChildren.length > 0) {
      const childrenToFlatten = isChartContainer 
        ? nestedChildren.filter((child: ComponentNode) => {
            // Filter out placeholder divs with "Chart will be rendered here" text
            const isPlaceholder = child.props?.children === 'Chart will be rendered here' ||
                                 child.props?.children === 'Chart will be rendered here'
            return !isPlaceholder
          })
        : nestedChildren
      
      if (childrenToFlatten.length > 0) {
        console.log(`  Flattening ${childrenToFlatten.length} children of ${comp.id} (parent: ${parentId || 'root'})`)
        const childComponents = flattenComponents(childrenToFlatten, comp.id)
        flattened.push(...childComponents)
      }
    }
  })
  
  console.log(`Flattened ${components.length} components into ${flattened.length} total (parent: ${parentId || 'root'})`)
  return flattened
}

/**
 * Converts analysis result to ComponentNode array
 */
export function convertAnalysisToComponents(analysis: ImageAnalysisResult): ComponentNode[] {
  const components: ComponentNode[] = []
  const timestamp = Date.now()
  
  // Create a main container
  const mainContainerId = `comp-${timestamp}-container`
  const mainContainer: ComponentNode = {
    id: mainContainerId,
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minHeight: '100vh',
        padding: '20px',
        gap: '20px',
      },
    },
  }

  // Add main container first
  components.push(mainContainer)

  // Find the frame/container element (first container element)
  const frameElement = analysis.detectedElements.find(el => el.type === 'container')
  const frameElementId = frameElement ? `comp-${timestamp}-frame` : null

  // Process each detected element and flatten nested children
  analysis.detectedElements.forEach((element, index) => {
    // Skip frame container element - it will be added separately
    if (element.type === 'container' && element === frameElement) {
      return
    }

    const component = createComponentFromElement(element, index, timestamp)
    if (component) {
      // Extract nested children if they exist
      const nestedChildren = component.children || []
      const { children: _, ...componentWithoutChildren } = component
      
      // Determine parent ID: if element has parentFrameId, use frame container, otherwise use main container
      const elementParentId = (element as any).parentFrameId && frameElementId 
        ? frameElementId 
        : mainContainerId
      
      // Add component with parentId reference
      const flatComponent: ComponentNode = {
        ...componentWithoutChildren,
        parentId: elementParentId,
      }
      components.push(flatComponent)
      
      // Flatten and add nested children (for cards with pre-built content)
      if (nestedChildren.length > 0) {
        nestedChildren.forEach((child, childIndex) => {
          // If child is already a ComponentNode (has id), use it directly but update parentId
          // Otherwise, convert to ComponentNode format
          if (child.id) {
            // Child is already a ComponentNode, just ensure parentId is set correctly
            const flatChild: ComponentNode = {
              ...child,
              parentId: flatComponent.id,
            }
            components.push(flatChild)
          } else {
            // Convert child to ComponentNode format
            const flatChild: ComponentNode = {
              id: `${flatComponent.id}-child-${childIndex}`,
              type: child.type || 'div',
              props: child.props || {},
              parentId: flatComponent.id,
            }
            components.push(flatChild)
          }
        })
      }
    }
  })

  // Add frame container if it exists - adjust to canvas size
  if (frameElement && frameElementId) {
    // Frame should be sized to canvas (typically 1200x800 or full width/height)
    const frameWidth = frameElement.bounds.width > 0 ? frameElement.bounds.width : 1200
    const frameHeight = frameElement.bounds.height > 0 ? frameElement.bounds.height : 800
    
    const frameComponent: ComponentNode = {
      id: frameElementId,
      type: 'div',
      props: {
        style: {
          position: 'relative',
          left: '0px',
          top: '0px',
          width: `${frameWidth}px`,
          height: `${frameHeight}px`,
          border: frameElement.color ? `2px solid ${frameElement.color}` : '2px solid #e0e0e0',
          borderRadius: '8px',
          padding: '10px',
          backgroundColor: frameElement.color ? `${frameElement.color}10` : '#f5f5f5',
        },
      },
      parentId: mainContainerId,
    }
    // Insert frame at the beginning (after main container)
    components.splice(1, 0, frameComponent)
  }

  console.log('Converted to components:', {
    total: components.length,
    root: components.filter(c => !c.parentId).length,
    withParent: components.filter(c => c.parentId).length
  })

  return components
}

/**
 * Creates a ComponentNode from a detected element
 */
function createComponentFromElement(
  element: ImageAnalysisResult['detectedElements'][0],
  index: number,
  timestamp: number
): ComponentNode | null {
  const baseId = `comp-${timestamp}-${index}`
  const baseStyle: { [key: string]: string } = {
    position: 'relative',
    left: `${element.bounds.x}px`,
    top: `${element.bounds.y}px`,
    width: `${element.bounds.width}px`,
    height: `${element.bounds.height}px`,
  }

  // Get extracted color or use default
  const extractedColor = element.color || '#667eea'
  
  // Convert RGB to hex if needed
  const colorToHex = (color: string): string => {
    if (color.startsWith('#')) return color
    if (color.startsWith('rgb')) {
      const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
      if (match) {
        const r = parseInt(match[1]).toString(16).padStart(2, '0')
        const g = parseInt(match[2]).toString(16).padStart(2, '0')
        const b = parseInt(match[3]).toString(16).padStart(2, '0')
        return `#${r}${g}${b}`
      }
    }
    return color
  }
  
  const hexColor = colorToHex(extractedColor)

  switch (element.type) {
    case 'text':
      return {
        id: baseId,
        type: 'p',
        props: {
          style: {
            ...baseStyle,
            color: hexColor,
          },
          children: element.content || element.extractedText || 'Text',
        },
      }

    case 'image':
      return {
        id: baseId,
        type: 'img',
        props: {
          style: {
            ...baseStyle,
            border: `2px solid ${hexColor}`,
          },
          src: element.imageData || '',
          alt: 'Uploaded image',
        },
      }

    case 'graph':
      // Create chart data similar to pre-built components
      const chartData = element.chartData || {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [
          {
            label: 'Series 1',
            data: [10, 20, 15, 25, 30, 28]
          },
          {
            label: 'Series 2',
            data: [5, 15, 10, 20, 25, 22]
          }
        ]
      }
      
      // Ensure minimum dimensions for chart visibility
      const chartWidth = baseStyle.width || '500px'
      const chartHeight = baseStyle.height || '300px'
      
      return {
        id: baseId,
        type: 'div',
        props: {
          style: {
            ...baseStyle,
            width: chartWidth,
            height: chartHeight,
            minWidth: '300px',
            minHeight: '200px',
            backgroundColor: '#ffffff',
            border: '1px solid #e0e0e0',
            borderRadius: '4px',
            padding: '10px',
          },
          'data-chart-type': element.chartType || 'line',
          'data-chart-data': JSON.stringify(chartData),
          className: 'chart-container',
        },
        // No nested children - chart will render directly via ChartComponent
      }

    case 'button':
      return {
        id: baseId,
        type: 'button',
        props: {
          style: {
            ...baseStyle,
            padding: '10px 20px',
            backgroundColor: hexColor,
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          },
          children: element.content || 'Button',
        },
      }

    case 'input':
      return {
        id: baseId,
        type: 'input',
        props: {
          style: {
            ...baseStyle,
            padding: '10px',
            border: `2px solid ${hexColor}`,
            borderRadius: '4px',
          },
          placeholder: element.content || 'Input',
        },
      }

    case 'container':
      return {
        id: baseId,
        type: 'div',
        props: {
          style: {
            ...baseStyle,
            display: 'flex',
            flexDirection: 'column',
            padding: '10px',
            border: `2px solid ${hexColor}`,
            borderRadius: '4px',
            backgroundColor: `${hexColor}10`,
          },
        },
        children: [],
      }

    case 'card':
      // Get pre-built card by name if specified, otherwise random
      let prebuiltCard
      if (element.componentName) {
        prebuiltCard = PREBUILT_CARDS.find(card => card.label === element.componentName) || getRandomPrebuiltCard()
      } else {
        prebuiltCard = getRandomPrebuiltCard()
      }
      
      // Merge extracted color with pre-built card style
      const cardStyle = {
        ...prebuiltCard.defaultProps.style,
        ...baseStyle,
        // Override background with extracted color if available, otherwise use pre-built gradient
        background: hexColor !== '#667eea' 
          ? hexColor 
          : prebuiltCard.defaultProps.style.background,
      }
      
      // Convert children to ComponentNode format with proper IDs
      const cardChildren: ComponentNode[] = (prebuiltCard.defaultProps.children || []).map((child: any, childIndex: number) => {
        const childComponent: ComponentNode = {
          id: `${baseId}-child-${childIndex}`,
          type: child.type || 'div',
          props: {
            ...(child.props || {}),
            // Ensure children (text content) is preserved in props
            children: child.props?.children || child.children || '',
          },
          parentId: baseId,
        }
        return childComponent
      })
      
      // Create card component with pre-built structure
      const cardComponent: ComponentNode = {
        id: baseId,
        type: 'div',
        props: {
          ...prebuiltCard.defaultProps,
          style: cardStyle,
        },
        children: cardChildren,
      }
      
      return cardComponent

    default:
      return null
  }
}

/**
 * Fallback: creates a simple container with the uploaded image
 */
async function createFallbackComponent(file: File): Promise<ComponentNode[]> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const imageData = e.target?.result as string
      const component: ComponentNode = {
        id: `comp-${Date.now()}-fallback`,
        type: 'div',
        props: {
          style: {
            width: '100%',
            padding: '20px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          },
        },
        children: [
          {
            id: `comp-${Date.now()}-img`,
            type: 'img',
            props: {
              style: {
                maxWidth: '100%',
                height: 'auto',
              },
              src: imageData,
              alt: 'Uploaded dashboard',
            },
          },
        ],
      }
      resolve([component])
    }
    reader.readAsDataURL(file)
  })
}

