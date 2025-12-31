export interface User {
  id: number
  username: string
  email: string
  first_name?: string
  last_name?: string
  personal_website?: string
  created_at: string
}

export interface Project {
  id: number
  name: string
  description?: string
  user_id: number
  html_content?: string
  css_content?: string
  component_tree?: any
  image_url?: string
  published?: string
  created_at: string
  updated_at?: string
}

export interface Token {
  access_token: string
  token_type: string
}

