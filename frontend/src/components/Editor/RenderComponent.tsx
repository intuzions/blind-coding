import { useDrop } from 'react-dnd'
import { ComponentNode } from '../../types/editor'
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

  const [{ isOver }, drop] = useDrop({
    accept: 'component',
    drop: (item: { type: string; props?: any }, monitor) => {
      // Only handle drop if it's directly on this component (not bubbled from child)
      if (monitor.didDrop()) {
        return
      }
      
      const newComponent: ComponentNode = {
        id: `comp-${Date.now()}-${Math.random()}`,
        type: item.type,
        props: item.props || {},
        children: [],
        parentId: component.id,
      }
      onAdd(newComponent, component.id)
      
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
    // Only add position: relative if position is not already set
    const finalStyle = {
      ...style,
      ...(style.position ? {} : { position: 'relative' }),
    }
    const elementProps: any = {
      ...props,
      style: finalStyle,
      onClick: handleClick,
      className: `${props?.className || ''} ${isSelected ? 'selected' : ''}`.trim(),
    }

    // Remove children from props if it's a string (for text content)
    if (typeof props?.children === 'string') {
      delete elementProps.children
    }

    const DropWrapper = ({ children: wrapperChildren }: { children: React.ReactNode }) => (
      <div ref={drop} style={{ display: 'contents' }}>
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

    const renderWithChildren = (Tag: keyof JSX.IntrinsicElements) => (
      <DropWrapper>
        <Tag {...elementProps}>
          {typeof props?.children === 'string' && props.children}
          {renderChildren()}
        </Tag>
      </DropWrapper>
    )

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

    // Standard HTML elements
    switch (type) {
      // Layout & Structure
      case 'div':
      case 'section':
      case 'article':
      case 'aside':
      case 'header':
      case 'footer':
      case 'nav':
      case 'main':
        return (
          <DropWrapper>
            <div {...elementProps}>
              {children.length > 0 ? (
                renderChildren()
              ) : (
                <div className="component-placeholder">
                  {isOver ? 'Drop here' : 'Empty'}
                </div>
              )}
              {typeof props?.children === 'string' && props.children}
            </div>
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
        return (
          <DropWrapper>
            <form {...elementProps} action={props?.action || '#'} method={props?.method || 'post'}>
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
        return (
          <DropWrapper>
            <button {...elementProps}>
              {props?.children || 'Button'}
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
            <Tag {...elementProps}>
              {typeof props?.children === 'string' && props.children}
              {renderChildren()}
            </Tag>
          </DropWrapper>
        )
    }
  }

  return (
    <div className={`render-component-wrapper ${isSelected ? 'selected-wrapper' : ''}`}>
      {renderElement()}
    </div>
  )
}

export default RenderComponent
