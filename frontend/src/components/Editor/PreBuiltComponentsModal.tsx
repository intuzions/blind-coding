import React, { useState, useEffect, useRef } from 'react'
import { useDrag } from 'react-dnd'
import { FiX, FiGrid, FiSquare, FiUser, FiTrendingUp, FiDollarSign, FiActivity, FiUsers, FiImage, FiZap, FiEdit3, FiMenu, FiDatabase } from 'react-icons/fi'
import './PreBuiltComponentsModal.css'

// Extend Window interface for Google Charts
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
  }
}

interface ChartComponent {
  type: string
  label: string
  icon: React.ReactNode
  defaultProps: any
}

interface CardComponent {
  type: string
  label: string
  icon: React.ReactNode
  defaultProps: any
  preview: React.ReactNode
}

interface LogoComponent {
  type: string
  label: string
  icon: React.ReactNode
  defaultProps: any
  preview: React.ReactNode
}

interface ButtonComponent {
  type: string
  label: string
  icon: React.ReactNode
  defaultProps: any
  preview: React.ReactNode
}

interface InputComponent {
  type: string
  label: string
  icon: React.ReactNode
  defaultProps: any
  preview: React.ReactNode
}

interface NavbarComponent {
  type: string
  label: string
  icon: React.ReactNode
  defaultProps: any
  preview: React.ReactNode
}

interface TableComponent {
  type: string
  label: string
  icon: React.ReactNode
  defaultProps: any
  preview: React.ReactNode
}

interface LoginComponent {
  type: string
  label: string
  icon: React.ReactNode
  defaultProps: any
  preview: React.ReactNode
}

interface SignupComponent {
  type: string
  label: string
  icon: React.ReactNode
  defaultProps: any
  preview: React.ReactNode
}

interface PreBuiltComponentsModalProps {
  isOpen: boolean
  onClose: () => void
}

const ChartPreview = ({ chartType, chartData }: { chartType: string; chartData: any }) => {
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartRef.current || !chartData) return

    const loadGoogleCharts = () => {
      if (window.google && window.google.visualization) {
        renderChart()
        return
      }

      if (window.google && window.google.charts) {
        window.google.charts.setOnLoadCallback(() => {
          renderChart()
        })
        return
      }

      const existingScript = document.querySelector('script[src="https://www.gstatic.com/charts/loader.js"]')
      if (existingScript) {
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
        console.log('ChartPreview: Missing prerequisites', {
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

        if (chartType.toLowerCase() === 'candlestick') {
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
          if (chartData.labels && chartData.datasets && chartData.datasets[0]?.data) {
            // First, determine column types by examining the first row of data
            const firstRow = chartData.datasets[0].data[0]
            if (Array.isArray(firstRow) && firstRow.length === chartData.labels.length) {
              // Add columns with appropriate types based on first row data
              chartData.labels.forEach((label: string, index: number) => {
                const value = firstRow[index]
                // Determine type: number if it's a number, string otherwise
                const columnType = typeof value === 'number' ? 'number' : 'string'
                data.addColumn(columnType, label)
              })
              
              // Add all rows
              chartData.datasets[0].data.forEach((row: any[]) => {
                if (Array.isArray(row)) {
                  data.addRow(row)
                  hasData = true
                }
              })
            } else {
              // Fallback: if structure doesn't match, treat all as string
              chartData.labels.forEach((label: string) => {
                data.addColumn('string', label)
              })
              chartData.datasets[0].data.forEach((row: any[]) => {
                if (Array.isArray(row)) {
                  // Convert all values to strings for safety
                  data.addRow(row.map((val: any) => String(val)))
                  hasData = true
                }
              })
            }
          }
        } else if (chartData.labels && chartData.datasets) {
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
          data.addColumn('string', 'Label')
          data.addColumn('number', 'Value')
          chartData.forEach((item: any) => {
            data.addRow([item.label || item[0], item.value || item[1]])
            hasData = true
          })
        }

        if (!hasData || data.getNumberOfRows() === 0) {
          console.log('ChartPreview: No data to render', { chartType, hasData, rows: data.getNumberOfRows() })
          return
        }

        const containerWidth = chartRef.current.offsetWidth || 200
        const containerHeight = chartRef.current.offsetHeight || 150

        let chart: any
        const options: any = {
          title: '',
          width: containerWidth,
          height: containerHeight,
          backgroundColor: 'transparent',
          legend: { position: 'none' },
          chartArea: { width: '85%', height: '85%', left: '10%', top: '5%' },
          hAxis: { textStyle: { fontSize: 10 } },
          vAxis: { textStyle: { fontSize: 10 } }
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

        chart.draw(data, options)
        console.log('ChartPreview: Rendered successfully', { chartType, rows: data.getNumberOfRows() })
      } catch (error) {
        console.error('Error rendering chart preview:', error, { chartType, chartData })
      }
    }

    loadGoogleCharts()

    return () => {
      if (chartRef.current) {
        chartRef.current.innerHTML = ''
      }
    }
  }, [chartType, chartData])

  return (
    <div 
      ref={chartRef} 
      style={{ 
        width: '200px', 
        height: '150px',
        minWidth: '200px',
        minHeight: '150px'
      }} 
    />
  )
}

const ChartComponentItem = ({ component }: { component: ChartComponent }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: { type: component.type, props: component.defaultProps },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  const chartType = component.defaultProps?.['data-chart-type']
  const chartDataStr = component.defaultProps?.['data-chart-data']
  let chartData = null

  try {
    if (chartDataStr) {
      chartData = typeof chartDataStr === 'string' ? JSON.parse(chartDataStr) : chartDataStr
    }
  } catch (error) {
    console.error('Error parsing chart data:', error)
  }

  return (
    <div
      ref={drag}
      className={`prebuilt-component-item ${isDragging ? 'dragging' : ''}`}
      style={{ cursor: 'grab' }}
    >
      <div className="prebuilt-component-preview" style={{ pointerEvents: 'none' }}>
        {chartData && chartType ? (
          <ChartPreview chartType={chartType} chartData={chartData} />
        ) : (
          <div className="prebuilt-component-placeholder">
            <FiGrid size={40} />
          </div>
        )}
      </div>
      <div className="prebuilt-component-label">{component.label}</div>
    </div>
  )
}

const CardPreview = ({ cardType }: { cardType: string }) => {
  const cardStyles: { [key: string]: React.CSSProperties } = {
    user: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '20px',
      borderRadius: '12px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '10px',
      width: '200px',
      height: '150px',
      justifyContent: 'center'
    },
    stats: {
      background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      color: 'white',
      padding: '20px',
      borderRadius: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      width: '200px',
      height: '150px',
      justifyContent: 'center'
    },
    revenue: {
      background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      color: 'white',
      padding: '20px',
      borderRadius: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      width: '200px',
      height: '150px',
      justifyContent: 'center'
    },
    activity: {
      background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      color: 'white',
      padding: '20px',
      borderRadius: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      width: '200px',
      height: '150px',
      justifyContent: 'center'
    }
  }

  const style = cardStyles[cardType] || cardStyles.user

  return (
    <div style={style}>
      {cardType === 'user' && (
        <>
          <FiUser size={32} />
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>1,234</div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>Total Users</div>
        </>
      )}
      {cardType === 'stats' && (
        <>
          <FiTrendingUp size={32} />
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>+12.5%</div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>Growth Rate</div>
        </>
      )}
      {cardType === 'revenue' && (
        <>
          <FiDollarSign size={32} />
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>$45,678</div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>Total Revenue</div>
        </>
      )}
      {cardType === 'activity' && (
        <>
          <FiActivity size={32} />
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>892</div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>Active Users</div>
        </>
      )}
      {cardType === 'user-group' && (
        <>
          <FiUsers size={32} />
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>156</div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>User Groups</div>
        </>
      )}
    </div>
  )
}

const CardComponentItem = ({ component }: { component: CardComponent }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: { type: component.type, props: component.defaultProps },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  return (
    <div
      ref={drag}
      className={`prebuilt-component-item ${isDragging ? 'dragging' : ''}`}
      style={{ cursor: 'grab' }}
    >
      <div className="prebuilt-component-preview" style={{ pointerEvents: 'none' }}>
        {component.preview}
      </div>
      <div className="prebuilt-component-label">{component.label}</div>
    </div>
  )
}

const LogoComponentItem = ({ component }: { component: LogoComponent }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: { type: component.type, props: component.defaultProps },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  return (
    <div
      ref={drag}
      className={`prebuilt-component-item ${isDragging ? 'dragging' : ''}`}
      style={{ cursor: 'grab' }}
    >
      <div className="prebuilt-component-preview" style={{ pointerEvents: 'none' }}>
        {component.preview}
      </div>
      <div className="prebuilt-component-label">{component.label}</div>
    </div>
  )
}

const ButtonComponentItem = ({ component }: { component: ButtonComponent }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: { type: component.type, props: component.defaultProps },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  return (
    <div
      ref={drag}
      className={`prebuilt-component-item ${isDragging ? 'dragging' : ''}`}
      style={{ cursor: 'grab' }}
    >
      <div className="prebuilt-component-preview" style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        {component.preview}
      </div>
      <div className="prebuilt-component-label">{component.label}</div>
    </div>
  )
}

const InputComponentItem = ({ component }: { component: InputComponent }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: { type: component.type, props: component.defaultProps },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  return (
    <div
      ref={drag}
      className={`prebuilt-component-item ${isDragging ? 'dragging' : ''}`}
      style={{ cursor: 'grab' }}
    >
      <div className="prebuilt-component-preview" style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        {component.preview}
      </div>
      <div className="prebuilt-component-label">{component.label}</div>
    </div>
  )
}

const NavbarComponentItem = ({ component }: { component: NavbarComponent }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: { type: component.type, props: component.defaultProps },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  return (
    <div
      ref={drag}
      className={`prebuilt-component-item ${isDragging ? 'dragging' : ''}`}
      style={{ cursor: 'grab' }}
    >
      <div className="prebuilt-component-preview" style={{ pointerEvents: 'none', width: '100%' }}>
        {component.preview}
      </div>
      <div className="prebuilt-component-label">{component.label}</div>
    </div>
  )
}

const LoginComponentItem = ({ component }: { component: LoginComponent }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: { type: component.type, props: component.defaultProps },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  return (
    <div
      ref={drag}
      className={`prebuilt-component-item ${isDragging ? 'dragging' : ''}`}
      style={{ cursor: 'grab' }}
    >
      <div className="prebuilt-component-preview" style={{ pointerEvents: 'none', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        {component.preview}
      </div>
      <div className="prebuilt-component-label">{component.label}</div>
    </div>
  )
}

const SignupComponentItem = ({ component }: { component: SignupComponent }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: { type: component.type, props: component.defaultProps },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  return (
    <div
      ref={drag}
      className={`prebuilt-component-item ${isDragging ? 'dragging' : ''}`}
      style={{ cursor: 'grab' }}
    >
      <div className="prebuilt-component-preview" style={{ pointerEvents: 'none', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        {component.preview}
      </div>
      <div className="prebuilt-component-label">{component.label}</div>
    </div>
  )
}

const TableComponentItem = ({ component }: { component: TableComponent }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: { type: component.type, props: component.defaultProps },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  return (
    <div
      ref={drag}
      className={`prebuilt-component-item ${isDragging ? 'dragging' : ''}`}
      style={{ cursor: 'grab' }}
    >
      <div className="prebuilt-component-preview" style={{ pointerEvents: 'none', width: '100%', overflow: 'auto' }}>
        {component.preview}
      </div>
      <div className="prebuilt-component-label">{component.label}</div>
    </div>
  )
}

const PreBuiltComponentsModal: React.FC<PreBuiltComponentsModalProps> = ({ isOpen, onClose }) => {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [activeTab, setActiveTab] = useState<'charts' | 'cards' | 'logos' | 'buttons' | 'inputs' | 'navbars' | 'tables' | 'logins' | 'signups'>('charts')
  
  // Initialize position to center on first open
  useEffect(() => {
    if (isOpen && position === null && modalRef.current) {
      const centerX = (window.innerWidth - modalRef.current.offsetWidth) / 2
      const centerY = (window.innerHeight - modalRef.current.offsetHeight) / 2
      setPosition({ x: centerX, y: centerY })
    }
  }, [isOpen, position])
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const modalRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only allow dragging from the header, not from buttons
    const target = e.target as HTMLElement
    if (target.closest('.prebuilt-components-modal-close')) {
      return
    }
    
    if (modalRef.current && target.closest('.prebuilt-components-modal-header')) {
      setIsDragging(true)
      const rect = modalRef.current.getBoundingClientRect()
      // Calculate offset from mouse position to modal's top-left corner
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
      e.preventDefault()
      e.stopPropagation()
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (modalRef.current) {
        // Calculate new position: mouse position minus the offset
        const newX = e.clientX - dragOffset.x
        const newY = e.clientY - dragOffset.y
        
        // Keep modal within viewport
        const maxX = window.innerWidth - modalRef.current.offsetWidth
        const maxY = window.innerHeight - modalRef.current.offsetHeight
        
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset])

  const [cardComponents] = useState<CardComponent[]>([
    {
      type: 'div',
      label: 'User Card',
      icon: <FiUser />,
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
      },
      preview: <CardPreview cardType="user" />
    },
    {
      type: 'div',
      label: 'Stats Card',
      icon: <FiTrendingUp />,
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
      },
      preview: <CardPreview cardType="stats" />
    },
    {
      type: 'div',
      label: 'Revenue Card',
      icon: <FiDollarSign />,
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
      },
      preview: <CardPreview cardType="revenue" />
    },
    {
      type: 'div',
      label: 'Activity Card',
      icon: <FiActivity />,
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
      },
      preview: <CardPreview cardType="activity" />
    },
    {
      type: 'div',
      label: 'User Group Card',
      icon: <FiUsers />,
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
      },
      preview: <CardPreview cardType="user-group" />
    }
  ])

  const [chartComponents] = useState<ChartComponent[]>([
    {
      type: 'div',
      label: 'Line Chart',
      icon: <FiGrid />,
      defaultProps: {
        className: 'chart-container',
        'data-chart-type': 'line',
        'data-chart-data': JSON.stringify({
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [
            {
              label: 'Sales',
              data: [10, 20, 15, 25, 30, 28]
            },
            {
              label: 'Revenue',
              data: [5, 15, 10, 20, 25, 22]
            }
          ]
        }),
        style: {
          width: '500px',
          height: '300px',
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '10px'
        }
      },
    },
    {
      type: 'div',
      label: 'Bar Chart',
      icon: <FiGrid />,
      defaultProps: {
        className: 'chart-container',
        'data-chart-type': 'bar',
        'data-chart-data': JSON.stringify({
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [
            {
              label: 'Sales',
              data: [10, 20, 15, 25, 30, 28]
            },
            {
              label: 'Revenue',
              data: [5, 15, 10, 20, 25, 22]
            }
          ]
        }),
        style: {
          width: '500px',
          height: '300px',
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '10px'
        }
      },
    },
    {
      type: 'div',
      label: 'Pie Chart',
      icon: <FiGrid />,
      defaultProps: {
        className: 'chart-container',
        'data-chart-type': 'pie',
        'data-chart-data': JSON.stringify({
          labels: ['Desktop', 'Mobile', 'Tablet', 'Other'],
          datasets: [
            {
              label: 'Users',
              data: [45, 30, 15, 10]
            }
          ]
        }),
        style: {
          width: '400px',
          height: '400px',
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '10px'
        }
      },
    },
    {
      type: 'div',
      label: 'Column Chart',
      icon: <FiGrid />,
      defaultProps: {
        className: 'chart-container',
        'data-chart-type': 'column',
        'data-chart-data': JSON.stringify({
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [
            {
              label: 'Sales',
              data: [10, 20, 15, 25, 30, 28]
            },
            {
              label: 'Revenue',
              data: [5, 15, 10, 20, 25, 22]
            }
          ]
        }),
        style: {
          width: '500px',
          height: '300px',
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '10px'
        }
      },
    },
    {
      type: 'div',
      label: 'Donut Chart',
      icon: <FiGrid />,
      defaultProps: {
        className: 'chart-container',
        'data-chart-type': 'donut',
        'data-chart-data': JSON.stringify({
          labels: ['Desktop', 'Mobile', 'Tablet', 'Other'],
          datasets: [
            {
              label: 'Users',
              data: [45, 30, 15, 10]
            }
          ]
        }),
        style: {
          width: '400px',
          height: '400px',
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '10px'
        }
      },
    },
    {
      type: 'div',
      label: 'Area Chart',
      icon: <FiGrid />,
      defaultProps: {
        className: 'chart-container',
        'data-chart-type': 'area',
        'data-chart-data': JSON.stringify({
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [
            {
              label: 'Sales',
              data: [10, 20, 15, 25, 30, 28]
            },
            {
              label: 'Revenue',
              data: [5, 15, 10, 20, 25, 22]
            }
          ]
        }),
        style: {
          width: '500px',
          height: '300px',
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '10px'
        }
      },
    },
    {
      type: 'div',
      label: 'Scatter Chart',
      icon: <FiGrid />,
      defaultProps: {
        className: 'chart-container',
        'data-chart-type': 'scatter',
        'data-chart-data': JSON.stringify({
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [
            {
              label: 'Sales',
              data: [10, 20, 15, 25, 30, 28]
            },
            {
              label: 'Revenue',
              data: [5, 15, 10, 20, 25, 22]
            }
          ]
        }),
        style: {
          width: '500px',
          height: '300px',
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '10px'
        }
      },
    },
    {
      type: 'div',
      label: 'Combo Chart',
      icon: <FiGrid />,
      defaultProps: {
        className: 'chart-container',
        'data-chart-type': 'combo',
        'data-chart-data': JSON.stringify({
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [
            {
              label: 'Sales',
              data: [10, 20, 15, 25, 30, 28]
            },
            {
              label: 'Revenue',
              data: [5, 15, 10, 20, 25, 22]
            }
          ]
        }),
        style: {
          width: '500px',
          height: '300px',
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '10px'
        }
      },
    },
    {
      type: 'div',
      label: 'Histogram Chart',
      icon: <FiGrid />,
      defaultProps: {
        className: 'chart-container',
        'data-chart-type': 'histogram',
        'data-chart-data': JSON.stringify({
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [
            {
              label: 'Sales',
              data: [10, 20, 15, 25, 30, 28]
            }
          ]
        }),
        style: {
          width: '500px',
          height: '300px',
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '10px'
        }
      },
    },
    {
      type: 'div',
      label: 'Candlestick Chart',
      icon: <FiGrid />,
      defaultProps: {
        className: 'chart-container',
        'data-chart-type': 'candlestick',
        'data-chart-data': JSON.stringify({
          labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'],
          datasets: [
            {
              label: 'Stock',
              data: [
                [20, 30, 25, 35],
                [25, 35, 30, 40],
                [30, 40, 35, 45],
                [35, 45, 40, 50],
                [40, 50, 45, 55]
              ]
            }
          ]
        }),
        style: {
          width: '500px',
          height: '300px',
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '10px'
        }
      },
    },
    {
      type: 'div',
      label: 'Gauge Chart',
      icon: <FiGrid />,
      defaultProps: {
        className: 'chart-container',
        'data-chart-type': 'gauge',
        'data-chart-data': JSON.stringify({
          labels: ['Value'],
          datasets: [
            {
              label: 'Score',
              data: [75]
            }
          ]
        }),
        style: {
          width: '400px',
          height: '400px',
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '10px'
        }
      },
    },
    {
      type: 'div',
      label: 'Table Chart',
      icon: <FiGrid />,
      defaultProps: {
        className: 'chart-container',
        'data-chart-type': 'table',
        'data-chart-data': JSON.stringify({
          labels: ['Name', 'Value', 'Status'],
          datasets: [
            {
              label: 'Data',
              data: [
                ['Item 1', 100, 'Active'],
                ['Item 2', 200, 'Inactive'],
                ['Item 3', 150, 'Active'],
                ['Item 4', 300, 'Active']
              ]
            }
          ]
        }),
        style: {
          width: '500px',
          height: '300px',
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '10px'
        }
      },
    },
    {
      type: 'div',
      label: 'Stepped Area Chart',
      icon: <FiGrid />,
      defaultProps: {
        className: 'chart-container',
        'data-chart-type': 'steppedArea',
        'data-chart-data': JSON.stringify({
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [
            {
              label: 'Sales',
              data: [10, 20, 15, 25, 30, 28]
            },
            {
              label: 'Revenue',
              data: [5, 15, 10, 20, 25, 22]
            }
          ]
        }),
        style: {
          width: '500px',
          height: '300px',
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '10px'
        }
      },
    },
  ])

  const [logoComponents] = useState<LogoComponent[]>([
    {
      type: 'div',
      label: 'Tech Logo',
      icon: <FiImage />,
      defaultProps: {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '150px',
          height: '60px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '24px',
          fontWeight: 'bold',
          fontFamily: 'Arial, sans-serif',
        },
        children: 'TECH'
      },
      preview: (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '20px',
          fontWeight: 'bold',
        }}>
          TECH
        </div>
      )
    },
    {
      type: 'div',
      label: 'Brand Logo',
      icon: <FiImage />,
      defaultProps: {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '150px',
          height: '60px',
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '24px',
          fontWeight: 'bold',
          fontFamily: 'Arial, sans-serif',
        },
        children: 'BRAND'
      },
      preview: (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '20px',
          fontWeight: 'bold',
        }}>
          BRAND
        </div>
      )
    },
    {
      type: 'div',
      label: 'Studio Logo',
      icon: <FiImage />,
      defaultProps: {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '150px',
          height: '60px',
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '24px',
          fontWeight: 'bold',
          fontFamily: 'Arial, sans-serif',
        },
        children: 'STUDIO'
      },
      preview: (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '20px',
          fontWeight: 'bold',
        }}>
          STUDIO
        </div>
      )
    },
    {
      type: 'div',
      label: 'Creative Logo',
      icon: <FiImage />,
      defaultProps: {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '150px',
          height: '60px',
          background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '24px',
          fontWeight: 'bold',
          fontFamily: 'Arial, sans-serif',
        },
        children: 'CREATIVE'
      },
      preview: (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '20px',
          fontWeight: 'bold',
        }}>
          CREATIVE
        </div>
      )
    },
    {
      type: 'div',
      label: 'Design Logo',
      icon: <FiImage />,
      defaultProps: {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '150px',
          height: '60px',
          background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '24px',
          fontWeight: 'bold',
          fontFamily: 'Arial, sans-serif',
        },
        children: 'DESIGN'
      },
      preview: (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '20px',
          fontWeight: 'bold',
        }}>
          DESIGN
        </div>
      )
    },
    {
      type: 'div',
      label: 'Digital Logo',
      icon: <FiImage />,
      defaultProps: {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '150px',
          height: '60px',
          background: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '24px',
          fontWeight: 'bold',
          fontFamily: 'Arial, sans-serif',
        },
        children: 'DIGITAL'
      },
      preview: (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '20px',
          fontWeight: 'bold',
        }}>
          DIGITAL
        </div>
      )
    },
  ])

  const [buttonComponents] = useState<ButtonComponent[]>([
    {
      type: 'button',
      label: 'Glass Primary',
      icon: <FiZap />,
      defaultProps: {
        style: {
          padding: '12px 32px',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(102, 126, 234, 0.3)',
          borderRadius: '12px',
          color: '#667eea',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(102, 126, 234, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          transition: 'all 0.3s ease',
          fontFamily: 'inherit',
        },
        children: 'Glass Button'
      },
      preview: (
        <button style={{
          padding: '10px 24px',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(102, 126, 234, 0.3)',
          borderRadius: '12px',
          color: '#667eea',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(102, 126, 234, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
        }}>
          Glass Button
        </button>
      )
    },
    {
      type: 'button',
      label: 'Glass Gradient',
      icon: <FiZap />,
      defaultProps: {
        style: {
          padding: '12px 32px',
          background: 'linear-gradient(135deg, rgba(79, 172, 254, 0.25) 0%, rgba(0, 242, 254, 0.25) 100%)',
          backdropFilter: 'blur(25px) saturate(200%)',
          WebkitBackdropFilter: 'blur(25px) saturate(200%)',
          border: '1px solid rgba(79, 172, 254, 0.4)',
          borderRadius: '16px',
          color: '#4facfe',
          fontSize: '16px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 10px 40px rgba(79, 172, 254, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.4)',
          transition: 'all 0.3s ease',
          fontFamily: 'inherit',
        },
        children: 'Gradient Glass'
      },
      preview: (
        <button style={{
          padding: '10px 24px',
          background: 'linear-gradient(135deg, rgba(79, 172, 254, 0.25) 0%, rgba(0, 242, 254, 0.25) 100%)',
          backdropFilter: 'blur(25px) saturate(200%)',
          WebkitBackdropFilter: 'blur(25px) saturate(200%)',
          border: '1px solid rgba(79, 172, 254, 0.4)',
          borderRadius: '16px',
          color: '#4facfe',
          fontSize: '14px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 10px 40px rgba(79, 172, 254, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.4)',
        }}>
          Gradient Glass
        </button>
      )
    },
    {
      type: 'button',
      label: 'Glass Neon',
      icon: <FiZap />,
      defaultProps: {
        style: {
          padding: '12px 32px',
          background: 'linear-gradient(135deg, rgba(245, 87, 108, 0.2) 0%, rgba(240, 147, 251, 0.2) 100%)',
          backdropFilter: 'blur(30px) saturate(180%)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)',
          border: '2px solid rgba(245, 87, 108, 0.5)',
          borderRadius: '14px',
          color: '#f5576c',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 0 20px rgba(245, 87, 108, 0.4), 0 8px 32px rgba(245, 87, 108, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          transition: 'all 0.3s ease',
          fontFamily: 'inherit',
        },
        children: 'Neon Glass'
      },
      preview: (
        <button style={{
          padding: '10px 24px',
          background: 'linear-gradient(135deg, rgba(245, 87, 108, 0.2) 0%, rgba(240, 147, 251, 0.2) 100%)',
          backdropFilter: 'blur(30px) saturate(180%)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)',
          border: '2px solid rgba(245, 87, 108, 0.5)',
          borderRadius: '14px',
          color: '#f5576c',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 0 20px rgba(245, 87, 108, 0.4), 0 8px 32px rgba(245, 87, 108, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
        }}>
          Neon Glass
        </button>
      )
    },
    {
      type: 'button',
      label: 'Glass Success',
      icon: <FiZap />,
      defaultProps: {
        style: {
          padding: '12px 32px',
          background: 'linear-gradient(135deg, rgba(67, 233, 123, 0.2) 0%, rgba(56, 249, 215, 0.2) 100%)',
          backdropFilter: 'blur(20px) saturate(190%)',
          WebkitBackdropFilter: 'blur(20px) saturate(190%)',
          border: '1px solid rgba(67, 233, 123, 0.35)',
          borderRadius: '12px',
          color: '#43e97b',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(67, 233, 123, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
          transition: 'all 0.3s ease',
          fontFamily: 'inherit',
        },
        children: 'Success Glass'
      },
      preview: (
        <button style={{
          padding: '10px 24px',
          background: 'linear-gradient(135deg, rgba(67, 233, 123, 0.2) 0%, rgba(56, 249, 215, 0.2) 100%)',
          backdropFilter: 'blur(20px) saturate(190%)',
          WebkitBackdropFilter: 'blur(20px) saturate(190%)',
          border: '1px solid rgba(67, 233, 123, 0.35)',
          borderRadius: '12px',
          color: '#43e97b',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(67, 233, 123, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
        }}>
          Success Glass
        </button>
      )
    },
    {
      type: 'button',
      label: 'Glass Frosted',
      icon: <FiZap />,
      defaultProps: {
        style: {
          padding: '12px 32px',
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(40px) saturate(150%)',
          WebkitBackdropFilter: 'blur(40px) saturate(150%)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '18px',
          color: '#333',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
          transition: 'all 0.3s ease',
          fontFamily: 'inherit',
        },
        children: 'Frosted Glass'
      },
      preview: (
        <button style={{
          padding: '10px 24px',
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(40px) saturate(150%)',
          WebkitBackdropFilter: 'blur(40px) saturate(150%)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '18px',
          color: '#333',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
        }}>
          Frosted Glass
        </button>
      )
    },
    {
      type: 'button',
      label: 'Glass Purple',
      icon: <FiZap />,
      defaultProps: {
        style: {
          padding: '12px 32px',
          background: 'linear-gradient(135deg, rgba(118, 75, 162, 0.25) 0%, rgba(102, 126, 234, 0.25) 100%)',
          backdropFilter: 'blur(22px) saturate(175%)',
          WebkitBackdropFilter: 'blur(22px) saturate(175%)',
          border: '1.5px solid rgba(118, 75, 162, 0.4)',
          borderRadius: '15px',
          color: '#764ba2',
          fontSize: '16px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 10px 40px rgba(118, 75, 162, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.3)',
          transition: 'all 0.3s ease',
          fontFamily: 'inherit',
        },
        children: 'Purple Glass'
      },
      preview: (
        <button style={{
          padding: '10px 24px',
          background: 'linear-gradient(135deg, rgba(118, 75, 162, 0.25) 0%, rgba(102, 126, 234, 0.25) 100%)',
          backdropFilter: 'blur(22px) saturate(175%)',
          WebkitBackdropFilter: 'blur(22px) saturate(175%)',
          border: '1.5px solid rgba(118, 75, 162, 0.4)',
          borderRadius: '15px',
          color: '#764ba2',
          fontSize: '14px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 10px 40px rgba(118, 75, 162, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.3)',
        }}>
          Purple Glass
        </button>
      )
    },
    {
      type: 'button',
      label: 'Glass Cyan',
      icon: <FiZap />,
      defaultProps: {
        style: {
          padding: '12px 32px',
          background: 'linear-gradient(135deg, rgba(48, 207, 208, 0.2) 0%, rgba(51, 8, 103, 0.2) 100%)',
          backdropFilter: 'blur(28px) saturate(185%)',
          WebkitBackdropFilter: 'blur(28px) saturate(185%)',
          border: '1px solid rgba(48, 207, 208, 0.4)',
          borderRadius: '13px',
          color: '#30cfd0',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(48, 207, 208, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
          transition: 'all 0.3s ease',
          fontFamily: 'inherit',
        },
        children: 'Cyan Glass'
      },
      preview: (
        <button style={{
          padding: '10px 24px',
          background: 'linear-gradient(135deg, rgba(48, 207, 208, 0.2) 0%, rgba(51, 8, 103, 0.2) 100%)',
          backdropFilter: 'blur(28px) saturate(185%)',
          WebkitBackdropFilter: 'blur(28px) saturate(185%)',
          border: '1px solid rgba(48, 207, 208, 0.4)',
          borderRadius: '13px',
          color: '#30cfd0',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(48, 207, 208, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
        }}>
          Cyan Glass
        </button>
      )
    },
    {
      type: 'button',
      label: 'Glass Orange',
      icon: <FiZap />,
      defaultProps: {
        style: {
          padding: '12px 32px',
          background: 'linear-gradient(135deg, rgba(250, 112, 154, 0.25) 0%, rgba(254, 225, 64, 0.25) 100%)',
          backdropFilter: 'blur(24px) saturate(195%)',
          WebkitBackdropFilter: 'blur(24px) saturate(195%)',
          border: '1.5px solid rgba(250, 112, 154, 0.45)',
          borderRadius: '16px',
          color: '#fa709a',
          fontSize: '16px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 10px 40px rgba(250, 112, 154, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.35)',
          transition: 'all 0.3s ease',
          fontFamily: 'inherit',
        },
        children: 'Orange Glass'
      },
      preview: (
        <button style={{
          padding: '10px 24px',
          background: 'linear-gradient(135deg, rgba(250, 112, 154, 0.25) 0%, rgba(254, 225, 64, 0.25) 100%)',
          backdropFilter: 'blur(24px) saturate(195%)',
          WebkitBackdropFilter: 'blur(24px) saturate(195%)',
          border: '1.5px solid rgba(250, 112, 154, 0.45)',
          borderRadius: '16px',
          color: '#fa709a',
          fontSize: '14px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 10px 40px rgba(250, 112, 154, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.35)',
        }}>
          Orange Glass
        </button>
      )
    },
    {
      type: 'button',
      label: 'Glass Minimal',
      icon: <FiZap />,
      defaultProps: {
        style: {
          padding: '12px 32px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(35px) saturate(140%)',
          WebkitBackdropFilter: 'blur(35px) saturate(140%)',
          border: '1px solid rgba(200, 200, 200, 0.25)',
          borderRadius: '10px',
          color: '#666',
          fontSize: '16px',
          fontWeight: '500',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
          transition: 'all 0.3s ease',
          fontFamily: 'inherit',
        },
        children: 'Minimal Glass'
      },
      preview: (
        <button style={{
          padding: '10px 24px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(35px) saturate(140%)',
          WebkitBackdropFilter: 'blur(35px) saturate(140%)',
          border: '1px solid rgba(200, 200, 200, 0.25)',
          borderRadius: '10px',
          color: '#666',
          fontSize: '14px',
          fontWeight: '500',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
        }}>
          Minimal Glass
        </button>
      )
    },
    {
      type: 'button',
      label: 'Glass Dark',
      icon: <FiZap />,
      defaultProps: {
        style: {
          padding: '12px 32px',
          background: 'rgba(0, 0, 0, 0.2)',
          backdropFilter: 'blur(30px) saturate(160%)',
          WebkitBackdropFilter: 'blur(30px) saturate(160%)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '14px',
          color: '#fff',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
          transition: 'all 0.3s ease',
          fontFamily: 'inherit',
        },
        children: 'Dark Glass'
      },
      preview: (
        <button style={{
          padding: '10px 24px',
          background: 'rgba(0, 0, 0, 0.2)',
          backdropFilter: 'blur(30px) saturate(160%)',
          WebkitBackdropFilter: 'blur(30px) saturate(160%)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '14px',
          color: '#fff',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
        }}>
          Dark Glass
        </button>
      )
    },
    {
      type: 'button',
      label: 'Glass Electric',
      icon: <FiZap />,
      defaultProps: {
        style: {
          padding: '12px 32px',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(79, 172, 254, 0.3) 100%)',
          backdropFilter: 'blur(26px) saturate(200%)',
          WebkitBackdropFilter: 'blur(26px) saturate(200%)',
          border: '2px solid rgba(102, 126, 234, 0.5)',
          borderRadius: '17px',
          color: '#667eea',
          fontSize: '16px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 0 30px rgba(102, 126, 234, 0.5), 0 10px 40px rgba(79, 172, 254, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.4)',
          transition: 'all 0.3s ease',
          fontFamily: 'inherit',
        },
        children: 'Electric Glass'
      },
      preview: (
        <button style={{
          padding: '10px 24px',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(79, 172, 254, 0.3) 100%)',
          backdropFilter: 'blur(26px) saturate(200%)',
          WebkitBackdropFilter: 'blur(26px) saturate(200%)',
          border: '2px solid rgba(102, 126, 234, 0.5)',
          borderRadius: '17px',
          color: '#667eea',
          fontSize: '14px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 0 30px rgba(102, 126, 234, 0.5), 0 10px 40px rgba(79, 172, 254, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.4)',
        }}>
          Electric Glass
        </button>
      )
    },
    {
      type: 'button',
      label: 'Glass Rounded',
      icon: <FiZap />,
      defaultProps: {
        style: {
          padding: '12px 32px',
          background: 'linear-gradient(135deg, rgba(240, 147, 251, 0.2) 0%, rgba(245, 87, 108, 0.2) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(240, 147, 251, 0.35)',
          borderRadius: '50px',
          color: '#f093fb',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(240, 147, 251, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          transition: 'all 0.3s ease',
          fontFamily: 'inherit',
        },
        children: 'Rounded Glass'
      },
      preview: (
        <button style={{
          padding: '10px 24px',
          background: 'linear-gradient(135deg, rgba(240, 147, 251, 0.2) 0%, rgba(245, 87, 108, 0.2) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(240, 147, 251, 0.35)',
          borderRadius: '50px',
          color: '#f093fb',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(240, 147, 251, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
        }}>
          Rounded Glass
        </button>
      )
    },
  ])

  const [inputComponents] = useState<InputComponent[]>([
    {
      type: 'input',
      label: 'Glass Input',
      icon: <FiEdit3 />,
      defaultProps: {
        type: 'text',
        placeholder: 'Enter text...',
        style: {
          padding: '12px 20px',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.1) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(102, 126, 234, 0.3)',
          borderRadius: '12px',
          color: '#333',
          fontSize: '16px',
          fontFamily: 'inherit',
          outline: 'none',
          width: '100%',
          boxShadow: '0 4px 16px rgba(102, 126, 234, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          transition: 'all 0.3s ease',
        }
      },
      preview: (
        <input
          type="text"
          placeholder="Enter text..."
          style={{
            padding: '10px 16px',
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.1) 100%)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(102, 126, 234, 0.3)',
            borderRadius: '12px',
            color: '#333',
            fontSize: '14px',
            width: '200px',
            outline: 'none',
            boxShadow: '0 4px 16px rgba(102, 126, 234, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          }}
          readOnly
        />
      )
    },
    {
      type: 'input',
      label: 'Frosted Input',
      icon: <FiEdit3 />,
      defaultProps: {
        type: 'text',
        placeholder: 'Enter text...',
        style: {
          padding: '12px 20px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(40px) saturate(150%)',
          WebkitBackdropFilter: 'blur(40px) saturate(150%)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '16px',
          color: '#333',
          fontSize: '16px',
          fontFamily: 'inherit',
          outline: 'none',
          width: '100%',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
          transition: 'all 0.3s ease',
        }
      },
      preview: (
        <input
          type="text"
          placeholder="Enter text..."
          style={{
            padding: '10px 16px',
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(40px) saturate(150%)',
            WebkitBackdropFilter: 'blur(40px) saturate(150%)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '16px',
            color: '#333',
            fontSize: '14px',
            width: '200px',
            outline: 'none',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
          }}
          readOnly
        />
      )
    },
    {
      type: 'input',
      label: 'Neon Input',
      icon: <FiEdit3 />,
      defaultProps: {
        type: 'text',
        placeholder: 'Enter text...',
        style: {
          padding: '12px 20px',
          background: 'linear-gradient(135deg, rgba(245, 87, 108, 0.15) 0%, rgba(240, 147, 251, 0.15) 100%)',
          backdropFilter: 'blur(25px) saturate(180%)',
          WebkitBackdropFilter: 'blur(25px) saturate(180%)',
          border: '2px solid rgba(245, 87, 108, 0.4)',
          borderRadius: '14px',
          color: '#f5576c',
          fontSize: '16px',
          fontFamily: 'inherit',
          outline: 'none',
          width: '100%',
          boxShadow: '0 0 20px rgba(245, 87, 108, 0.3), 0 4px 16px rgba(245, 87, 108, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          transition: 'all 0.3s ease',
        }
      },
      preview: (
        <input
          type="text"
          placeholder="Enter text..."
          style={{
            padding: '10px 16px',
            background: 'linear-gradient(135deg, rgba(245, 87, 108, 0.15) 0%, rgba(240, 147, 251, 0.15) 100%)',
            backdropFilter: 'blur(25px) saturate(180%)',
            WebkitBackdropFilter: 'blur(25px) saturate(180%)',
            border: '2px solid rgba(245, 87, 108, 0.4)',
            borderRadius: '14px',
            color: '#f5576c',
            fontSize: '14px',
            width: '200px',
            outline: 'none',
            boxShadow: '0 0 20px rgba(245, 87, 108, 0.3), 0 4px 16px rgba(245, 87, 108, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          }}
          readOnly
        />
      )
    },
    {
      type: 'input',
      label: 'Cyan Input',
      icon: <FiEdit3 />,
      defaultProps: {
        type: 'text',
        placeholder: 'Enter text...',
        style: {
          padding: '12px 20px',
          background: 'linear-gradient(135deg, rgba(79, 172, 254, 0.2) 0%, rgba(0, 242, 254, 0.2) 100%)',
          backdropFilter: 'blur(22px) saturate(190%)',
          WebkitBackdropFilter: 'blur(22px) saturate(190%)',
          border: '1px solid rgba(79, 172, 254, 0.35)',
          borderRadius: '13px',
          color: '#4facfe',
          fontSize: '16px',
          fontFamily: 'inherit',
          outline: 'none',
          width: '100%',
          boxShadow: '0 6px 24px rgba(79, 172, 254, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
          transition: 'all 0.3s ease',
        }
      },
      preview: (
        <input
          type="text"
          placeholder="Enter text..."
          style={{
            padding: '10px 16px',
            background: 'linear-gradient(135deg, rgba(79, 172, 254, 0.2) 0%, rgba(0, 242, 254, 0.2) 100%)',
            backdropFilter: 'blur(22px) saturate(190%)',
            WebkitBackdropFilter: 'blur(22px) saturate(190%)',
            border: '1px solid rgba(79, 172, 254, 0.35)',
            borderRadius: '13px',
            color: '#4facfe',
            fontSize: '14px',
            width: '200px',
            outline: 'none',
            boxShadow: '0 6px 24px rgba(79, 172, 254, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
          }}
          readOnly
        />
      )
    },
    {
      type: 'input',
      label: 'Purple Input',
      icon: <FiEdit3 />,
      defaultProps: {
        type: 'text',
        placeholder: 'Enter text...',
        style: {
          padding: '12px 20px',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)',
          backdropFilter: 'blur(20px) saturate(175%)',
          WebkitBackdropFilter: 'blur(20px) saturate(175%)',
          border: '1.5px solid rgba(102, 126, 234, 0.4)',
          borderRadius: '15px',
          color: '#667eea',
          fontSize: '16px',
          fontFamily: 'inherit',
          outline: 'none',
          width: '100%',
          boxShadow: '0 8px 32px rgba(102, 126, 234, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          transition: 'all 0.3s ease',
        }
      },
      preview: (
        <input
          type="text"
          placeholder="Enter text..."
          style={{
            padding: '10px 16px',
            background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)',
            backdropFilter: 'blur(20px) saturate(175%)',
            WebkitBackdropFilter: 'blur(20px) saturate(175%)',
            border: '1.5px solid rgba(102, 126, 234, 0.4)',
            borderRadius: '15px',
            color: '#667eea',
            fontSize: '14px',
            width: '200px',
            outline: 'none',
            boxShadow: '0 8px 32px rgba(102, 126, 234, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          }}
          readOnly
        />
      )
    },
    {
      type: 'input',
      label: 'Green Input',
      icon: <FiEdit3 />,
      defaultProps: {
        type: 'text',
        placeholder: 'Enter text...',
        style: {
          padding: '12px 20px',
          background: 'linear-gradient(135deg, rgba(67, 233, 123, 0.2) 0%, rgba(56, 249, 215, 0.2) 100%)',
          backdropFilter: 'blur(18px) saturate(185%)',
          WebkitBackdropFilter: 'blur(18px) saturate(185%)',
          border: '1px solid rgba(67, 233, 123, 0.35)',
          borderRadius: '12px',
          color: '#43e97b',
          fontSize: '16px',
          fontFamily: 'inherit',
          outline: 'none',
          width: '100%',
          boxShadow: '0 6px 24px rgba(67, 233, 123, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          transition: 'all 0.3s ease',
        }
      },
      preview: (
        <input
          type="text"
          placeholder="Enter text..."
          style={{
            padding: '10px 16px',
            background: 'linear-gradient(135deg, rgba(67, 233, 123, 0.2) 0%, rgba(56, 249, 215, 0.2) 100%)',
            backdropFilter: 'blur(18px) saturate(185%)',
            WebkitBackdropFilter: 'blur(18px) saturate(185%)',
            border: '1px solid rgba(67, 233, 123, 0.35)',
            borderRadius: '12px',
            color: '#43e97b',
            fontSize: '14px',
            width: '200px',
            outline: 'none',
            boxShadow: '0 6px 24px rgba(67, 233, 123, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          }}
          readOnly
        />
      )
    },
    {
      type: 'input',
      label: 'Minimal Input',
      icon: <FiEdit3 />,
      defaultProps: {
        type: 'text',
        placeholder: 'Enter text...',
        style: {
          padding: '12px 20px',
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(30px) saturate(140%)',
          WebkitBackdropFilter: 'blur(30px) saturate(140%)',
          border: '1px solid rgba(200, 200, 200, 0.3)',
          borderRadius: '10px',
          color: '#666',
          fontSize: '16px',
          fontFamily: 'inherit',
          outline: 'none',
          width: '100%',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
          transition: 'all 0.3s ease',
        }
      },
      preview: (
        <input
          type="text"
          placeholder="Enter text..."
          style={{
            padding: '10px 16px',
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(30px) saturate(140%)',
            WebkitBackdropFilter: 'blur(30px) saturate(140%)',
            border: '1px solid rgba(200, 200, 200, 0.3)',
            borderRadius: '10px',
            color: '#666',
            fontSize: '14px',
            width: '200px',
            outline: 'none',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
          }}
          readOnly
        />
      )
    },
    {
      type: 'input',
      label: 'Dark Input',
      icon: <FiEdit3 />,
      defaultProps: {
        type: 'text',
        placeholder: 'Enter text...',
        style: {
          padding: '12px 20px',
          background: 'rgba(0, 0, 0, 0.25)',
          backdropFilter: 'blur(28px) saturate(160%)',
          WebkitBackdropFilter: 'blur(28px) saturate(160%)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '14px',
          color: '#fff',
          fontSize: '16px',
          fontFamily: 'inherit',
          outline: 'none',
          width: '100%',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
          transition: 'all 0.3s ease',
        }
      },
      preview: (
        <input
          type="text"
          placeholder="Enter text..."
          style={{
            padding: '10px 16px',
            background: 'rgba(0, 0, 0, 0.25)',
            backdropFilter: 'blur(28px) saturate(160%)',
            WebkitBackdropFilter: 'blur(28px) saturate(160%)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '14px',
            color: '#fff',
            fontSize: '14px',
            width: '200px',
            outline: 'none',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
          }}
          readOnly
        />
      )
    },
    {
      type: 'input',
      label: 'Rounded Input',
      icon: <FiEdit3 />,
      defaultProps: {
        type: 'text',
        placeholder: 'Enter text...',
        style: {
          padding: '12px 20px',
          background: 'linear-gradient(135deg, rgba(240, 147, 251, 0.15) 0%, rgba(245, 87, 108, 0.15) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(240, 147, 251, 0.3)',
          borderRadius: '50px',
          color: '#f093fb',
          fontSize: '16px',
          fontFamily: 'inherit',
          outline: 'none',
          width: '100%',
          boxShadow: '0 6px 24px rgba(240, 147, 251, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          transition: 'all 0.3s ease',
        }
      },
      preview: (
        <input
          type="text"
          placeholder="Enter text..."
          style={{
            padding: '10px 16px',
            background: 'linear-gradient(135deg, rgba(240, 147, 251, 0.15) 0%, rgba(245, 87, 108, 0.15) 100%)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(240, 147, 251, 0.3)',
            borderRadius: '50px',
            color: '#f093fb',
            fontSize: '14px',
            width: '200px',
            outline: 'none',
            boxShadow: '0 6px 24px rgba(240, 147, 251, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          }}
          readOnly
        />
      )
    },
    {
      type: 'input',
      label: 'Electric Input',
      icon: <FiEdit3 />,
      defaultProps: {
        type: 'text',
        placeholder: 'Enter text...',
        style: {
          padding: '12px 20px',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.25) 0%, rgba(79, 172, 254, 0.25) 100%)',
          backdropFilter: 'blur(24px) saturate(200%)',
          WebkitBackdropFilter: 'blur(24px) saturate(200%)',
          border: '2px solid rgba(102, 126, 234, 0.5)',
          borderRadius: '16px',
          color: '#667eea',
          fontSize: '16px',
          fontFamily: 'inherit',
          outline: 'none',
          width: '100%',
          boxShadow: '0 0 25px rgba(102, 126, 234, 0.4), 0 8px 32px rgba(79, 172, 254, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
          transition: 'all 0.3s ease',
        }
      },
      preview: (
        <input
          type="text"
          placeholder="Enter text..."
          style={{
            padding: '10px 16px',
            background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.25) 0%, rgba(79, 172, 254, 0.25) 100%)',
            backdropFilter: 'blur(24px) saturate(200%)',
            WebkitBackdropFilter: 'blur(24px) saturate(200%)',
            border: '2px solid rgba(102, 126, 234, 0.5)',
            borderRadius: '16px',
            color: '#667eea',
            fontSize: '14px',
            width: '200px',
            outline: 'none',
            boxShadow: '0 0 25px rgba(102, 126, 234, 0.4), 0 8px 32px rgba(79, 172, 254, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
          }}
          readOnly
        />
      )
    },
    {
      type: 'input',
      label: 'Orange Input',
      icon: <FiEdit3 />,
      defaultProps: {
        type: 'text',
        placeholder: 'Enter text...',
        style: {
          padding: '12px 20px',
          background: 'linear-gradient(135deg, rgba(250, 112, 154, 0.2) 0%, rgba(254, 225, 64, 0.2) 100%)',
          backdropFilter: 'blur(21px) saturate(190%)',
          WebkitBackdropFilter: 'blur(21px) saturate(190%)',
          border: '1.5px solid rgba(250, 112, 154, 0.4)',
          borderRadius: '14px',
          color: '#fa709a',
          fontSize: '16px',
          fontFamily: 'inherit',
          outline: 'none',
          width: '100%',
          boxShadow: '0 8px 32px rgba(250, 112, 154, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          transition: 'all 0.3s ease',
        }
      },
      preview: (
        <input
          type="text"
          placeholder="Enter text..."
          style={{
            padding: '10px 16px',
            background: 'linear-gradient(135deg, rgba(250, 112, 154, 0.2) 0%, rgba(254, 225, 64, 0.2) 100%)',
            backdropFilter: 'blur(21px) saturate(190%)',
            WebkitBackdropFilter: 'blur(21px) saturate(190%)',
            border: '1.5px solid rgba(250, 112, 154, 0.4)',
            borderRadius: '14px',
            color: '#fa709a',
            fontSize: '14px',
            width: '200px',
            outline: 'none',
            boxShadow: '0 8px 32px rgba(250, 112, 154, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          }}
          readOnly
        />
      )
    },
    {
      type: 'input',
      label: 'Square Input',
      icon: <FiEdit3 />,
      defaultProps: {
        type: 'text',
        placeholder: 'Enter text...',
        style: {
          padding: '12px 20px',
          background: 'linear-gradient(135deg, rgba(48, 207, 208, 0.18) 0%, rgba(51, 8, 103, 0.18) 100%)',
          backdropFilter: 'blur(26px) saturate(185%)',
          WebkitBackdropFilter: 'blur(26px) saturate(185%)',
          border: '1px solid rgba(48, 207, 208, 0.4)',
          borderRadius: '8px',
          color: '#30cfd0',
          fontSize: '16px',
          fontFamily: 'inherit',
          outline: 'none',
          width: '100%',
          boxShadow: '0 6px 24px rgba(48, 207, 208, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          transition: 'all 0.3s ease',
        }
      },
      preview: (
        <input
          type="text"
          placeholder="Enter text..."
          style={{
            padding: '10px 16px',
            background: 'linear-gradient(135deg, rgba(48, 207, 208, 0.18) 0%, rgba(51, 8, 103, 0.18) 100%)',
            backdropFilter: 'blur(26px) saturate(185%)',
            WebkitBackdropFilter: 'blur(26px) saturate(185%)',
            border: '1px solid rgba(48, 207, 208, 0.4)',
            borderRadius: '8px',
            color: '#30cfd0',
            fontSize: '14px',
            width: '200px',
            outline: 'none',
            boxShadow: '0 6px 24px rgba(48, 207, 208, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          }}
          readOnly
        />
      )
    },
  ])

  const [navbarComponents] = useState<NavbarComponent[]>([
    {
      type: 'nav',
      label: 'Business Navbar',
      icon: <FiMenu />,
      defaultProps: {
        style: {
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          padding: '0 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '70px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', gap: '3rem' },
              children: [
                { type: 'div', props: { style: { fontSize: '24px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }, children: 'BusinessPro' } },
                { type: 'nav', props: { style: { display: 'flex', gap: '2rem' }, children: [
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#333', fontWeight: '500', fontSize: '15px' }, children: 'Home' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#333', fontWeight: '500', fontSize: '15px' }, children: 'About' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#333', fontWeight: '500', fontSize: '15px' }, children: 'Services' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#333', fontWeight: '500', fontSize: '15px' }, children: 'Contact' } },
                ] } }
              ]
            }
          },
          { type: 'button', props: { style: { padding: '10px 24px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }, children: 'Get Started' } }
        ]
      },
      preview: (
        <nav style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)',
          backdropFilter: 'blur(20px)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
          fontSize: '12px'
        }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>BusinessPro</div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
            <a href="#" style={{ textDecoration: 'none', color: '#333' }}>Home</a>
            <a href="#" style={{ textDecoration: 'none', color: '#333' }}>About</a>
            <a href="#" style={{ textDecoration: 'none', color: '#333' }}>Services</a>
            <a href="#" style={{ textDecoration: 'none', color: '#333' }}>Contact</a>
          </div>
          <button style={{ padding: '6px 12px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px' }}>Get Started</button>
        </nav>
      )
    },
    {
      type: 'nav',
      label: 'Blog Navbar',
      icon: <FiMenu />,
      defaultProps: {
        style: {
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          boxShadow: '0 2px 15px rgba(0, 0, 0, 0.05)',
          padding: '0 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '70px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', gap: '3rem' },
              children: [
                { type: 'div', props: { style: { fontSize: '22px', fontWeight: '800', color: '#1a1a1a' }, children: 'BlogHub' } },
                { type: 'nav', props: { style: { display: 'flex', gap: '2rem' }, children: [
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#666', fontWeight: '500', fontSize: '15px' }, children: 'Articles' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#666', fontWeight: '500', fontSize: '15px' }, children: 'Categories' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#666', fontWeight: '500', fontSize: '15px' }, children: 'Authors' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#666', fontWeight: '500', fontSize: '15px' }, children: 'Subscribe' } },
                ] } }
              ]
            }
          },
          { type: 'button', props: { style: { padding: '10px 24px', background: '#1a1a1a', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }, children: 'Sign In' } }
        ]
      },
      preview: (
        <nav style={{
          background: 'rgba(255, 255, 255, 0.95)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
          fontSize: '12px'
        }}>
          <div style={{ fontSize: '16px', fontWeight: '800', color: '#1a1a1a' }}>BlogHub</div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#666' }}>
            <a href="#" style={{ textDecoration: 'none', color: '#666' }}>Articles</a>
            <a href="#" style={{ textDecoration: 'none', color: '#666' }}>Categories</a>
            <a href="#" style={{ textDecoration: 'none', color: '#666' }}>Authors</a>
          </div>
          <button style={{ padding: '6px 12px', background: '#1a1a1a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px' }}>Sign In</button>
        </nav>
      )
    },
    {
      type: 'nav',
      label: 'Social Media Navbar',
      icon: <FiMenu />,
      defaultProps: {
        style: {
          background: 'linear-gradient(135deg, rgba(79, 172, 254, 0.1) 0%, rgba(0, 242, 254, 0.1) 100%)',
          backdropFilter: 'blur(25px)',
          WebkitBackdropFilter: 'blur(25px)',
          borderBottom: '1px solid rgba(79, 172, 254, 0.2)',
          padding: '0 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '70px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', gap: '3rem' },
              children: [
                { type: 'div', props: { style: { fontSize: '26px', fontWeight: 'bold', color: '#4facfe' }, children: 'SocialConnect' } },
                { type: 'nav', props: { style: { display: 'flex', gap: '2rem' }, children: [
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#4facfe', fontWeight: '600', fontSize: '15px' }, children: 'Feed' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#4facfe', fontWeight: '600', fontSize: '15px' }, children: 'Explore' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#4facfe', fontWeight: '600', fontSize: '15px' }, children: 'Messages' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#4facfe', fontWeight: '600', fontSize: '15px' }, children: 'Profile' } },
                ] } }
              ]
            }
          },
          { type: 'div', props: { style: { display: 'flex', gap: '1rem', alignItems: 'center' }, children: [
            { type: 'div', props: { style: { width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }, children: 'U' } },
            { type: 'button', props: { style: { padding: '10px 24px', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white', border: 'none', borderRadius: '25px', fontWeight: '600', cursor: 'pointer' }, children: 'Post' } }
          ] } }
        ]
      },
      preview: (
        <nav style={{
          background: 'linear-gradient(135deg, rgba(79, 172, 254, 0.1) 0%, rgba(0, 242, 254, 0.1) 100%)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '8px',
          fontSize: '12px'
        }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#4facfe' }}>SocialConnect</div>
          <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#4facfe' }}>
            <a href="#" style={{ textDecoration: 'none', color: '#4facfe' }}>Feed</a>
            <a href="#" style={{ textDecoration: 'none', color: '#4facfe' }}>Explore</a>
            <a href="#" style={{ textDecoration: 'none', color: '#4facfe' }}>Messages</a>
          </div>
          <button style={{ padding: '6px 12px', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white', border: 'none', borderRadius: '20px', fontSize: '11px' }}>Post</button>
        </nav>
      )
    },
    {
      type: 'nav',
      label: 'Logistics Navbar',
      icon: <FiMenu />,
      defaultProps: {
        style: {
          background: '#ffffff',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
          padding: '0 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '70px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', gap: '3rem' },
              children: [
                { type: 'div', props: { style: { fontSize: '24px', fontWeight: 'bold', color: '#f5576c' }, children: '🚚 FastLogistics' } },
                { type: 'nav', props: { style: { display: 'flex', gap: '2rem' }, children: [
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#333', fontWeight: '500', fontSize: '15px' }, children: 'Track' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#333', fontWeight: '500', fontSize: '15px' }, children: 'Services' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#333', fontWeight: '500', fontSize: '15px' }, children: 'Pricing' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#333', fontWeight: '500', fontSize: '15px' }, children: 'Support' } },
                ] } }
              ]
            }
          },
          { type: 'button', props: { style: { padding: '10px 24px', background: '#f5576c', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }, children: 'Get Quote' } }
        ]
      },
      preview: (
        <nav style={{
          background: '#ffffff',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
          fontSize: '12px'
        }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f5576c' }}>🚚 FastLogistics</div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
            <a href="#" style={{ textDecoration: 'none', color: '#333' }}>Track</a>
            <a href="#" style={{ textDecoration: 'none', color: '#333' }}>Services</a>
            <a href="#" style={{ textDecoration: 'none', color: '#333' }}>Pricing</a>
          </div>
          <button style={{ padding: '6px 12px', background: '#f5576c', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px' }}>Get Quote</button>
        </nav>
      )
    },
    {
      type: 'nav',
      label: 'E-commerce Navbar',
      icon: <FiMenu />,
      defaultProps: {
        style: {
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '2px solid rgba(102, 126, 234, 0.1)',
          padding: '0 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '70px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', gap: '3rem' },
              children: [
                { type: 'div', props: { style: { fontSize: '24px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }, children: 'ShopNow' } },
                { type: 'nav', props: { style: { display: 'flex', gap: '2rem' }, children: [
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#667eea', fontWeight: '600', fontSize: '15px' }, children: 'Products' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#667eea', fontWeight: '600', fontSize: '15px' }, children: 'Categories' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#667eea', fontWeight: '600', fontSize: '15px' }, children: 'Deals' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#667eea', fontWeight: '600', fontSize: '15px' }, children: 'Cart' } },
                ] } }
              ]
            }
          },
          { type: 'div', props: { style: { display: 'flex', gap: '1rem', alignItems: 'center' }, children: [
            { type: 'div', props: { style: { position: 'relative' }, children: [
              { type: 'div', props: { style: { width: '20px', height: '20px', borderRadius: '50%', background: '#f5576c', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', position: 'absolute', top: '-8px', right: '-8px' }, children: '3' } },
              { type: 'div', props: { style: { fontSize: '24px', color: '#667eea' }, children: '🛒' } }
            ] } },
            { type: 'button', props: { style: { padding: '10px 24px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }, children: 'Sign In' } }
          ] } }
        ]
      },
      preview: (
        <nav style={{
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '8px',
          fontSize: '12px'
        }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ShopNow</div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#667eea' }}>
            <a href="#" style={{ textDecoration: 'none', color: '#667eea' }}>Products</a>
            <a href="#" style={{ textDecoration: 'none', color: '#667eea' }}>Categories</a>
            <a href="#" style={{ textDecoration: 'none', color: '#667eea' }}>Deals</a>
          </div>
          <button style={{ padding: '6px 12px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px' }}>Sign In</button>
        </nav>
      )
    },
    {
      type: 'nav',
      label: 'Restaurant Navbar',
      icon: <FiMenu />,
      defaultProps: {
        style: {
          background: 'rgba(250, 112, 154, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 4px 20px rgba(250, 112, 154, 0.3)',
          padding: '0 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '70px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', gap: '3rem' },
              children: [
                { type: 'div', props: { style: { fontSize: '26px', fontWeight: 'bold', color: 'white' }, children: '🍽️ Foodie' } },
                { type: 'nav', props: { style: { display: 'flex', gap: '2rem' }, children: [
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: 'white', fontWeight: '600', fontSize: '15px' }, children: 'Menu' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: 'white', fontWeight: '600', fontSize: '15px' }, children: 'Reservations' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: 'white', fontWeight: '600', fontSize: '15px' }, children: 'About' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: 'white', fontWeight: '600', fontSize: '15px' }, children: 'Contact' } },
                ] } }
              ]
            }
          },
          { type: 'button', props: { style: { padding: '10px 24px', background: 'white', color: '#fa709a', border: 'none', borderRadius: '25px', fontWeight: '600', cursor: 'pointer' }, children: 'Order Now' } }
        ]
      },
      preview: (
        <nav style={{
          background: 'rgba(250, 112, 154, 0.95)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '8px',
          fontSize: '12px'
        }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'white' }}>🍽️ Foodie</div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'white' }}>
            <a href="#" style={{ textDecoration: 'none', color: 'white' }}>Menu</a>
            <a href="#" style={{ textDecoration: 'none', color: 'white' }}>Reservations</a>
            <a href="#" style={{ textDecoration: 'none', color: 'white' }}>About</a>
          </div>
          <button style={{ padding: '6px 12px', background: 'white', color: '#fa709a', border: 'none', borderRadius: '20px', fontSize: '11px' }}>Order Now</button>
        </nav>
      )
    },
    {
      type: 'nav',
      label: 'Tech Startup Navbar',
      icon: <FiMenu />,
      defaultProps: {
        style: {
          background: 'rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '0 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '70px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', gap: '3rem' },
              children: [
                { type: 'div', props: { style: { fontSize: '24px', fontWeight: 'bold', color: '#00f2fe', fontFamily: 'monospace' }, children: 'TechStart' } },
                { type: 'nav', props: { style: { display: 'flex', gap: '2rem' }, children: [
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#fff', fontWeight: '500', fontSize: '15px' }, children: 'Products' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#fff', fontWeight: '500', fontSize: '15px' }, children: 'Solutions' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#fff', fontWeight: '500', fontSize: '15px' }, children: 'Pricing' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#fff', fontWeight: '500', fontSize: '15px' }, children: 'Blog' } },
                ] } }
              ]
            }
          },
          { type: 'button', props: { style: { padding: '10px 24px', background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }, children: 'Try Free' } }
        ]
      },
      preview: (
        <nav style={{
          background: 'rgba(0, 0, 0, 0.9)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '8px',
          fontSize: '12px'
        }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#00f2fe' }}>TechStart</div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#fff' }}>
            <a href="#" style={{ textDecoration: 'none', color: '#fff' }}>Products</a>
            <a href="#" style={{ textDecoration: 'none', color: '#fff' }}>Solutions</a>
            <a href="#" style={{ textDecoration: 'none', color: '#fff' }}>Pricing</a>
          </div>
          <button style={{ padding: '6px 12px', background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px' }}>Try Free</button>
        </nav>
      )
    },
    {
      type: 'nav',
      label: 'Healthcare Navbar',
      icon: <FiMenu />,
      defaultProps: {
        style: {
          background: 'linear-gradient(135deg, rgba(67, 233, 123, 0.1) 0%, rgba(56, 249, 215, 0.1) 100%)',
          backdropFilter: 'blur(25px)',
          WebkitBackdropFilter: 'blur(25px)',
          borderBottom: '2px solid rgba(67, 233, 123, 0.2)',
          padding: '0 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '70px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', gap: '3rem' },
              children: [
                { type: 'div', props: { style: { fontSize: '24px', fontWeight: 'bold', color: '#43e97b' }, children: '🏥 HealthCare+' } },
                { type: 'nav', props: { style: { display: 'flex', gap: '2rem' }, children: [
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#43e97b', fontWeight: '600', fontSize: '15px' }, children: 'Services' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#43e97b', fontWeight: '600', fontSize: '15px' }, children: 'Doctors' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#43e97b', fontWeight: '600', fontSize: '15px' }, children: 'Appointments' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#43e97b', fontWeight: '600', fontSize: '15px' }, children: 'Contact' } },
                ] } }
              ]
            }
          },
          { type: 'button', props: { style: { padding: '10px 24px', background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }, children: 'Book Now' } }
        ]
      },
      preview: (
        <nav style={{
          background: 'linear-gradient(135deg, rgba(67, 233, 123, 0.1) 0%, rgba(56, 249, 215, 0.1) 100%)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '8px',
          fontSize: '12px'
        }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#43e97b' }}>🏥 HealthCare+</div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#43e97b' }}>
            <a href="#" style={{ textDecoration: 'none', color: '#43e97b' }}>Services</a>
            <a href="#" style={{ textDecoration: 'none', color: '#43e97b' }}>Doctors</a>
            <a href="#" style={{ textDecoration: 'none', color: '#43e97b' }}>Appointments</a>
          </div>
          <button style={{ padding: '6px 12px', background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px' }}>Book Now</button>
        </nav>
      )
    },
    {
      type: 'nav',
      label: 'Education Navbar',
      icon: <FiMenu />,
      defaultProps: {
        style: {
          background: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 2px 15px rgba(0, 0, 0, 0.08)',
          padding: '0 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '70px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', gap: '3rem' },
              children: [
                { type: 'div', props: { style: { fontSize: '24px', fontWeight: 'bold', color: '#667eea' }, children: '📚 EduLearn' } },
                { type: 'nav', props: { style: { display: 'flex', gap: '2rem' }, children: [
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#333', fontWeight: '500', fontSize: '15px' }, children: 'Courses' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#333', fontWeight: '500', fontSize: '15px' }, children: 'Instructors' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#333', fontWeight: '500', fontSize: '15px' }, children: 'Resources' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#333', fontWeight: '500', fontSize: '15px' }, children: 'About' } },
                ] } }
              ]
            }
          },
          { type: 'button', props: { style: { padding: '10px 24px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }, children: 'Enroll Now' } }
        ]
      },
      preview: (
        <nav style={{
          background: 'rgba(255, 255, 255, 0.98)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.08)',
          fontSize: '12px'
        }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#667eea' }}>📚 EduLearn</div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
            <a href="#" style={{ textDecoration: 'none', color: '#333' }}>Courses</a>
            <a href="#" style={{ textDecoration: 'none', color: '#333' }}>Instructors</a>
            <a href="#" style={{ textDecoration: 'none', color: '#333' }}>Resources</a>
          </div>
          <button style={{ padding: '6px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px' }}>Enroll Now</button>
        </nav>
      )
    },
    {
      type: 'nav',
      label: 'Real Estate Navbar',
      icon: <FiMenu />,
      defaultProps: {
        style: {
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%)',
          backdropFilter: 'blur(22px)',
          WebkitBackdropFilter: 'blur(22px)',
          borderBottom: '1px solid rgba(102, 126, 234, 0.15)',
          padding: '0 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '70px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', gap: '3rem' },
              children: [
                { type: 'div', props: { style: { fontSize: '24px', fontWeight: 'bold', color: '#764ba2' }, children: '🏠 EstatePro' } },
                { type: 'nav', props: { style: { display: 'flex', gap: '2rem' }, children: [
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#764ba2', fontWeight: '600', fontSize: '15px' }, children: 'Buy' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#764ba2', fontWeight: '600', fontSize: '15px' }, children: 'Sell' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#764ba2', fontWeight: '600', fontSize: '15px' }, children: 'Rent' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#764ba2', fontWeight: '600', fontSize: '15px' }, children: 'Agents' } },
                ] } }
              ]
            }
          },
          { type: 'button', props: { style: { padding: '10px 24px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }, children: 'List Property' } }
        ]
      },
      preview: (
        <nav style={{
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '8px',
          fontSize: '12px'
        }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#764ba2' }}>🏠 EstatePro</div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#764ba2' }}>
            <a href="#" style={{ textDecoration: 'none', color: '#764ba2' }}>Buy</a>
            <a href="#" style={{ textDecoration: 'none', color: '#764ba2' }}>Sell</a>
            <a href="#" style={{ textDecoration: 'none', color: '#764ba2' }}>Rent</a>
          </div>
          <button style={{ padding: '6px 12px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px' }}>List Property</button>
        </nav>
      )
    },
    {
      type: 'nav',
      label: 'Fashion Navbar',
      icon: <FiMenu />,
      defaultProps: {
        style: {
          background: 'rgba(240, 147, 251, 0.95)',
          backdropFilter: 'blur(25px)',
          WebkitBackdropFilter: 'blur(25px)',
          boxShadow: '0 4px 25px rgba(240, 147, 251, 0.3)',
          padding: '0 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '70px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', gap: '3rem' },
              children: [
                { type: 'div', props: { style: { fontSize: '26px', fontWeight: 'bold', color: 'white', letterSpacing: '2px' }, children: 'FASHION' } },
                { type: 'nav', props: { style: { display: 'flex', gap: '2rem' }, children: [
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: 'white', fontWeight: '600', fontSize: '15px' }, children: 'Women' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: 'white', fontWeight: '600', fontSize: '15px' }, children: 'Men' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: 'white', fontWeight: '600', fontSize: '15px' }, children: 'Sale' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: 'white', fontWeight: '600', fontSize: '15px' }, children: 'New' } },
                ] } }
              ]
            }
          },
          { type: 'div', props: { style: { display: 'flex', gap: '1.5rem', alignItems: 'center' }, children: [
            { type: 'div', props: { style: { fontSize: '20px', color: 'white' }, children: '🔍' } },
            { type: 'div', props: { style: { fontSize: '20px', color: 'white' }, children: '❤️' } },
            { type: 'div', props: { style: { fontSize: '20px', color: 'white' }, children: '🛒' } }
          ] } }
        ]
      },
      preview: (
        <nav style={{
          background: 'rgba(240, 147, 251, 0.95)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '8px',
          fontSize: '12px'
        }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'white', letterSpacing: '1px' }}>FASHION</div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'white' }}>
            <a href="#" style={{ textDecoration: 'none', color: 'white' }}>Women</a>
            <a href="#" style={{ textDecoration: 'none', color: 'white' }}>Men</a>
            <a href="#" style={{ textDecoration: 'none', color: 'white' }}>Sale</a>
          </div>
          <div style={{ display: 'flex', gap: '8px', fontSize: '14px', color: 'white' }}>🔍 ❤️ 🛒</div>
        </nav>
      )
    },
    {
      type: 'nav',
      label: 'Finance Navbar',
      icon: <FiMenu />,
      defaultProps: {
        style: {
          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(30, 30, 30, 0.95) 100%)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          borderBottom: '2px solid rgba(67, 233, 123, 0.3)',
          padding: '0 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '70px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', gap: '3rem' },
              children: [
                { type: 'div', props: { style: { fontSize: '24px', fontWeight: 'bold', color: '#43e97b', fontFamily: 'monospace' }, children: '$ FinanceHub' } },
                { type: 'nav', props: { style: { display: 'flex', gap: '2rem' }, children: [
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#fff', fontWeight: '500', fontSize: '15px' }, children: 'Investing' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#fff', fontWeight: '500', fontSize: '15px' }, children: 'Banking' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#fff', fontWeight: '500', fontSize: '15px' }, children: 'Loans' } },
                  { type: 'a', props: { href: '#', style: { textDecoration: 'none', color: '#fff', fontWeight: '500', fontSize: '15px' }, children: 'Resources' } },
                ] } }
              ]
            }
          },
          { type: 'button', props: { style: { padding: '10px 24px', background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }, children: 'Get Started' } }
        ]
      },
      preview: (
        <nav style={{
          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(30, 30, 30, 0.95) 100%)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '8px',
          fontSize: '12px'
        }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#43e97b' }}>$ FinanceHub</div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#fff' }}>
            <a href="#" style={{ textDecoration: 'none', color: '#fff' }}>Investing</a>
            <a href="#" style={{ textDecoration: 'none', color: '#fff' }}>Banking</a>
            <a href="#" style={{ textDecoration: 'none', color: '#fff' }}>Loans</a>
          </div>
          <button style={{ padding: '6px 12px', background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: '#000', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>Get Started</button>
        </nav>
      )
    },
  ])

  const [tableComponents] = useState<TableComponent[]>([
    {
      type: 'table',
      label: 'Basic Table',
      icon: <FiDatabase />,
      defaultProps: {
        style: {
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
        },
        children: [
          {
            type: 'thead',
            props: {
              style: { background: '#f5f5f5' },
              children: [
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left', border: '1px solid #ddd', fontWeight: 'bold' }, children: 'Name' } },
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left', border: '1px solid #ddd', fontWeight: 'bold' }, children: 'Email' } },
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left', border: '1px solid #ddd', fontWeight: 'bold' }, children: 'Role' } },
                    ]
                  }
                }
              ]
            }
          },
          {
            type: 'tbody',
            props: {
              children: [
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'td', props: { style: { padding: '12px', border: '1px solid #ddd' }, children: 'John Doe' } },
                      { type: 'td', props: { style: { padding: '12px', border: '1px solid #ddd' }, children: 'john@example.com' } },
                      { type: 'td', props: { style: { padding: '12px', border: '1px solid #ddd' }, children: 'Admin' } },
                    ]
                  }
                },
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'td', props: { style: { padding: '12px', border: '1px solid #ddd' }, children: 'Jane Smith' } },
                      { type: 'td', props: { style: { padding: '12px', border: '1px solid #ddd' }, children: 'jane@example.com' } },
                      { type: 'td', props: { style: { padding: '12px', border: '1px solid #ddd' }, children: 'User' } },
                    ]
                  }
                },
              ]
            }
          }
        ]
      },
      preview: (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead style={{ background: '#f5f5f5' }}>
            <tr>
              <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Name</th>
              <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Email</th>
              <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Role</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>John Doe</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>john@example.com</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>Admin</td>
            </tr>
            <tr>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>Jane Smith</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>jane@example.com</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>User</td>
            </tr>
          </tbody>
        </table>
      )
    },
    {
      type: 'table',
      label: 'Styled Table',
      icon: <FiDatabase />,
      defaultProps: {
        style: {
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderRadius: '8px',
          overflow: 'hidden',
        },
        children: [
          {
            type: 'thead',
            props: {
              style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' },
              children: [
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'th', props: { style: { padding: '14px', textAlign: 'left', fontWeight: '600' }, children: 'Product' } },
                      { type: 'th', props: { style: { padding: '14px', textAlign: 'left', fontWeight: '600' }, children: 'Price' } },
                      { type: 'th', props: { style: { padding: '14px', textAlign: 'left', fontWeight: '600' }, children: 'Stock' } },
                    ]
                  }
                }
              ]
            }
          },
          {
            type: 'tbody',
            props: {
              children: [
                {
                  type: 'tr',
                  props: {
                    style: { background: '#fff' },
                    children: [
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #f0f0f0' }, children: 'Laptop' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #f0f0f0' }, children: '$999' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #f0f0f0' }, children: '45' } },
                    ]
                  }
                },
                {
                  type: 'tr',
                  props: {
                    style: { background: '#f9f9f9' },
                    children: [
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #f0f0f0' }, children: 'Mouse' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #f0f0f0' }, children: '$25' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #f0f0f0' }, children: '120' } },
                    ]
                  }
                },
              ]
            }
          }
        ]
      },
      preview: (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
          <thead style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <tr>
              <th style={{ padding: '8px', textAlign: 'left' }}>Product</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Price</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Stock</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: '#fff' }}>
              <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>Laptop</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>$999</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>45</td>
            </tr>
            <tr style={{ background: '#f9f9f9' }}>
              <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>Mouse</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>$25</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>120</td>
            </tr>
          </tbody>
        </table>
      )
    },
    {
      type: 'div',
      label: 'AG Grid Table',
      icon: <FiDatabase />,
      defaultProps: {
        className: 'ag-grid-container',
        'data-ag-grid': 'true',
        'data-ag-grid-config': JSON.stringify({
          columnDefs: [
            { field: 'name', headerName: 'Name', sortable: true, filter: true },
            { field: 'age', headerName: 'Age', sortable: true, filter: true },
            { field: 'country', headerName: 'Country', sortable: true, filter: true },
          ],
          rowData: [
            { name: 'John Doe', age: 30, country: 'USA' },
            { name: 'Jane Smith', age: 25, country: 'UK' },
            { name: 'Bob Johnson', age: 35, country: 'Canada' },
          ],
          defaultColDef: {
            resizable: true,
            sortable: true,
            filter: true,
          },
        }),
        style: {
          width: '100%',
          height: '400px',
          fontFamily: 'Arial, sans-serif',
        }
      },
      preview: (
        <div style={{
          width: '100%',
          height: '150px',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
          border: '2px dashed rgba(102, 126, 234, 0.3)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          color: '#667eea',
          fontWeight: '600'
        }}>
          AG Grid Table
          <br />
          <span style={{ fontSize: '10px', fontWeight: '400', color: '#666' }}>Sortable, Filterable, Resizable</span>
        </div>
      )
    },
    {
      type: 'table',
      label: 'Zebra Striped Table',
      icon: <FiDatabase />,
      defaultProps: {
        style: {
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
        },
        children: [
          {
            type: 'thead',
            props: {
              style: { background: '#333', color: 'white' },
              children: [
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left' }, children: 'ID' } },
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left' }, children: 'Name' } },
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left' }, children: 'Status' } },
                    ]
                  }
                }
              ]
            }
          },
          {
            type: 'tbody',
            props: {
              children: [
                {
                  type: 'tr',
                  props: {
                    style: { background: '#fff' },
                    children: [
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: '1' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: 'Item 1' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: 'Active' } },
                    ]
                  }
                },
                {
                  type: 'tr',
                  props: {
                    style: { background: '#f9f9f9' },
                    children: [
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: '2' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: 'Item 2' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: 'Pending' } },
                    ]
                  }
                },
                {
                  type: 'tr',
                  props: {
                    style: { background: '#fff' },
                    children: [
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: '3' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: 'Item 3' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: 'Active' } },
                    ]
                  }
                },
              ]
            }
          }
        ]
      },
      preview: (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead style={{ background: '#333', color: 'white' }}>
            <tr>
              <th style={{ padding: '8px', textAlign: 'left' }}>ID</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Name</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: '#fff' }}>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>1</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>Item 1</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>Active</td>
            </tr>
            <tr style={{ background: '#f9f9f9' }}>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>2</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>Item 2</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>Pending</td>
            </tr>
          </tbody>
        </table>
      )
    },
    {
      type: 'table',
      label: 'Bordered Table',
      icon: <FiDatabase />,
      defaultProps: {
        style: {
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          border: '2px solid #667eea',
        },
        children: [
          {
            type: 'thead',
            props: {
              style: { background: '#667eea', color: 'white' },
              children: [
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'th', props: { style: { padding: '12px', border: '1px solid #5568d3', textAlign: 'left' }, children: 'Date' } },
                      { type: 'th', props: { style: { padding: '12px', border: '1px solid #5568d3', textAlign: 'left' }, children: 'Amount' } },
                      { type: 'th', props: { style: { padding: '12px', border: '1px solid #5568d3', textAlign: 'left' }, children: 'Type' } },
                    ]
                  }
                }
              ]
            }
          },
          {
            type: 'tbody',
            props: {
              children: [
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'td', props: { style: { padding: '12px', border: '1px solid #667eea' }, children: '2024-01-15' } },
                      { type: 'td', props: { style: { padding: '12px', border: '1px solid #667eea' }, children: '$1,200' } },
                      { type: 'td', props: { style: { padding: '12px', border: '1px solid #667eea' }, children: 'Income' } },
                    ]
                  }
                },
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'td', props: { style: { padding: '12px', border: '1px solid #667eea' }, children: '2024-01-16' } },
                      { type: 'td', props: { style: { padding: '12px', border: '1px solid #667eea' }, children: '$450' } },
                      { type: 'td', props: { style: { padding: '12px', border: '1px solid #667eea' }, children: 'Expense' } },
                    ]
                  }
                },
              ]
            }
          }
        ]
      },
      preview: (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '2px solid #667eea' }}>
          <thead style={{ background: '#667eea', color: 'white' }}>
            <tr>
              <th style={{ padding: '8px', border: '1px solid #5568d3', textAlign: 'left' }}>Date</th>
              <th style={{ padding: '8px', border: '1px solid #5568d3', textAlign: 'left' }}>Amount</th>
              <th style={{ padding: '8px', border: '1px solid #5568d3', textAlign: 'left' }}>Type</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '8px', border: '1px solid #667eea' }}>2024-01-15</td>
              <td style={{ padding: '8px', border: '1px solid #667eea' }}>$1,200</td>
              <td style={{ padding: '8px', border: '1px solid #667eea' }}>Income</td>
            </tr>
          </tbody>
        </table>
      )
    },
    {
      type: 'table',
      label: 'Minimal Table',
      icon: <FiDatabase />,
      defaultProps: {
        style: {
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
        },
        children: [
          {
            type: 'thead',
            props: {
              style: { borderBottom: '2px solid #333' },
              children: [
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left', fontWeight: '600' }, children: 'Task' } },
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left', fontWeight: '600' }, children: 'Priority' } },
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left', fontWeight: '600' }, children: 'Due Date' } },
                    ]
                  }
                }
              ]
            }
          },
          {
            type: 'tbody',
            props: {
              children: [
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: 'Design Mockup' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: 'High' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: '2024-02-01' } },
                    ]
                  }
                },
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: 'Code Review' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: 'Medium' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: '2024-02-05' } },
                    ]
                  }
                },
              ]
            }
          }
        ]
      },
      preview: (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead style={{ borderBottom: '2px solid #333' }}>
            <tr>
              <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Task</th>
              <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Priority</th>
              <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Due Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>Design Mockup</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>High</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>2024-02-01</td>
            </tr>
          </tbody>
        </table>
      )
    },
    {
      type: 'table',
      label: 'Hover Table',
      icon: <FiDatabase />,
      defaultProps: {
        style: {
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
        },
        children: [
          {
            type: 'thead',
            props: {
              style: { background: '#4facfe', color: 'white' },
              children: [
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left' }, children: 'Employee' } },
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left' }, children: 'Department' } },
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left' }, children: 'Salary' } },
                    ]
                  }
                }
              ]
            }
          },
          {
            type: 'tbody',
            props: {
              children: [
                {
                  type: 'tr',
                  props: {
                    style: { transition: 'background 0.2s' },
                    children: [
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #ddd' }, children: 'Alice Brown' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #ddd' }, children: 'Engineering' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #ddd' }, children: '$85,000' } },
                    ]
                  }
                },
                {
                  type: 'tr',
                  props: {
                    style: { transition: 'background 0.2s' },
                    children: [
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #ddd' }, children: 'Bob Wilson' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #ddd' }, children: 'Marketing' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #ddd' }, children: '$72,000' } },
                    ]
                  }
                },
              ]
            }
          }
        ]
      },
      preview: (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead style={{ background: '#4facfe', color: 'white' }}>
            <tr>
              <th style={{ padding: '8px', textAlign: 'left' }}>Employee</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Department</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Salary</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Alice Brown</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Engineering</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>$85,000</td>
            </tr>
          </tbody>
        </table>
      )
    },
    {
      type: 'table',
      label: 'Responsive Table',
      icon: <FiDatabase />,
      defaultProps: {
        style: {
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          overflowX: 'auto',
        },
        children: [
          {
            type: 'thead',
            props: {
              style: { background: '#43e97b', color: 'white' },
              children: [
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left', whiteSpace: 'nowrap' }, children: 'Product Name' } },
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left', whiteSpace: 'nowrap' }, children: 'Category' } },
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left', whiteSpace: 'nowrap' }, children: 'Price' } },
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left', whiteSpace: 'nowrap' }, children: 'Stock' } },
                    ]
                  }
                }
              ]
            }
          },
          {
            type: 'tbody',
            props: {
              children: [
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: 'Wireless Mouse' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: 'Electronics' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: '$29.99' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: '150' } },
                    ]
                  }
                },
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: 'USB Keyboard' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: 'Electronics' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: '$49.99' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #eee' }, children: '89' } },
                    ]
                  }
                },
              ]
            }
          }
        ]
      },
      preview: (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead style={{ background: '#43e97b', color: 'white' }}>
            <tr>
              <th style={{ padding: '8px', textAlign: 'left' }}>Product</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Category</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Price</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Stock</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>Wireless Mouse</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>Electronics</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>$29.99</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>150</td>
            </tr>
          </tbody>
        </table>
      )
    },
    {
      type: 'table',
      label: 'Dark Table',
      icon: <FiDatabase />,
      defaultProps: {
        style: {
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          background: '#1a1a1a',
          color: '#fff',
        },
        children: [
          {
            type: 'thead',
            props: {
              style: { background: '#333', color: '#fff' },
              children: [
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left', borderBottom: '2px solid #667eea' }, children: 'ID' } },
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left', borderBottom: '2px solid #667eea' }, children: 'Name' } },
                      { type: 'th', props: { style: { padding: '12px', textAlign: 'left', borderBottom: '2px solid #667eea' }, children: 'Value' } },
                    ]
                  }
                }
              ]
            }
          },
          {
            type: 'tbody',
            props: {
              children: [
                {
                  type: 'tr',
                  props: {
                    style: { borderBottom: '1px solid #333' },
                    children: [
                      { type: 'td', props: { style: { padding: '12px' }, children: '001' } },
                      { type: 'td', props: { style: { padding: '12px' }, children: 'Data Point 1' } },
                      { type: 'td', props: { style: { padding: '12px' }, children: '1250' } },
                    ]
                  }
                },
                {
                  type: 'tr',
                  props: {
                    style: { borderBottom: '1px solid #333' },
                    children: [
                      { type: 'td', props: { style: { padding: '12px' }, children: '002' } },
                      { type: 'td', props: { style: { padding: '12px' }, children: 'Data Point 2' } },
                      { type: 'td', props: { style: { padding: '12px' }, children: '2340' } },
                    ]
                  }
                },
              ]
            }
          }
        ]
      },
      preview: (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', background: '#1a1a1a', color: '#fff' }}>
          <thead style={{ background: '#333' }}>
            <tr>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #667eea' }}>ID</th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #667eea' }}>Name</th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #667eea' }}>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #333' }}>
              <td style={{ padding: '8px' }}>001</td>
              <td style={{ padding: '8px' }}>Data Point 1</td>
              <td style={{ padding: '8px' }}>1250</td>
            </tr>
          </tbody>
        </table>
      )
    },
    {
      type: 'table',
      label: 'Rounded Table',
      icon: <FiDatabase />,
      defaultProps: {
        style: {
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        },
        children: [
          {
            type: 'thead',
            props: {
              style: { background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' },
              children: [
                {
                  type: 'tr',
                  props: {
                    children: [
                      { type: 'th', props: { style: { padding: '14px', textAlign: 'left' }, children: 'Order ID' } },
                      { type: 'th', props: { style: { padding: '14px', textAlign: 'left' }, children: 'Customer' } },
                      { type: 'th', props: { style: { padding: '14px', textAlign: 'left' }, children: 'Total' } },
                    ]
                  }
                }
              ]
            }
          },
          {
            type: 'tbody',
            props: {
              children: [
                {
                  type: 'tr',
                  props: {
                    style: { background: '#fff' },
                    children: [
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #f0f0f0' }, children: '#12345' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #f0f0f0' }, children: 'John Doe' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #f0f0f0' }, children: '$299.99' } },
                    ]
                  }
                },
                {
                  type: 'tr',
                  props: {
                    style: { background: '#f9f9f9' },
                    children: [
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #f0f0f0' }, children: '#12346' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #f0f0f0' }, children: 'Jane Smith' } },
                      { type: 'td', props: { style: { padding: '12px', borderBottom: '1px solid #f0f0f0' }, children: '$149.99' } },
                    ]
                  }
                },
              ]
            }
          }
        ]
      },
      preview: (
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '11px', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <thead style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}>
            <tr>
              <th style={{ padding: '8px', textAlign: 'left' }}>Order ID</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Customer</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: '#fff' }}>
              <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>#12345</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>John Doe</td>
              <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>$299.99</td>
            </tr>
          </tbody>
        </table>
      )
    },
  ])

  const [loginComponents] = useState<LoginComponent[]>([
    {
      type: 'form',
      label: 'Glass Login',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '400px',
          margin: '0 auto',
          padding: '40px',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '20px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '30px',
                color: '#333',
                fontSize: '28px',
                fontWeight: '700',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              },
              children: 'Welcome Back'
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email address',
              style: {
                width: '100%',
                padding: '14px 20px',
                marginBottom: '20px',
                background: 'rgba(255, 255, 255, 0.9)',
                border: '1px solid rgba(102, 126, 234, 0.2)',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                transition: 'all 0.3s ease',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                padding: '14px 20px',
                marginBottom: '25px',
                background: 'rgba(255, 255, 255, 0.9)',
                border: '1px solid rgba(102, 126, 234, 0.2)',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                transition: 'all 0.3s ease',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '14px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(102, 126, 234, 0.4)',
                transition: 'all 0.3s ease',
              },
              children: 'Sign In'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '20px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '20px', fontSize: '18px', color: '#667eea', fontWeight: '700' }}>Welcome Back</h3>
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '12px' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '12px' }} readOnly />
          <button style={{ width: '100%', padding: '10px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>Sign In</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Minimal Login',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '400px',
          margin: '0 auto',
          padding: '50px 40px',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '40px',
                color: '#1a1a1a',
                fontSize: '32px',
                fontWeight: '600',
                letterSpacing: '-0.5px',
              },
              children: 'Login'
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email',
              style: {
                width: '100%',
                padding: '16px 20px',
                marginBottom: '20px',
                background: '#f8f9fa',
                border: 'none',
                borderBottom: '2px solid #e0e0e0',
                borderRadius: '0',
                fontSize: '16px',
                outline: 'none',
                transition: 'border-color 0.3s ease',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                padding: '16px 20px',
                marginBottom: '30px',
                background: '#f8f9fa',
                border: 'none',
                borderBottom: '2px solid #e0e0e0',
                borderRadius: '0',
                fontSize: '16px',
                outline: 'none',
                transition: 'border-color 0.3s ease',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '16px',
                background: '#1a1a1a',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background 0.3s ease',
              },
              children: 'Continue'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '20px', color: '#1a1a1a', fontWeight: '600' }}>Login</h3>
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '12px', background: '#f8f9fa', border: 'none', borderBottom: '2px solid #e0e0e0', fontSize: '12px' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#f8f9fa', border: 'none', borderBottom: '2px solid #e0e0e0', fontSize: '12px' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: '#1a1a1a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>Continue</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Gradient Login',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '450px',
          margin: '0 auto',
          padding: '50px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '24px',
          boxShadow: '0 20px 60px rgba(102, 126, 234, 0.4)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '40px',
                color: '#ffffff',
                fontSize: '36px',
                fontWeight: '700',
              },
              children: 'Sign In'
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email address',
              style: {
                width: '100%',
                padding: '16px 20px',
                marginBottom: '20px',
                background: 'rgba(255, 255, 255, 0.95)',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                padding: '16px 20px',
                marginBottom: '30px',
                background: 'rgba(255, 255, 255, 0.95)',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '16px',
                background: '#ffffff',
                color: '#667eea',
                border: 'none',
                borderRadius: '12px',
                fontSize: '18px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                transition: 'transform 0.2s ease',
              },
              children: 'Get Started'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '24px',
          boxShadow: '0 20px 60px rgba(102, 126, 234, 0.4)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '22px', color: '#ffffff', fontWeight: '700' }}>Sign In</h3>
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '12px', background: 'rgba(255, 255, 255, 0.95)', border: 'none', borderRadius: '8px', fontSize: '12px' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: 'rgba(255, 255, 255, 0.95)', border: 'none', borderRadius: '8px', fontSize: '12px' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: '#ffffff', color: '#667eea', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}>Get Started</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Dark Mode Login',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '400px',
          margin: '0 auto',
          padding: '45px',
          background: '#1a1a1a',
          borderRadius: '20px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '35px',
                color: '#ffffff',
                fontSize: '30px',
                fontWeight: '600',
              },
              children: 'Welcome'
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email',
              style: {
                width: '100%',
                padding: '15px 20px',
                marginBottom: '20px',
                background: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: '10px',
                fontSize: '16px',
                color: '#ffffff',
                outline: 'none',
                transition: 'border-color 0.3s ease',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                padding: '15px 20px',
                marginBottom: '30px',
                background: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: '10px',
                fontSize: '16px',
                color: '#ffffff',
                outline: 'none',
                transition: 'border-color 0.3s ease',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '15px',
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(79, 172, 254, 0.4)',
                transition: 'transform 0.2s ease',
              },
              children: 'Sign In'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: '#1a1a1a',
          borderRadius: '20px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '20px', color: '#ffffff', fontWeight: '600' }}>Welcome</h3>
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '12px', background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: '8px', fontSize: '12px', color: '#fff' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: '8px', fontSize: '12px', color: '#fff' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>Sign In</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Rounded Login',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '420px',
          margin: '0 auto',
          padding: '45px',
          background: '#ffffff',
          borderRadius: '30px',
          boxShadow: '0 15px 50px rgba(0, 0, 0, 0.1)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '35px',
                color: '#333',
                fontSize: '28px',
                fontWeight: '700',
              },
              children: 'Hello Again!'
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Enter your email',
              style: {
                width: '100%',
                padding: '18px 24px',
                marginBottom: '20px',
                background: '#f5f5f5',
                border: '2px solid transparent',
                borderRadius: '20px',
                fontSize: '16px',
                outline: 'none',
                transition: 'all 0.3s ease',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Enter your password',
              style: {
                width: '100%',
                padding: '18px 24px',
                marginBottom: '30px',
                background: '#f5f5f5',
                border: '2px solid transparent',
                borderRadius: '20px',
                fontSize: '16px',
                outline: 'none',
                transition: 'all 0.3s ease',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '18px',
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '20px',
                fontSize: '18px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(245, 87, 108, 0.4)',
                transition: 'transform 0.2s ease',
              },
              children: 'Login'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: '#ffffff',
          borderRadius: '30px',
          boxShadow: '0 15px 50px rgba(0, 0, 0, 0.1)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '20px', color: '#333', fontWeight: '700' }}>Hello Again!</h3>
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '12px', background: '#f5f5f5', border: '2px solid transparent', borderRadius: '15px', fontSize: '12px' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#f5f5f5', border: '2px solid transparent', borderRadius: '15px', fontSize: '12px' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: '#ffffff', border: 'none', borderRadius: '15px', fontSize: '12px', fontWeight: '600' }}>Login</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Neumorphism Login',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '400px',
          margin: '0 auto',
          padding: '50px',
          background: '#e0e5ec',
          borderRadius: '24px',
          boxShadow: '20px 20px 60px #bebebe, -20px -20px 60px #ffffff',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '40px',
                color: '#4a5568',
                fontSize: '32px',
                fontWeight: '700',
              },
              children: 'Sign In'
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email',
              style: {
                width: '100%',
                padding: '16px 20px',
                marginBottom: '25px',
                background: '#e0e5ec',
                border: 'none',
                borderRadius: '16px',
                fontSize: '16px',
                color: '#4a5568',
                outline: 'none',
                boxShadow: 'inset 8px 8px 16px #bebebe, inset -8px -8px 16px #ffffff',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                padding: '16px 20px',
                marginBottom: '30px',
                background: '#e0e5ec',
                border: 'none',
                borderRadius: '16px',
                fontSize: '16px',
                color: '#4a5568',
                outline: 'none',
                boxShadow: 'inset 8px 8px 16px #bebebe, inset -8px -8px 16px #ffffff',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '16px',
                background: '#e0e5ec',
                color: '#667eea',
                border: 'none',
                borderRadius: '16px',
                fontSize: '18px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '8px 8px 16px #bebebe, -8px -8px 16px #ffffff',
                transition: 'all 0.3s ease',
              },
              children: 'Login'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: '#e0e5ec',
          borderRadius: '24px',
          boxShadow: '20px 20px 60px #bebebe, -20px -20px 60px #ffffff',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '20px', color: '#4a5568', fontWeight: '700' }}>Sign In</h3>
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '12px', background: '#e0e5ec', border: 'none', borderRadius: '12px', fontSize: '12px', color: '#4a5568', boxShadow: 'inset 6px 6px 12px #bebebe, inset -6px -6px 12px #ffffff' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#e0e5ec', border: 'none', borderRadius: '12px', fontSize: '12px', color: '#4a5568', boxShadow: 'inset 6px 6px 12px #bebebe, inset -6px -6px 12px #ffffff' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: '#e0e5ec', color: '#667eea', border: 'none', borderRadius: '12px', fontSize: '12px', fontWeight: '700', boxShadow: '6px 6px 12px #bebebe, -6px -6px 12px #ffffff' }}>Login</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Card Login',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '420px',
          margin: '0 auto',
          padding: '40px',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e8e8e8',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '10px',
                color: '#1a1a1a',
                fontSize: '26px',
                fontWeight: '600',
              },
              children: 'Login to Account'
            }
          },
          {
            type: 'p',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '35px',
                color: '#666',
                fontSize: '14px',
              },
              children: 'Please enter your credentials to continue'
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email address',
              style: {
                width: '100%',
                padding: '14px 18px',
                marginBottom: '18px',
                background: '#fafafa',
                border: '1px solid #e0e0e0',
                borderRadius: '10px',
                fontSize: '15px',
                outline: 'none',
                transition: 'border-color 0.3s ease',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                padding: '14px 18px',
                marginBottom: '25px',
                background: '#fafafa',
                border: '1px solid #e0e0e0',
                borderRadius: '10px',
                fontSize: '15px',
                outline: 'none',
                transition: 'border-color 0.3s ease',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '14px',
                background: '#667eea',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                transition: 'background 0.3s ease',
              },
              children: 'Sign In'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '25px',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e8e8e8',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '8px', fontSize: '18px', color: '#1a1a1a', fontWeight: '600' }}>Login to Account</h3>
          <p style={{ textAlign: 'center', marginBottom: '20px', color: '#666', fontSize: '11px' }}>Please enter your credentials</p>
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '10px', marginBottom: '10px', background: '#fafafa', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '12px' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '10px', marginBottom: '15px', background: '#fafafa', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '12px' }} readOnly />
          <button style={{ width: '100%', padding: '10px', background: '#667eea', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>Sign In</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Bordered Login',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '400px',
          margin: '0 auto',
          padding: '45px',
          background: '#ffffff',
          borderRadius: '12px',
          border: '2px solid #667eea',
          boxShadow: '0 8px 24px rgba(102, 126, 234, 0.15)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '35px',
                color: '#667eea',
                fontSize: '30px',
                fontWeight: '700',
              },
              children: 'Access Account'
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email',
              style: {
                width: '100%',
                padding: '15px 20px',
                marginBottom: '20px',
                background: '#ffffff',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '16px',
                outline: 'none',
                transition: 'border-color 0.3s ease',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                padding: '15px 20px',
                marginBottom: '30px',
                background: '#ffffff',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '16px',
                outline: 'none',
                transition: 'border-color 0.3s ease',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '15px',
                background: '#667eea',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                transition: 'background 0.3s ease',
              },
              children: 'Login'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: '#ffffff',
          borderRadius: '12px',
          border: '2px solid #667eea',
          boxShadow: '0 8px 24px rgba(102, 126, 234, 0.15)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '20px', color: '#667eea', fontWeight: '700' }}>Access Account</h3>
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '12px', background: '#ffffff', border: '2px solid #e0e0e0', borderRadius: '6px', fontSize: '12px' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#ffffff', border: '2px solid #e0e0e0', borderRadius: '6px', fontSize: '12px' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: '#667eea', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>Login</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Elegant Login',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '430px',
          margin: '0 auto',
          padding: '50px',
          background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
          borderRadius: '20px',
          boxShadow: '0 15px 50px rgba(0, 0, 0, 0.15)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '40px',
                color: '#2d3748',
                fontSize: '34px',
                fontWeight: '600',
                letterSpacing: '-0.5px',
              },
              children: 'Welcome'
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Your email',
              style: {
                width: '100%',
                padding: '16px 22px',
                marginBottom: '22px',
                background: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Your password',
              style: {
                width: '100%',
                padding: '16px 22px',
                marginBottom: '32px',
                background: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '16px',
                background: '#2d3748',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '17px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(45, 55, 72, 0.3)',
                transition: 'transform 0.2s ease',
              },
              children: 'Sign In'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
          borderRadius: '20px',
          boxShadow: '0 15px 50px rgba(0, 0, 0, 0.15)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '20px', color: '#2d3748', fontWeight: '600' }}>Welcome</h3>
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '12px', background: '#ffffff', border: 'none', borderRadius: '10px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#ffffff', border: 'none', borderRadius: '10px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: '#2d3748', color: '#ffffff', border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>Sign In</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Modern Glass Login',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '440px',
          margin: '0 auto',
          padding: '48px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(30px) saturate(200%)',
          WebkitBackdropFilter: 'blur(30px) saturate(200%)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '24px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '38px',
                color: '#ffffff',
                fontSize: '32px',
                fontWeight: '700',
                textShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
              },
              children: 'Login'
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email address',
              style: {
                width: '100%',
                padding: '16px 22px',
                marginBottom: '22px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '14px',
                fontSize: '16px',
                color: '#ffffff',
                outline: 'none',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                padding: '16px 22px',
                marginBottom: '30px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '14px',
                fontSize: '16px',
                color: '#ffffff',
                outline: 'none',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.3)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                borderRadius: '14px',
                fontSize: '17px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                transition: 'all 0.3s ease',
              },
              children: 'Sign In'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(30px) saturate(200%)',
          WebkitBackdropFilter: 'blur(30px) saturate(200%)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '24px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '20px', color: '#ffffff', fontWeight: '700', textShadow: '0 2px 10px rgba(0, 0, 0, 0.2)' }}>Login</h3>
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '12px', background: 'rgba(255, 255, 255, 0.2)', border: '1px solid rgba(255, 255, 255, 0.3)', borderRadius: '12px', fontSize: '12px', color: '#fff' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: 'rgba(255, 255, 255, 0.2)', border: '1px solid rgba(255, 255, 255, 0.3)', borderRadius: '12px', fontSize: '12px', color: '#fff' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: 'rgba(255, 255, 255, 0.3)', color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.4)', borderRadius: '12px', fontSize: '12px', fontWeight: '700' }}>Sign In</button>
        </div>
      )
    },
  ])

  const [signupComponents] = useState<SignupComponent[]>([
    {
      type: 'form',
      label: 'Glass Signup',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '450px',
          width: '100%',
          margin: '0 auto',
          padding: '45px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '30px',
                color: '#333',
                fontSize: '32px',
                fontWeight: '700',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              },
              children: 'Create Account'
            }
          },
          {
            type: 'input',
            props: {
              type: 'text',
              placeholder: 'Full Name',
              style: {
                width: '100%',
                display: 'block',
                padding: '14px 20px',
                marginBottom: '18px',
                background: 'rgba(255, 255, 255, 0.9)',
                border: '1px solid rgba(102, 126, 234, 0.2)',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email address',
              style: {
                width: '100%',
                display: 'block',
                padding: '14px 20px',
                marginBottom: '18px',
                background: 'rgba(255, 255, 255, 0.9)',
                border: '1px solid rgba(102, 126, 234, 0.2)',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                display: 'block',
                padding: '14px 20px',
                marginBottom: '25px',
                background: 'rgba(255, 255, 255, 0.9)',
                border: '1px solid rgba(102, 126, 234, 0.2)',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '14px',
                marginTop: '10px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(102, 126, 234, 0.4)',
                display: 'block',
                alignSelf: 'stretch',
              },
              children: 'Sign Up'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '20px', fontSize: '18px', color: '#667eea', fontWeight: '700' }}>Create Account</h3>
          <input type="text" placeholder="Full Name" style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '12px' }} readOnly />
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '12px' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '12px' }} readOnly />
          <button style={{ width: '100%', padding: '10px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>Sign Up</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Minimal Signup',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '420px',
          width: '100%',
          margin: '0 auto',
          padding: '50px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '40px',
                color: '#1a1a1a',
                fontSize: '32px',
                fontWeight: '600',
                letterSpacing: '-0.5px',
              },
              children: 'Sign Up'
            }
          },
          {
            type: 'input',
            props: {
              type: 'text',
              placeholder: 'Name',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 20px',
                marginBottom: '18px',
                background: '#f8f9fa',
                border: 'none',
                borderBottom: '2px solid #e0e0e0',
                borderRadius: '0',
                fontSize: '16px',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 20px',
                marginBottom: '18px',
                background: '#f8f9fa',
                border: 'none',
                borderBottom: '2px solid #e0e0e0',
                borderRadius: '0',
                fontSize: '16px',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 20px',
                marginBottom: '30px',
                background: '#f8f9fa',
                border: 'none',
                borderBottom: '2px solid #e0e0e0',
                borderRadius: '0',
                fontSize: '16px',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '16px',
                marginTop: '10px',
                background: '#1a1a1a',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'block',
                alignSelf: 'stretch',
              },
              children: 'Create Account'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '20px', color: '#1a1a1a', fontWeight: '600' }}>Sign Up</h3>
          <input type="text" placeholder="Name" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#f8f9fa', border: 'none', borderBottom: '2px solid #e0e0e0', fontSize: '12px' }} readOnly />
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#f8f9fa', border: 'none', borderBottom: '2px solid #e0e0e0', fontSize: '12px' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#f8f9fa', border: 'none', borderBottom: '2px solid #e0e0e0', fontSize: '12px' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: '#1a1a1a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>Create Account</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Gradient Signup',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '480px',
          width: '100%',
          margin: '0 auto',
          padding: '50px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '24px',
          boxShadow: '0 20px 60px rgba(102, 126, 234, 0.4)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '40px',
                color: '#ffffff',
                fontSize: '36px',
                fontWeight: '700',
              },
              children: 'Join Us'
            }
          },
          {
            type: 'input',
            props: {
              type: 'text',
              placeholder: 'Full Name',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 20px',
                marginBottom: '18px',
                background: 'rgba(255, 255, 255, 0.95)',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email address',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 20px',
                marginBottom: '18px',
                background: 'rgba(255, 255, 255, 0.95)',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 20px',
                marginBottom: '30px',
                background: 'rgba(255, 255, 255, 0.95)',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '16px',
                marginTop: '10px',
                background: '#ffffff',
                color: '#667eea',
                border: 'none',
                borderRadius: '12px',
                fontSize: '18px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                display: 'block',
                alignSelf: 'stretch',
              },
              children: 'Get Started'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '24px',
          boxShadow: '0 20px 60px rgba(102, 126, 234, 0.4)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '22px', color: '#ffffff', fontWeight: '700' }}>Join Us</h3>
          <input type="text" placeholder="Full Name" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: 'rgba(255, 255, 255, 0.95)', border: 'none', borderRadius: '8px', fontSize: '12px' }} readOnly />
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: 'rgba(255, 255, 255, 0.95)', border: 'none', borderRadius: '8px', fontSize: '12px' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: 'rgba(255, 255, 255, 0.95)', border: 'none', borderRadius: '8px', fontSize: '12px' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: '#ffffff', color: '#667eea', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}>Get Started</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Dark Mode Signup',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '430px',
          width: '100%',
          margin: '0 auto',
          padding: '45px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          background: '#1a1a1a',
          borderRadius: '20px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '35px',
                color: '#ffffff',
                fontSize: '30px',
                fontWeight: '600',
              },
              children: 'Create Account'
            }
          },
          {
            type: 'input',
            props: {
              type: 'text',
              placeholder: 'Full Name',
              style: {
                width: '100%',
                display: 'block',
                padding: '15px 20px',
                marginBottom: '18px',
                background: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: '10px',
                fontSize: '16px',
                color: '#ffffff',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email',
              style: {
                width: '100%',
                display: 'block',
                padding: '15px 20px',
                marginBottom: '18px',
                background: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: '10px',
                fontSize: '16px',
                color: '#ffffff',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                display: 'block',
                padding: '15px 20px',
                marginBottom: '30px',
                background: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: '10px',
                fontSize: '16px',
                color: '#ffffff',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '15px',
                marginTop: '10px',
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(79, 172, 254, 0.4)',
                display: 'block',
                alignSelf: 'stretch',
              },
              children: 'Sign Up'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: '#1a1a1a',
          borderRadius: '20px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '20px', color: '#ffffff', fontWeight: '600' }}>Create Account</h3>
          <input type="text" placeholder="Full Name" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: '8px', fontSize: '12px', color: '#fff' }} readOnly />
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: '8px', fontSize: '12px', color: '#fff' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: '8px', fontSize: '12px', color: '#fff' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>Sign Up</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Rounded Signup',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '440px',
          width: '100%',
          margin: '0 auto',
          padding: '45px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          background: '#ffffff',
          borderRadius: '30px',
          boxShadow: '0 15px 50px rgba(0, 0, 0, 0.1)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '35px',
                color: '#333',
                fontSize: '28px',
                fontWeight: '700',
              },
              children: 'Get Started!'
            }
          },
          {
            type: 'input',
            props: {
              type: 'text',
              placeholder: 'Your name',
              style: {
                width: '100%',
                display: 'block',
                padding: '18px 24px',
                marginBottom: '18px',
                background: '#f5f5f5',
                border: '2px solid transparent',
                borderRadius: '20px',
                fontSize: '16px',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Your email',
              style: {
                width: '100%',
                display: 'block',
                padding: '18px 24px',
                marginBottom: '18px',
                background: '#f5f5f5',
                border: '2px solid transparent',
                borderRadius: '20px',
                fontSize: '16px',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Your password',
              style: {
                width: '100%',
                display: 'block',
                padding: '18px 24px',
                marginBottom: '30px',
                background: '#f5f5f5',
                border: '2px solid transparent',
                borderRadius: '20px',
                fontSize: '16px',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '18px',
                marginTop: '10px',
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '20px',
                fontSize: '18px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(245, 87, 108, 0.4)',
                display: 'block',
                alignSelf: 'stretch',
              },
              children: 'Create Account'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: '#ffffff',
          borderRadius: '30px',
          boxShadow: '0 15px 50px rgba(0, 0, 0, 0.1)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '20px', color: '#333', fontWeight: '700' }}>Get Started!</h3>
          <input type="text" placeholder="Name" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#f5f5f5', border: '2px solid transparent', borderRadius: '15px', fontSize: '12px' }} readOnly />
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#f5f5f5', border: '2px solid transparent', borderRadius: '15px', fontSize: '12px' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#f5f5f5', border: '2px solid transparent', borderRadius: '15px', fontSize: '12px' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: '#ffffff', border: 'none', borderRadius: '15px', fontSize: '12px', fontWeight: '600' }}>Create Account</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Neumorphism Signup',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '420px',
          width: '100%',
          margin: '0 auto',
          padding: '50px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          background: '#e0e5ec',
          borderRadius: '24px',
          boxShadow: '20px 20px 60px #bebebe, -20px -20px 60px #ffffff',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '40px',
                color: '#4a5568',
                fontSize: '32px',
                fontWeight: '700',
              },
              children: 'Sign Up'
            }
          },
          {
            type: 'input',
            props: {
              type: 'text',
              placeholder: 'Name',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 20px',
                marginBottom: '22px',
                background: '#e0e5ec',
                border: 'none',
                borderRadius: '16px',
                fontSize: '16px',
                color: '#4a5568',
                outline: 'none',
                boxShadow: 'inset 8px 8px 16px #bebebe, inset -8px -8px 16px #ffffff',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 20px',
                marginBottom: '22px',
                background: '#e0e5ec',
                border: 'none',
                borderRadius: '16px',
                fontSize: '16px',
                color: '#4a5568',
                outline: 'none',
                boxShadow: 'inset 8px 8px 16px #bebebe, inset -8px -8px 16px #ffffff',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 20px',
                marginBottom: '30px',
                background: '#e0e5ec',
                border: 'none',
                borderRadius: '16px',
                fontSize: '16px',
                color: '#4a5568',
                outline: 'none',
                boxShadow: 'inset 8px 8px 16px #bebebe, inset -8px -8px 16px #ffffff',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '16px',
                marginTop: '10px',
                background: '#e0e5ec',
                color: '#667eea',
                border: 'none',
                borderRadius: '16px',
                fontSize: '18px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '8px 8px 16px #bebebe, -8px -8px 16px #ffffff',
                display: 'block',
                alignSelf: 'stretch',
              },
              children: 'Sign Up'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: '#e0e5ec',
          borderRadius: '24px',
          boxShadow: '20px 20px 60px #bebebe, -20px -20px 60px #ffffff',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '20px', color: '#4a5568', fontWeight: '700' }}>Sign Up</h3>
          <input type="text" placeholder="Name" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#e0e5ec', border: 'none', borderRadius: '12px', fontSize: '12px', color: '#4a5568', boxShadow: 'inset 6px 6px 12px #bebebe, inset -6px -6px 12px #ffffff' }} readOnly />
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#e0e5ec', border: 'none', borderRadius: '12px', fontSize: '12px', color: '#4a5568', boxShadow: 'inset 6px 6px 12px #bebebe, inset -6px -6px 12px #ffffff' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#e0e5ec', border: 'none', borderRadius: '12px', fontSize: '12px', color: '#4a5568', boxShadow: 'inset 6px 6px 12px #bebebe, inset -6px -6px 12px #ffffff' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: '#e0e5ec', color: '#667eea', border: 'none', borderRadius: '12px', fontSize: '12px', fontWeight: '700', boxShadow: '6px 6px 12px #bebebe, -6px -6px 12px #ffffff' }}>Sign Up</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Card Signup',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '440px',
          width: '100%',
          margin: '0 auto',
          padding: '40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e8e8e8',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '10px',
                color: '#1a1a1a',
                fontSize: '26px',
                fontWeight: '600',
              },
              children: 'Create New Account'
            }
          },
          {
            type: 'p',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '35px',
                color: '#666',
                fontSize: '14px',
              },
              children: 'Fill in your details to get started'
            }
          },
          {
            type: 'input',
            props: {
              type: 'text',
              placeholder: 'Full Name',
              style: {
                width: '100%',
                display: 'block',
                padding: '14px 18px',
                marginBottom: '16px',
                background: '#fafafa',
                border: '1px solid #e0e0e0',
                borderRadius: '10px',
                fontSize: '15px',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email address',
              style: {
                width: '100%',
                display: 'block',
                padding: '14px 18px',
                marginBottom: '16px',
                background: '#fafafa',
                border: '1px solid #e0e0e0',
                borderRadius: '10px',
                fontSize: '15px',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                display: 'block',
                padding: '14px 18px',
                marginBottom: '25px',
                background: '#fafafa',
                border: '1px solid #e0e0e0',
                borderRadius: '10px',
                fontSize: '15px',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '14px',
                marginTop: '10px',
                background: '#667eea',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                display: 'block',
                alignSelf: 'stretch',
              },
              children: 'Sign Up'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '25px',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e8e8e8',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '8px', fontSize: '18px', color: '#1a1a1a', fontWeight: '600' }}>Create New Account</h3>
          <p style={{ textAlign: 'center', marginBottom: '20px', color: '#666', fontSize: '11px' }}>Fill in your details</p>
          <input type="text" placeholder="Full Name" style={{ width: '100%', padding: '10px', marginBottom: '8px', background: '#fafafa', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '12px' }} readOnly />
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '10px', marginBottom: '8px', background: '#fafafa', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '12px' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '10px', marginBottom: '15px', background: '#fafafa', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '12px' }} readOnly />
          <button style={{ width: '100%', padding: '10px', background: '#667eea', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>Sign Up</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Bordered Signup',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '420px',
          width: '100%',
          margin: '0 auto',
          padding: '45px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          background: '#ffffff',
          borderRadius: '12px',
          border: '2px solid #667eea',
          boxShadow: '0 8px 24px rgba(102, 126, 234, 0.15)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '35px',
                color: '#667eea',
                fontSize: '30px',
                fontWeight: '700',
              },
              children: 'Register'
            }
          },
          {
            type: 'input',
            props: {
              type: 'text',
              placeholder: 'Full Name',
              style: {
                width: '100%',
                display: 'block',
                padding: '15px 20px',
                marginBottom: '18px',
                background: '#ffffff',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '16px',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email',
              style: {
                width: '100%',
                display: 'block',
                padding: '15px 20px',
                marginBottom: '18px',
                background: '#ffffff',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '16px',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                display: 'block',
                padding: '15px 20px',
                marginBottom: '30px',
                background: '#ffffff',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '16px',
                outline: 'none',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '15px',
                marginTop: '10px',
                background: '#667eea',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                display: 'block',
                alignSelf: 'stretch',
              },
              children: 'Create Account'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: '#ffffff',
          borderRadius: '12px',
          border: '2px solid #667eea',
          boxShadow: '0 8px 24px rgba(102, 126, 234, 0.15)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '20px', color: '#667eea', fontWeight: '700' }}>Register</h3>
          <input type="text" placeholder="Full Name" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#ffffff', border: '2px solid #e0e0e0', borderRadius: '6px', fontSize: '12px' }} readOnly />
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#ffffff', border: '2px solid #e0e0e0', borderRadius: '6px', fontSize: '12px' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#ffffff', border: '2px solid #e0e0e0', borderRadius: '6px', fontSize: '12px' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: '#667eea', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>Create Account</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Elegant Signup',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '450px',
          width: '100%',
          margin: '0 auto',
          padding: '50px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
          borderRadius: '20px',
          boxShadow: '0 15px 50px rgba(0, 0, 0, 0.15)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '40px',
                color: '#2d3748',
                fontSize: '34px',
                fontWeight: '600',
                letterSpacing: '-0.5px',
              },
              children: 'Welcome'
            }
          },
          {
            type: 'input',
            props: {
              type: 'text',
              placeholder: 'Your name',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 22px',
                marginBottom: '20px',
                background: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Your email',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 22px',
                marginBottom: '20px',
                background: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Your password',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 22px',
                marginBottom: '32px',
                background: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '16px',
                marginTop: '10px',
                background: '#2d3748',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '17px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(45, 55, 72, 0.3)',
                display: 'block',
                alignSelf: 'stretch',
              },
              children: 'Sign Up'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
          borderRadius: '20px',
          boxShadow: '0 15px 50px rgba(0, 0, 0, 0.15)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '20px', color: '#2d3748', fontWeight: '600' }}>Welcome</h3>
          <input type="text" placeholder="Name" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#ffffff', border: 'none', borderRadius: '10px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)' }} readOnly />
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#ffffff', border: 'none', borderRadius: '10px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#ffffff', border: 'none', borderRadius: '10px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: '#2d3748', color: '#ffffff', border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>Sign Up</button>
        </div>
      )
    },
    {
      type: 'form',
      label: 'Modern Glass Signup',
      icon: <FiUser />,
      defaultProps: {
        style: {
          maxWidth: '460px',
          width: '100%',
          margin: '0 auto',
          padding: '48px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(30px) saturate(200%)',
          WebkitBackdropFilter: 'blur(30px) saturate(200%)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '24px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
        },
        children: [
          {
            type: 'h2',
            props: {
              style: {
                textAlign: 'center',
                marginBottom: '38px',
                color: '#ffffff',
                fontSize: '32px',
                fontWeight: '700',
                textShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
              },
              children: 'Sign Up'
            }
          },
          {
            type: 'input',
            props: {
              type: 'text',
              placeholder: 'Full Name',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 22px',
                marginBottom: '20px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '14px',
                fontSize: '16px',
                color: '#ffffff',
                outline: 'none',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'email',
              placeholder: 'Email address',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 22px',
                marginBottom: '20px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '14px',
                fontSize: '16px',
                color: '#ffffff',
                outline: 'none',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'input',
            props: {
              type: 'password',
              placeholder: 'Password',
              style: {
                width: '100%',
                display: 'block',
                padding: '16px 22px',
                marginBottom: '30px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '14px',
                fontSize: '16px',
                color: '#ffffff',
                outline: 'none',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                boxSizing: 'border-box',
              }
            }
          },
          {
            type: 'button',
            props: {
              style: {
                width: '100%',
                padding: '16px',
                marginTop: '10px',
                background: 'rgba(255, 255, 255, 0.3)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                borderRadius: '14px',
                fontSize: '17px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                display: 'block',
                alignSelf: 'stretch',
              },
              children: 'Create Account'
            }
          }
        ]
      },
      preview: (
        <div style={{
          maxWidth: '300px',
          padding: '30px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(30px) saturate(200%)',
          WebkitBackdropFilter: 'blur(30px) saturate(200%)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '24px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
        }}>
          <h3 style={{ textAlign: 'center', marginBottom: '25px', fontSize: '20px', color: '#ffffff', fontWeight: '700', textShadow: '0 2px 10px rgba(0, 0, 0, 0.2)' }}>Sign Up</h3>
          <input type="text" placeholder="Full Name" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: 'rgba(255, 255, 255, 0.2)', border: '1px solid rgba(255, 255, 255, 0.3)', borderRadius: '12px', fontSize: '12px', color: '#fff' }} readOnly />
          <input type="email" placeholder="Email" style={{ width: '100%', padding: '12px', marginBottom: '10px', background: 'rgba(255, 255, 255, 0.2)', border: '1px solid rgba(255, 255, 255, 0.3)', borderRadius: '12px', fontSize: '12px', color: '#fff' }} readOnly />
          <input type="password" placeholder="Password" style={{ width: '100%', padding: '12px', marginBottom: '20px', background: 'rgba(255, 255, 255, 0.2)', border: '1px solid rgba(255, 255, 255, 0.3)', borderRadius: '12px', fontSize: '12px', color: '#fff' }} readOnly />
          <button style={{ width: '100%', padding: '12px', background: 'rgba(255, 255, 255, 0.3)', color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.4)', borderRadius: '12px', fontSize: '12px', fontWeight: '700' }}>Create Account</button>
        </div>
      )
    },
  ])

  if (!isOpen) return null

  return (
    <div className="prebuilt-components-modal-overlay">
      <div 
        ref={modalRef}
        className="prebuilt-components-modal" 
        onClick={(e) => e.stopPropagation()}
        style={{
          ...(position ? {
            left: `${position.x}px`,
            top: `${position.y}px`,
            transform: 'none',
            marginLeft: '0',
            marginTop: '0'
          } : {}),
          cursor: isDragging ? 'grabbing' : 'default'
        }}
      >
        <div 
          className="prebuilt-components-modal-header"
          onMouseDown={handleMouseDown}
          style={{ cursor: 'grab' }}
        >
          <h2>Pre-built Components</h2>
          <button className="prebuilt-components-modal-close" onClick={onClose}>
            <FiX size={24} />
          </button>
        </div>
        <div className="prebuilt-components-modal-select">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as 'charts' | 'cards' | 'logos' | 'buttons' | 'inputs' | 'navbars' | 'tables' | 'logins' | 'signups')}
            className="prebuilt-tab-select"
          >
            <option value="charts">Charts</option>
            <option value="cards">Cards</option>
            <option value="logos">Logos</option>
            <option value="buttons">Buttons</option>
            <option value="inputs">Inputs</option>
            <option value="navbars">Navbars</option>
            <option value="tables">Tables</option>
            <option value="logins">Login Forms</option>
            <option value="signups">Signup Forms</option>
          </select>
        </div>
        <div className="prebuilt-components-modal-content">
          <div className="prebuilt-components-grid">
            {activeTab === 'charts' && chartComponents.map((component, index) => (
              <ChartComponentItem key={`${component.type}-${component.label}-${index}`} component={component} />
            ))}
            {activeTab === 'cards' && cardComponents.map((component, index) => (
              <CardComponentItem key={`${component.type}-${component.label}-${index}`} component={component} />
            ))}
            {activeTab === 'logos' && logoComponents.map((component, index) => (
              <LogoComponentItem key={`${component.type}-${component.label}-${index}`} component={component} />
            ))}
            {activeTab === 'buttons' && buttonComponents.map((component, index) => (
              <ButtonComponentItem key={`${component.type}-${component.label}-${index}`} component={component} />
            ))}
            {activeTab === 'inputs' && inputComponents.map((component, index) => (
              <InputComponentItem key={`${component.type}-${component.label}-${index}`} component={component} />
            ))}
            {activeTab === 'navbars' && navbarComponents.map((component, index) => (
              <NavbarComponentItem key={`${component.type}-${component.label}-${index}`} component={component} />
            ))}
            {activeTab === 'tables' && tableComponents.map((component, index) => (
              <TableComponentItem key={`${component.type}-${component.label}-${index}`} component={component} />
            ))}
            {activeTab === 'logins' && loginComponents.map((component, index) => (
              <LoginComponentItem key={`${component.type}-${component.label}-${index}`} component={component} />
            ))}
            {activeTab === 'signups' && signupComponents.map((component, index) => (
              <SignupComponentItem key={`${component.type}-${component.label}-${index}`} component={component} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PreBuiltComponentsModal

