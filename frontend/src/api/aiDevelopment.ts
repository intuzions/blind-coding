import api from './axios'

export interface CodeGenerationRequest {
  description: string
  component_type?: string
  language?: string
  context?: Record<string, any>
  frontend_framework?: string
  backend_framework?: string
}

export interface ComponentGenerationRequest {
  description: string
  component_type?: string
  style_preferences?: Record<string, any>
  existing_components?: Array<Record<string, any>>
  frontend_framework?: string
  backend_framework?: string
}

export interface CodeExplanationRequest {
  code: string
  language?: string
}

export interface BugFixRequest {
  code: string
  error_message?: string
  language?: string
}

export interface PageGenerationRequest {
  description: string
  page_type?: string
  style_preferences?: Record<string, any>
  frontend_framework?: string
  backend_framework?: string
}

export interface ApplicationGenerationRequest {
  description: string
  css_framework?: string  // tailwind, bootstrap
  frontend_framework?: string
  backend_framework?: string
}

export interface AIDevelopmentResponse {
  result: any
  explanation?: string
  suggestions?: string[]
  code?: string
}

export const aiDevelopmentAPI = {
  generateCode: async (request: CodeGenerationRequest): Promise<AIDevelopmentResponse> => {
    const response = await api.post<AIDevelopmentResponse>('/ai-dev/generate-code', request)
    return response.data
  },

  generateComponent: async (request: ComponentGenerationRequest): Promise<AIDevelopmentResponse> => {
    const response = await api.post<AIDevelopmentResponse>('/ai-dev/generate-component', request)
    return response.data
  },

  explainCode: async (request: CodeExplanationRequest): Promise<AIDevelopmentResponse> => {
    const response = await api.post<AIDevelopmentResponse>('/ai-dev/explain-code', request)
    return response.data
  },

  fixBug: async (request: BugFixRequest): Promise<AIDevelopmentResponse> => {
    const response = await api.post<AIDevelopmentResponse>('/ai-dev/fix-bug', request)
    return response.data
  },

  generatePage: async (request: PageGenerationRequest): Promise<AIDevelopmentResponse> => {
    const response = await api.post<AIDevelopmentResponse>('/ai-dev/generate-page', request)
    return response.data
  },

  generateApplication: async (request: ApplicationGenerationRequest): Promise<AIDevelopmentResponse> => {
    const response = await api.post<AIDevelopmentResponse>('/ai-dev/generate-application', request)
    return response.data
  }
}




