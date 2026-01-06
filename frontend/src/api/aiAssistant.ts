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
    customCSS?: string
    create_modal?: any
  }
  message: string
  explanation?: string
  guess?: string
  needs_clarification?: boolean
  raw_response?: string  // Full raw response from the AI model
}

export interface ActionRequest {
  action_message: string
  component_type?: string
  component_id?: string
  current_props?: Record<string, any>
  pages?: Array<{ id: string; name: string; route: string }>
}

export interface ActionResponse {
  action_code: string
  explanation: string
  changes: {
    props?: Record<string, any>
  }
  detailed_changes?: string
  project_impact?: string
  needs_confirmation: boolean
}

export interface DebugRequest {
  error_message: string
  error_traceback?: string
  file_path?: string
  project_id?: number
}

export interface DebugResponse {
  issue_identified: string
  root_cause: string
  fix_code: string
  file_path: string
  explanation: string
  confidence: number
  needs_confirmation: boolean
  fix_applied: boolean
  docker_rebuilt: boolean
  application_url?: string
}

export interface FormAPIRequest {
  component_id: string
  component_data: Record<string, any>
  project_id: number
}

export interface FormAPIResponse {
  success: boolean
  message: string
  summary: string
  api_url?: string
  generated_model_name?: string
  fields?: Array<{
    name: string
    type: string
    input_type: string
    db_type: string
    required: boolean
    validation: Record<string, any>
  }>
  files_created: string[]
  database_status?: string
  test_file?: string
  errors: string[]
  warnings: string[]
}

export const aiAssistantAPI = {
  processPrompt: async (request: AIRequest): Promise<AIResponse> => {
    const response = await api.post<AIResponse>('/ai/process-prompt', request)
    return response.data
  },
  processAction: async (request: ActionRequest): Promise<ActionResponse> => {
    const response = await api.post<ActionResponse>('/ai/process-action', request)
    return response.data
  },
  debugFix: async (request: DebugRequest): Promise<DebugResponse> => {
    const response = await api.post<DebugResponse>('/ai/debug-fix', request)
    return response.data
  },
  generateFormAPI: async (request: FormAPIRequest): Promise<FormAPIResponse> => {
    const response = await api.post<FormAPIResponse>('/ai/generate-form-api', request)
    return response.data
  }
}

