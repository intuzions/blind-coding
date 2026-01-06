export interface ComponentNode {
  id: string
  type: string
  props?: {
    [key: string]: any
    style?: {
      [key: string]: string
    }
    children?: string | ComponentNode[]
    className?: string
    customCSS?: string
    pageId?: string // ID of the page this component navigates to
  }
  children?: ComponentNode[]
  parentId?: string
}

export interface Page {
  id: string
  name: string
  route: string
  componentIds: string[] // Components that belong to this page
}

export interface EditorState {
  components: ComponentNode[]
  selectedId: string | null
  pages: Page[]
  currentPageId: string | null
}

