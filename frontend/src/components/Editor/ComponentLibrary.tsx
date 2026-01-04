import { useState } from 'react'
import { useDrag } from 'react-dnd'
import {
  FiSquare,
  FiType,
  FiImage,
  FiLayout,
  FiCircle,
  FiList,
  FiLink,
  FiVideo,
  FiFileText,
  FiCode,
  FiAlignLeft,
  FiSidebar,
  FiMinus,
  FiCheck,
  FiEdit,
  FiGrid,
  FiPackage,
} from 'react-icons/fi'
import './ComponentLibrary.css'

interface ComponentItemProps {
  type: string
  label: string
  icon: React.ReactNode
  defaultProps?: any
}

const ComponentItem = ({ type, label, icon, defaultProps }: ComponentItemProps) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: { type, props: defaultProps },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  return (
    <div
      ref={drag}
      className={`component-item ${isDragging ? 'dragging' : ''}`}
    >
      <div className="component-icon">{icon}</div>
      <span>{label}</span>
    </div>
  )
}

const ComponentLibrary = () => {

  const components = [
    // Layout & Structure
    {
      type: 'div',
      label: 'Div',
      icon: <FiSquare />,
      defaultProps: { className: '', style: {} },
    },
    {
      type: 'section',
      label: 'Section',
      icon: <FiLayout />,
      defaultProps: { className: '', style: {} },
    },
    {
      type: 'article',
      label: 'Article',
      icon: <FiFileText />,
      defaultProps: { className: '', style: {} },
    },
    {
      type: 'aside',
      label: 'Aside',
      icon: <FiSidebar />,
      defaultProps: { className: '', style: {} },
    },
    {
      type: 'header',
      label: 'Header',
      icon: <FiLayout />,
      defaultProps: { className: '', style: {} },
    },
    {
      type: 'footer',
      label: 'Footer',
      icon: <FiLayout />,
      defaultProps: { className: '', style: {} },
    },
    {
      type: 'nav',
      label: 'Nav',
      icon: <FiLayout />,
      defaultProps: { className: '', style: {} },
    },
    {
      type: 'main',
      label: 'Main',
      icon: <FiLayout />,
      defaultProps: { className: '', style: {} },
    },

    // Headings
    {
      type: 'h1',
      label: 'Heading 1',
      icon: <FiType />,
      defaultProps: { children: 'Heading 1', style: {} },
    },
    {
      type: 'h2',
      label: 'Heading 2',
      icon: <FiType />,
      defaultProps: { children: 'Heading 2', style: {} },
    },
    {
      type: 'h3',
      label: 'Heading 3',
      icon: <FiType />,
      defaultProps: { children: 'Heading 3', style: {} },
    },
    {
      type: 'h4',
      label: 'Heading 4',
      icon: <FiType />,
      defaultProps: { children: 'Heading 4', style: {} },
    },
    {
      type: 'h5',
      label: 'Heading 5',
      icon: <FiType />,
      defaultProps: { children: 'Heading 5', style: {} },
    },
    {
      type: 'h6',
      label: 'Heading 6',
      icon: <FiType />,
      defaultProps: { children: 'Heading 6', style: {} },
    },

    // Text Content
    {
      type: 'p',
      label: 'Paragraph',
      icon: <FiType />,
      defaultProps: { children: 'Text content', style: {} },
    },
    {
      type: 'span',
      label: 'Span',
      icon: <FiType />,
      defaultProps: { children: 'Span text', style: {} },
    },
    {
      type: 'strong',
      label: 'Strong',
      icon: <FiType />,
      defaultProps: { children: 'Bold text', style: {} },
    },
    {
      type: 'em',
      label: 'Emphasis',
      icon: <FiType />,
      defaultProps: { children: 'Italic text', style: {} },
    },
    {
      type: 'small',
      label: 'Small',
      icon: <FiType />,
      defaultProps: { children: 'Small text', style: {} },
    },
    {
      type: 'mark',
      label: 'Mark',
      icon: <FiType />,
      defaultProps: { children: 'Highlighted text', style: {} },
    },
    {
      type: 'code',
      label: 'Code',
      icon: <FiCode />,
      defaultProps: { children: 'code', style: {} },
    },
    {
      type: 'pre',
      label: 'Preformatted',
      icon: <FiCode />,
      defaultProps: { children: 'Preformatted text', style: {} },
    },
    {
      type: 'blockquote',
      label: 'Blockquote',
      icon: <FiAlignLeft />,
      defaultProps: { children: 'Quote text', style: {} },
    },
    {
      type: 'hr',
      label: 'Horizontal Rule',
      icon: <FiMinus />,
      defaultProps: { style: {} },
    },
    {
      type: 'br',
      label: 'Line Break',
      icon: <FiMinus />,
      defaultProps: { style: {} },
    },

    // Lists
    {
      type: 'ul',
      label: 'Unordered List',
      icon: <FiList />,
      defaultProps: { style: {} },
    },
    {
      type: 'ol',
      label: 'Ordered List',
      icon: <FiList />,
      defaultProps: { style: {} },
    },
    {
      type: 'li',
      label: 'List Item',
      icon: <FiList />,
      defaultProps: { children: 'List item', style: {} },
    },
    {
      type: 'dl',
      label: 'Description List',
      icon: <FiList />,
      defaultProps: { style: {} },
    },
    {
      type: 'dt',
      label: 'Description Term',
      icon: <FiList />,
      defaultProps: { children: 'Term', style: {} },
    },
    {
      type: 'dd',
      label: 'Description',
      icon: <FiList />,
      defaultProps: { children: 'Description', style: {} },
    },

    // Links & Media
    {
      type: 'a',
      label: 'Link',
      icon: <FiLink />,
      defaultProps: { href: '#', children: 'Link text', style: {} },
    },
    {
      type: 'img',
      label: 'Image',
      icon: <FiImage />,
      defaultProps: { src: 'https://via.placeholder.com/300x200', alt: 'Image', style: {} },
    },
    {
      type: 'video',
      label: 'Video',
      icon: <FiVideo />,
      defaultProps: { src: '', controls: true, style: {} },
    },
    {
      type: 'audio',
      label: 'Audio',
      icon: <FiVideo />,
      defaultProps: { src: '', controls: true, style: {} },
    },
    {
      type: 'iframe',
      label: 'Iframe',
      icon: <FiSquare />,
      defaultProps: { src: '', style: {} },
    },

    // Forms
    {
      type: 'form',
      label: 'Form',
      icon: <FiFileText />,
      defaultProps: { action: '#', method: 'post', style: {} },
    },
    {
      type: 'input',
      label: 'Input',
      icon: <FiEdit />,
      defaultProps: { type: 'text', placeholder: 'Enter text...', style: {} },
    },
    {
      type: 'textarea',
      label: 'Textarea',
      icon: <FiEdit />,
      defaultProps: { placeholder: 'Enter text...', rows: 4, style: {} },
    },
    {
      type: 'button',
      label: 'Button',
      icon: <FiCircle />,
      defaultProps: { children: 'Button', style: {} },
    },
    {
      type: 'select',
      label: 'Select',
      icon: <FiEdit />,
      defaultProps: { style: {} },
    },
    {
      type: 'option',
      label: 'Option',
      icon: <FiEdit />,
      defaultProps: { children: 'Option', style: {} },
    },
    {
      type: 'label',
      label: 'Label',
      icon: <FiType />,
      defaultProps: { children: 'Label', style: {} },
    },
    {
      type: 'fieldset',
      label: 'Fieldset',
      icon: <FiSquare />,
      defaultProps: { style: {} },
    },
    {
      type: 'legend',
      label: 'Legend',
      icon: <FiType />,
      defaultProps: { children: 'Legend', style: {} },
    },
    {
      type: 'checkbox',
      label: 'Checkbox',
      icon: <FiCheck />,
      defaultProps: { type: 'checkbox', style: {} },
    },
    {
      type: 'radio',
      label: 'Radio',
      icon: <FiCircle />,
      defaultProps: { type: 'radio', style: {} },
    },

    // Tables
    {
      type: 'table',
      label: 'Table',
      icon: <FiGrid />,
      defaultProps: { style: {} },
    },
    {
      type: 'thead',
      label: 'Table Head',
      icon: <FiGrid />,
      defaultProps: { style: {} },
    },
    {
      type: 'tbody',
      label: 'Table Body',
      icon: <FiGrid />,
      defaultProps: { style: {} },
    },
    {
      type: 'tfoot',
      label: 'Table Foot',
      icon: <FiGrid />,
      defaultProps: { style: {} },
    },
    {
      type: 'tr',
      label: 'Table Row',
      icon: <FiGrid />,
      defaultProps: { style: {} },
    },
    {
      type: 'th',
      label: 'Table Header',
      icon: <FiGrid />,
      defaultProps: { children: 'Header', style: {} },
    },
    {
      type: 'td',
      label: 'Table Cell',
      icon: <FiGrid />,
      defaultProps: { children: 'Cell', style: {} },
    },

    // Other
    {
      type: 'figure',
      label: 'Figure',
      icon: <FiImage />,
      defaultProps: { style: {} },
    },
    {
      type: 'figcaption',
      label: 'Figure Caption',
      icon: <FiType />,
      defaultProps: { children: 'Caption', style: {} },
    },
    {
      type: 'address',
      label: 'Address',
      icon: <FiType />,
      defaultProps: { children: 'Address', style: {} },
    },
    {
      type: 'time',
      label: 'Time',
      icon: <FiType />,
      defaultProps: { children: '2024-01-01', style: {} },
    },
    {
      type: 'abbr',
      label: 'Abbreviation',
      icon: <FiType />,
      defaultProps: { children: 'Abbr', title: 'Abbreviation', style: {} },
    },

    // Charts moved to Pre-built Components Modal - use "Pre-built" button above
  ]

  return (
    <>
      <div className="component-library">
        <div className="component-library-header">
          <h3>Components</h3>
        </div>
        <div className="component-list">
          {components.map((comp, index) => (
            <ComponentItem
              key={`${comp.type}-${comp.label}-${index}`}
              type={comp.type}
              label={comp.label}
              icon={comp.icon}
              defaultProps={comp.defaultProps}
            />
          ))}
        </div>
      </div>
    </>
  )
}

export default ComponentLibrary
