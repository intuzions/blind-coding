import { useState, useRef } from 'react'
import { FiX, FiUpload, FiLoader, FiCheck, FiRefreshCw, FiTrash2, FiSave, FiEdit2, FiTag, FiZap, FiMove, FiMaximize2, FiMinimize2, FiArrowUp, FiArrowDown, FiArrowLeft, FiArrowRight } from 'react-icons/fi'
import { analyzeImageAndGenerateComponents, ImageAnalysisResult } from '../../services/imageAnalysis'
import { useToast } from '../Toast'
import axios from 'axios'
import './ImageUploadModal.css'

interface Mark {
  id: string
  type: 'graph' | 'card' | 'text' | 'image' | 'button' | 'input' | 'container'
  componentName?: string // Name of the selected pre-built component
  bounds: { x: number; y: number; width: number; height: number }
  selected?: boolean
  color?: string // Dominant color extracted from the marked region
  extractedText?: string // Extracted text content for text components
}

interface ImageUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onUpload: (file: File) => Promise<void>
}

// Helper function to map component name to chart type
const getChartTypeFromComponentName = (componentName: string): string => {
  const chartTypeMap: { [key: string]: string } = {
    'Line Chart': 'line',
    'Bar Chart': 'bar',
    'Pie Chart': 'pie',
    'Column Chart': 'column',
    'Donut Chart': 'donut',
    'Area Chart': 'area',
    'Stepped Area Chart': 'steppedArea',
    'Scatter Chart': 'scatter',
    'Combo Chart': 'combo',
    'Histogram Chart': 'histogram',
    'Candlestick Chart': 'candlestick',
    'Gauge Chart': 'gauge',
    'Table Chart': 'table',
  }
  return chartTypeMap[componentName] || 'line' // Default to 'line' if not found
}

// Pre-built component options for the dropdown
const PREBUILT_COMPONENTS = [
  // Charts
  { value: 'graph|Line Chart', label: 'Line Chart', type: 'graph' },
  { value: 'graph|Bar Chart', label: 'Bar Chart', type: 'graph' },
  { value: 'graph|Pie Chart', label: 'Pie Chart', type: 'graph' },
  { value: 'graph|Column Chart', label: 'Column Chart', type: 'graph' },
  { value: 'graph|Donut Chart', label: 'Donut Chart', type: 'graph' },
  { value: 'graph|Area Chart', label: 'Area Chart', type: 'graph' },
  { value: 'graph|Stepped Area Chart', label: 'Stepped Area Chart', type: 'graph' },
  { value: 'graph|Scatter Chart', label: 'Scatter Chart', type: 'graph' },
  { value: 'graph|Combo Chart', label: 'Combo Chart', type: 'graph' },
  { value: 'graph|Histogram Chart', label: 'Histogram Chart', type: 'graph' },
  { value: 'graph|Candlestick Chart', label: 'Candlestick Chart', type: 'graph' },
  { value: 'graph|Gauge Chart', label: 'Gauge Chart', type: 'graph' },
  { value: 'graph|Table Chart', label: 'Table Chart', type: 'graph' },
  // Cards
  { value: 'card|User Card', label: 'User Card', type: 'card' },
  { value: 'card|Stats Card', label: 'Stats Card', type: 'card' },
  { value: 'card|Revenue Card', label: 'Revenue Card', type: 'card' },
  { value: 'card|Activity Card', label: 'Activity Card', type: 'card' },
  { value: 'card|User Group Card', label: 'User Group Card', type: 'card' },
  // Other components
  { value: 'text|Text', label: 'Text', type: 'text' },
  { value: 'image|Image', label: 'Image', type: 'image' },
  { value: 'button|Button', label: 'Button', type: 'button' },
  { value: 'input|Input', label: 'Input', type: 'input' },
  { value: 'container|Container', label: 'Container', type: 'container' },
]

const ImageUploadModal = ({ isOpen, onClose, onUpload }: ImageUploadModalProps) => {
  const { showToast } = useToast()
  const [dragActive, setDragActive] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [annotatedPreview, setAnnotatedPreview] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<ImageAnalysisResult | null>(null)
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [customMarks, setCustomMarks] = useState<Mark[]>([])
  const [selectedComponentType, setSelectedComponentType] = useState<string>('')
  const [isDrawing, setIsDrawing] = useState(false)
  const [isMarkingMode, setIsMarkingMode] = useState(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null)
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null)
  const [showCustomMarking, setShowCustomMarking] = useState(false)
  const [isAdjustingMode, setIsAdjustingMode] = useState(false)
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.type.startsWith('image/')) {
        handleFile(file)
      }
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = async (file: File) => {
    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
    
    setCurrentFile(file)
    setAnnotatedPreview(null)
    setAnalysisResult(null)

    // Analyze image first to show preview with marked components
    setAnalyzing(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('Authentication required')
      }

      const formData = new FormData()
      formData.append('image', file)

      const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000'
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

      setAnalysisResult(response.data)
      if (response.data.annotatedImage) {
        setAnnotatedPreview(response.data.annotatedImage)
      }
    } catch (error) {
      console.error('Analysis failed:', error)
      // Toast will be handled by parent component
    } finally {
      setAnalyzing(false)
    }
  }

  const handleGenerateComponents = async () => {
    if (!currentFile) return

    setUploading(true)
    try {
      await onUpload(currentFile)
      onClose()
      setPreview(null)
      setAnnotatedPreview(null)
      setAnalysisResult(null)
      setCurrentFile(null)
    } catch (error) {
      console.error('Upload failed:', error)
      // Toast will be handled by parent component
    } finally {
      setUploading(false)
    }
  }

  const handleReset = () => {
    setPreview(null)
    setAnnotatedPreview(null)
    setAnalysisResult(null)
    setCurrentFile(null)
    setCustomMarks([])
    setShowCustomMarking(false)
    setSelectedComponentType('')
    setIsMarkingMode(false)
    setIsAdjustingMode(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Auto-marking: Convert detected elements from analysis to marks
  const handleAutoMarking = () => {
    if (!analysisResult || !analysisResult.detectedElements || analysisResult.detectedElements.length === 0) {
      showToast('No components detected. Please analyze the image first.', 'warning')
      return
    }

    const autoMarks: Mark[] = analysisResult.detectedElements.map((element, index) => {
      // Determine component type and name
      let componentType: Mark['type'] = 'container'
      let componentName = ''
      
      if (element.type === 'graph') {
        componentType = 'graph'
        componentName = (element as any).chartType 
          ? `${(element as any).chartType.charAt(0).toUpperCase() + (element as any).chartType.slice(1)} Chart`
          : 'Line Chart'
      } else if (element.type === 'card') {
        componentType = 'card'
        componentName = (element as any).componentName || 'Card'
      } else if (element.type === 'text') {
        componentType = 'text'
        componentName = 'Text'
      } else if (element.type === 'image') {
        componentType = 'image'
        componentName = 'Image'
      } else if (element.type === 'button') {
        componentType = 'button'
        componentName = 'Button'
      } else if (element.type === 'input') {
        componentType = 'input'
        componentName = 'Input'
      }

      return {
        id: `auto-mark-${Date.now()}-${index}`,
        type: componentType,
        componentName: componentName,
        bounds: element.bounds,
        color: (element as any).color || '#667eea',
        extractedText: element.type === 'text' ? (element as any).content : undefined
      }
    })

    setCustomMarks(autoMarks)
    setShowCustomMarking(true)
    showToast(`Auto-marked ${autoMarks.length} component(s)`, 'success')
  }

  // Adjust all marks functions
  const adjustAllMarks = (adjustment: (bounds: Mark['bounds']) => Mark['bounds']) => {
    setCustomMarks(prevMarks => 
      prevMarks.map(mark => ({
        ...mark,
        bounds: adjustment(mark.bounds)
      }))
    )
  }

  const handleMoveAllMarks = (direction: 'up' | 'down' | 'left' | 'right', amount: number = 10) => {
    adjustAllMarks((bounds) => {
      switch (direction) {
        case 'up':
          return { ...bounds, y: Math.max(0, bounds.y - amount) }
        case 'down':
          return { ...bounds, y: bounds.y + amount }
        case 'left':
          return { ...bounds, x: Math.max(0, bounds.x - amount) }
        case 'right':
          return { ...bounds, x: bounds.x + amount }
        default:
          return bounds
      }
    })
  }

  const handleResizeAllMarks = (type: 'increase' | 'decrease', amount: number = 10) => {
    adjustAllMarks((bounds) => {
      if (type === 'increase') {
        return {
          ...bounds,
          width: bounds.width + amount,
          height: bounds.height + amount
        }
      } else {
        return {
          ...bounds,
          width: Math.max(20, bounds.width - amount),
          height: Math.max(20, bounds.height - amount)
        }
      }
    })
  }

  const handleEnableCustomMarking = () => {
    setShowCustomMarking(true)
    setAnnotatedPreview(null)
    setAnalysisResult(null)
  }

  const getImageBounds = () => {
    if (!imageRef.current || !imageContainerRef.current) return null
    const img = imageRef.current
    const container = imageContainerRef.current
    const containerRect = container.getBoundingClientRect()
    const imgRect = img.getBoundingClientRect()
    
    // Calculate the actual image position within the container
    // Account for padding and centering
    const imgX = imgRect.left - containerRect.left
    const imgY = imgRect.top - containerRect.top
    
    return {
      containerX: containerRect.left,
      containerY: containerRect.top,
      imgX: imgRect.left,
      imgY: imgRect.top,
      imgXRelative: imgX,
      imgYRelative: imgY,
      imgWidth: imgRect.width,
      imgHeight: imgRect.height,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      scaleX: img.naturalWidth / imgRect.width,
      scaleY: img.naturalHeight / imgRect.height
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start drawing if marking mode is enabled and component is selected
    if (!isMarkingMode || !selectedComponentType || !imageRef.current || !imageContainerRef.current) return
    
    const bounds = getImageBounds()
    if (!bounds) return

    // Get mouse position relative to the container
    const containerRect = imageContainerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - containerRect.left
    const mouseY = e.clientY - containerRect.top

    // Get image position relative to container
    const imgRect = imageRef.current.getBoundingClientRect()
    const imgXInContainer = imgRect.left - containerRect.left
    const imgYInContainer = imgRect.top - containerRect.top

    // Calculate position relative to image
    const x = mouseX - imgXInContainer
    const y = mouseY - imgYInContainer

    // Check if click is within image bounds
    if (x < 0 || y < 0 || x > bounds.imgWidth || y > bounds.imgHeight) return

    setIsDrawing(true)
    setDrawStart({ x, y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !drawStart || !selectedComponentType || !imageContainerRef.current) return
    
    const bounds = getImageBounds()
    if (!bounds) return

    // Get mouse position relative to the container
    const containerRect = imageContainerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - containerRect.left
    const mouseY = e.clientY - containerRect.top

    // Get image position relative to container
    const imgRect = imageRef.current!.getBoundingClientRect()
    const imgXInContainer = imgRect.left - containerRect.left
    const imgYInContainer = imgRect.top - containerRect.top

    // Calculate position relative to image
    const x = mouseX - imgXInContainer
    const y = mouseY - imgYInContainer

    setDrawCurrent({ x, y })
  }


  const extractColorFromRegion = async (
    imgX: number,
    imgY: number,
    imgWidth: number,
    imgHeight: number
  ): Promise<string> => {
    return new Promise((resolve) => {
      if (!imageRef.current || !preview) {
        resolve('#667eea') // Default color
        return
      }

      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve('#667eea')
            return
          }

          canvas.width = img.width
          canvas.height = img.height
          ctx.drawImage(img, 0, 0)

          // Calculate actual pixel coordinates in the original image
          const scaleX = img.width / (imageRef.current?.naturalWidth || img.width)
          const scaleY = img.height / (imageRef.current?.naturalHeight || img.height)
          
          const startX = Math.max(0, Math.floor(imgX * scaleX))
          const startY = Math.max(0, Math.floor(imgY * scaleY))
          const endX = Math.min(img.width, Math.floor((imgX + imgWidth) * scaleX))
          const endY = Math.min(img.height, Math.floor((imgY + imgHeight) * scaleY))

          // Sample pixels from the region
          const sampleSize = 10
          const stepX = Math.max(1, Math.floor((endX - startX) / sampleSize))
          const stepY = Math.max(1, Math.floor((endY - startY) / sampleSize))

          let r = 0, g = 0, b = 0, count = 0

          for (let y = startY; y < endY; y += stepY) {
            for (let x = startX; x < endX; x += stepX) {
              const pixelData = ctx.getImageData(x, y, 1, 1)
              const [pr, pg, pb] = pixelData.data
              r += pr
              g += pg
              b += pb
              count++
            }
          }

          if (count > 0) {
            const avgR = Math.round(r / count)
            const avgG = Math.round(g / count)
            const avgB = Math.round(b / count)
            const color = `rgb(${avgR}, ${avgG}, ${avgB})`
            resolve(color)
          } else {
            resolve('#667eea')
          }
        } catch (error) {
          console.error('Error extracting color:', error)
          resolve('#667eea')
        }
      }
      img.onerror = () => resolve('#667eea')
      img.src = preview
    })
  }

  // Extract text from image region using canvas (basic OCR simulation)
  const extractTextFromRegion = async (
    imgX: number,
    imgY: number,
    imgWidth: number,
    imgHeight: number
  ): Promise<string> => {
    return new Promise((resolve) => {
      if (!imageRef.current || !preview) {
        resolve('Text Content')
        return
      }

      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve('Text Content')
            return
          }

          canvas.width = img.width
          canvas.height = img.height
          ctx.drawImage(img, 0, 0)

          // Calculate actual pixel coordinates
          const scaleX = img.width / (imageRef.current?.naturalWidth || img.width)
          const scaleY = img.height / (imageRef.current?.naturalHeight || img.height)
          
          const startX = Math.max(0, Math.floor(imgX * scaleX))
          const startY = Math.max(0, Math.floor(imgY * scaleY))
          const endX = Math.min(img.width, Math.floor((imgX + imgWidth) * scaleX))
          const endY = Math.min(img.height, Math.floor((imgY + imgHeight) * scaleY))

          // Extract image data from region
          const imageData = ctx.getImageData(startX, startY, endX - startX, endY - startY)
          
          // For now, return a placeholder - in production, you'd use OCR library like Tesseract.js
          // This is a simplified version that would need actual OCR implementation
          resolve('Extracted Text')
        } catch (error) {
          console.error('Error extracting text:', error)
          resolve('Text Content')
        }
      }
      img.onerror = () => resolve('Text Content')
      img.src = preview
    })
  }

  const handleMouseUp = async (e: React.MouseEvent) => {
    if (!isDrawing || !drawStart || !selectedComponentType || !imageContainerRef.current) return

    const bounds = getImageBounds()
    if (!bounds) {
      setIsDrawing(false)
      setDrawStart(null)
      setDrawCurrent(null)
      return
    }

    // Get mouse position relative to the container
    const containerRect = imageContainerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - containerRect.left
    const mouseY = e.clientY - containerRect.top

    // Get image position relative to container
    const imgRect = imageRef.current!.getBoundingClientRect()
    const imgXInContainer = imgRect.left - containerRect.left
    const imgYInContainer = imgRect.top - containerRect.top

    // Calculate position relative to image
    const endX = mouseX - imgXInContainer
    const endY = mouseY - imgYInContainer

    const x = Math.min(drawStart.x, endX)
    const y = Math.min(drawStart.y, endY)
    const width = Math.abs(endX - drawStart.x)
    const height = Math.abs(endY - drawStart.y)

    if (width > 10 && height > 10) {
      const markBounds = {
        x: x * bounds.scaleX,
        y: y * bounds.scaleY,
        width: width * bounds.scaleX,
        height: height * bounds.scaleY
      }

      // Extract color from the marked region
      const extractedColor = await extractColorFromRegion(
        markBounds.x,
        markBounds.y,
        markBounds.width,
        markBounds.height
      )

      // Determine component type and name from selected component
      const componentParts = selectedComponentType.split('|')
      const componentType = componentParts[0] as 'graph' | 'card' | 'text' | 'image' | 'button' | 'input' | 'container'
      const componentName = componentParts[1] || ''

      // Extract text if it's a text component
      let extractedText: string | undefined
      if (componentType === 'text') {
        extractedText = await extractTextFromRegion(
          markBounds.x,
          markBounds.y,
          markBounds.width,
          markBounds.height
        )
      }

      let newMark: Mark = {
        id: `mark-${Date.now()}-${Math.random()}`,
        type: componentType,
        componentName: componentName,
        bounds: markBounds,
        color: extractedColor,
        extractedText: extractedText
      }

      setCustomMarks([...customMarks, newMark])
    }

    setIsDrawing(false)
    setDrawStart(null)
    setDrawCurrent(null)
  }

  const handleDeleteMark = (id: string) => {
    setCustomMarks(customMarks.filter(m => m.id !== id))
    setSelectedMarkId(null)
  }

  const handleSelectMark = (id: string) => {
    setSelectedMarkId(id === selectedMarkId ? null : id)
  }

  const convertMarksToComponents = () => {
    if (!currentFile || customMarks.length === 0) return

    const detectedElements = customMarks.map(mark => ({
      type: mark.type,
      bounds: mark.bounds,
      content: mark.type === 'text' ? 'Text Content' : mark.type === 'button' ? 'Button' : undefined,
      chartType: mark.type === 'graph' && mark.componentName 
        ? getChartTypeFromComponentName(mark.componentName) 
        : mark.type === 'graph' ? 'line' : undefined,
      chartData: mark.type === 'graph' ? {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        datasets: [
          { label: "Series 1", data: [10, 20, 15, 25, 30, 28] },
          { label: "Series 2", data: [5, 15, 10, 20, 25, 22] }
        ]
      } : undefined
    }))

    // Create components from marks
    const components = analyzeImageAndGenerateComponents(currentFile)
    // This will be handled by the onUpload callback
    return detectedElements
  }

  const handleGenerateFromMarks = async () => {
    if (!currentFile || customMarks.length === 0) return

    setUploading(true)
    try {
      // Convert marks to detected elements format with extracted colors and component names
      const detectedElements = customMarks.map(mark => ({
        type: mark.type,
        bounds: mark.bounds,
        componentName: mark.componentName, // Include component name
        content: mark.type === 'text' ? (mark.extractedText || 'Text Content') : mark.type === 'button' ? 'Button' : undefined,
        chartType: mark.type === 'graph' && mark.componentName 
          ? getChartTypeFromComponentName(mark.componentName) 
          : mark.type === 'graph' ? 'line' : undefined,
        chartData: mark.type === 'graph' ? {
          labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
          datasets: [
            { label: "Series 1", data: [10, 20, 15, 25, 30, 28] },
            { label: "Series 2", data: [5, 15, 10, 20, 25, 22] }
          ]
        } : undefined,
        color: mark.color // Include extracted color from marked region
      }))

      // Create analysis result from custom marks
      const analysisResult: ImageAnalysisResult = {
        components: [],
        detectedElements: detectedElements as any
      }

      // Import the conversion function
      const { convertAnalysisToComponents } = await import('../../services/imageAnalysis')
      
      // Convert to components using the existing logic
      const components = convertAnalysisToComponents(analysisResult)
      
      // Dispatch custom event with components for Editor to handle
      window.dispatchEvent(new CustomEvent('customMarksGenerated', { 
        detail: { components } 
      }))
      
      // Close modal - Editor will handle the components via the event
      onClose()
      setUploading(false)
    } catch (error) {
      console.error('Failed to generate from marks:', error)
      // Toast will be handled by parent component
      setUploading(false)
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="image-upload-modal-overlay" onClick={onClose}>
      <div className="image-upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="image-upload-modal-header">
          <h2>Upload Dashboard Image</h2>
          <button className="image-upload-modal-close" onClick={onClose}>
            <FiX />
          </button>
        </div>
        <div className="image-upload-modal-content">
          {showCustomMarking && preview ? (
            <div className="custom-marking-container">
              <div className="marking-toolbar">
                <h3>Marking Tools</h3>
                <div className="marking-controls">
                  <div className="component-select-wrapper">
                    <label htmlFor="component-select">Select Component:</label>
                    <select
                      id="component-select"
                      className="component-select"
                      value={selectedComponentType}
                      onChange={(e) => {
                        setSelectedComponentType(e.target.value)
                        setIsMarkingMode(!!e.target.value)
                      }}
                      disabled={isAdjustingMode}
                    >
                      <option value="">-- Select Component --</option>
                      <optgroup label="Charts">
                        {PREBUILT_COMPONENTS.filter(c => c.type === 'graph').map(comp => (
                          <option key={comp.value} value={comp.value}>{comp.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Cards">
                        {PREBUILT_COMPONENTS.filter(c => c.type === 'card').map(comp => (
                          <option key={comp.value} value={comp.value}>{comp.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Other">
                        {PREBUILT_COMPONENTS.filter(c => !['graph', 'card'].includes(c.type)).map(comp => (
                          <option key={comp.value} value={comp.value}>{comp.label}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                  {customMarks.length > 0 && (
                    <div className="marks-count">
                      {customMarks.length} mark(s) created
                    </div>
                  )}
                </div>
                {customMarks.length > 0 && (
                  <div className="adjustment-controls">
                    <button
                      className={`adjustment-toggle ${isAdjustingMode ? 'active' : ''}`}
                      onClick={() => {
                        setIsAdjustingMode(!isAdjustingMode)
                        if (!isAdjustingMode) {
                          setIsMarkingMode(false)
                          setSelectedComponentType('')
                        }
                      }}
                      title="Toggle adjustment mode"
                    >
                      <FiMove /> {isAdjustingMode ? 'Exit Adjust' : 'Adjust All'}
                    </button>
                    {isAdjustingMode && (
                      <div className="adjustment-buttons">
                        <div className="adjustment-group">
                          <label>Move All:</label>
                          <button onClick={() => handleMoveAllMarks('up')} title="Move all up">
                            <FiArrowUp />
                          </button>
                          <button onClick={() => handleMoveAllMarks('down')} title="Move all down">
                            <FiArrowDown />
                          </button>
                          <button onClick={() => handleMoveAllMarks('left')} title="Move all left">
                            <FiArrowLeft />
                          </button>
                          <button onClick={() => handleMoveAllMarks('right')} title="Move all right">
                            <FiArrowRight />
                          </button>
                        </div>
                        <div className="adjustment-group">
                          <label>Resize All:</label>
                          <button onClick={() => handleResizeAllMarks('increase')} title="Increase all sizes">
                            <FiMaximize2 />
                          </button>
                          <button onClick={() => handleResizeAllMarks('decrease')} title="Decrease all sizes">
                            <FiMinimize2 />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div
                ref={imageContainerRef}
                className="marking-image-container"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => {
                  setIsDrawing(false)
                  setDrawStart(null)
                  setDrawCurrent(null)
                }}
              >
                <img
                  ref={imageRef}
                  src={preview}
                  alt="Marking Preview"
                  className="marking-image"
                  draggable={false}
                />
                {/* Draw selection rectangle */}
                {isDrawing && drawStart && drawCurrent && selectedComponentType && (() => {
                  const bounds = getImageBounds()
                  if (!bounds || !imageContainerRef.current) return null
                  
                  const containerRect = imageContainerRef.current.getBoundingClientRect()
                  const imgRect = imageRef.current!.getBoundingClientRect()
                  const imgXInContainer = imgRect.left - containerRect.left
                  const imgYInContainer = imgRect.top - containerRect.top
                  
                  return (
                    <div
                      className="drawing-rectangle"
                      style={{
                        left: `${imgXInContainer + Math.min(drawStart.x, drawCurrent.x)}px`,
                        top: `${imgYInContainer + Math.min(drawStart.y, drawCurrent.y)}px`,
                        width: `${Math.abs(drawCurrent.x - drawStart.x)}px`,
                        height: `${Math.abs(drawCurrent.y - drawStart.y)}px`
                      }}
                    />
                  )
                })()}
                {/* Render marks */}
                {customMarks.map((mark) => {
                  const bounds = getImageBounds()
                  if (!bounds || !imageRef.current) return null
                  
                  // Calculate scale from natural image size to displayed size
                  const scaleX = bounds.imgWidth / bounds.naturalWidth
                  const scaleY = bounds.imgHeight / bounds.naturalHeight
                  
                  // Get image position relative to container
                  const containerRect = imageContainerRef.current?.getBoundingClientRect()
                  const imgRect = imageRef.current.getBoundingClientRect()
                  const imgXInContainer = containerRect ? imgRect.left - containerRect.left : 0
                  const imgYInContainer = containerRect ? imgRect.top - containerRect.top : 0
                  
                  // Use extracted color for the mark box border
                  const markColor = mark.color || '#667eea'
                  
                  return (
                    <div
                      key={mark.id}
                      className={`mark-box ${mark.id === selectedMarkId ? 'selected' : ''}`}
                      data-type={mark.type}
                      style={{
                        left: `${imgXInContainer + (mark.bounds.x * scaleX)}px`,
                        top: `${imgYInContainer + (mark.bounds.y * scaleY)}px`,
                        width: `${mark.bounds.width * scaleX}px`,
                        height: `${mark.bounds.height * scaleY}px`,
                        borderColor: markColor,
                        backgroundColor: `${markColor}20`,
                        borderWidth: '2px',
                        borderStyle: 'solid'
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSelectMark(mark.id)
                      }}
                    >
                      <div className="mark-label" style={{ backgroundColor: markColor, borderColor: markColor }}>
                        <FiTag size={12} style={{ marginRight: '4px' }} />
                        {mark.componentName || mark.type.toUpperCase()}
                      </div>
                      {mark.id === selectedMarkId && (
                        <button
                          className="mark-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteMark(mark.id)
                          }}
                        >
                          <FiTrash2 />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="marking-actions">
                <button className="btn-secondary" onClick={() => {
                  setShowCustomMarking(false)
                  setCustomMarks([])
                  setSelectedComponentType('')
                  setIsMarkingMode(false)
                }}>
                  <FiX /> Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={handleGenerateFromMarks}
                  disabled={uploading || customMarks.length === 0}
                >
                  {uploading ? (
                    <>
                      <FiLoader className="spinner-small" /> Generating...
                    </>
                  ) : (
                    <>
                      <FiSave /> Generate from Marks ({customMarks.length})
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : annotatedPreview ? (
            <div className="image-upload-annotated-preview">
              <div className="annotated-preview-header">
                <h3>Detected Components Preview</h3>
                <p className="detected-count">
                  {analysisResult?.detectedElements?.length || 0} component(s) detected
                </p>
              </div>
              <div className="annotated-image-container">
                <img src={annotatedPreview} alt="Annotated Preview" className="annotated-image" />
              </div>
              {analysisResult?.detectedElements && analysisResult.detectedElements.length > 0 && (
                <div className="detected-elements-list">
                  <h4>Detected Elements:</h4>
                  <div className="elements-grid">
                    {analysisResult.detectedElements.map((element, idx) => (
                      <div key={idx} className="element-badge" data-type={element.type}>
                        <span className="element-type">{element.type}</span>
                        <span className="element-bounds">
                          {element.bounds.width}×{element.bounds.height}px
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="annotated-preview-actions">
                <button className="btn-secondary" onClick={handleReset}>
                  <FiRefreshCw /> Select Different Image
                </button>
                <button 
                  className="btn-secondary" 
                  onClick={handleEnableCustomMarking}
                >
                  <FiEdit2 /> Custom Marking
                </button>
                {analysisResult && analysisResult.detectedElements && analysisResult.detectedElements.length > 0 && (
                  <button 
                    className="btn-secondary" 
                    onClick={handleAutoMarking}
                    title="Automatically mark detected components"
                  >
                    <FiZap /> Auto Marking
                  </button>
                )}
                <button 
                  className="btn-primary" 
                  onClick={handleGenerateComponents}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <FiLoader className="spinner-small" /> Generating Components...
                    </>
                  ) : (
                    <>
                      <FiCheck /> Generate Components
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`image-upload-dropzone ${dragActive ? 'active' : ''} ${analyzing ? 'uploading' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={!analyzing ? handleClick : undefined}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
              {analyzing ? (
                <div className="image-upload-loading">
                  <FiLoader className="spinner" />
                  <p>Analyzing image and detecting components...</p>
                  <p className="upload-hint">This may take a few moments</p>
                </div>
              ) : preview ? (
                <div className="image-upload-preview">
                  <img src={preview} alt="Preview" />
                  <p>Click to select a different image</p>
                  <button 
                    className="btn-secondary" 
                    onClick={handleEnableCustomMarking}
                    style={{ marginTop: '1rem' }}
                  >
                    <FiEdit2 /> Use Custom Marking Tools
                  </button>
                </div>
              ) : (
                <div className="image-upload-placeholder">
                  <FiUpload className="upload-icon" />
                  <p>Drag and drop an image here, or click to select</p>
                  <p className="upload-hint">Supported formats: JPG, PNG, GIF, WebP</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ImageUploadModal


