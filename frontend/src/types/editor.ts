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
  }
  children?: ComponentNode[]
  parentId?: string
}

export interface EditorState {
  components: ComponentNode[]
  selectedId: string | null
}

