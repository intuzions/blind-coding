import api from './axios'

export interface AIRequest {
  prompt: string
  component_type?: string
  current_styles?: Record<string, any>
  current_props?: Record<string, any>
}

export interface AIResponse {
  changes: {
    style?: Record<string, any>
    type?: string
    props?: Record<string, any>
    create_modal?: any
  }
  message: string
  explanation?: string
  guess?: string
  needs_clarification?: boolean
}

export const aiAssistantAPI = {
  processPrompt: async (request: AIRequest): Promise<AIResponse> => {
    const response = await api.post<AIResponse>('/ai/process-prompt', request)
    return response.data
  }
}

