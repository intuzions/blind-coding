import api from './axios'

export interface SettingsRequest {
  admin_email?: string
  admin_password?: string
  cloud_provider?: string
  cloud_region?: string
  cloud_access_key?: string
  cloud_secret_key?: string
  database_type?: string
  database_username?: string
  database_password?: string
  database_host?: string
  database_port?: string
  database_name?: string
  environment_variables?: Record<string, { value: string; isPublic: boolean }>
}

export interface TokenVerifyRequest {
  token: string
}

export interface TokenVerifyResponse {
  valid: boolean
  setup_token?: string
  message?: string
}

export interface TokenValidateResponse {
  valid: boolean
  remaining_seconds?: number
  message?: string
}

export interface SettingsResponse {
  success: boolean
  message: string
  env_file_path?: string
}

export interface SettingsData {
  admin_email?: string
  cloud_provider?: string
  cloud_region?: string
  cloud_access_key?: string
  cloud_secret_key?: string
  database_type?: string
  database_username?: string
  database_password?: string
  database_host?: string
  database_port?: string
  database_name?: string
  environment_variables?: Record<string, { value: string; isPublic: boolean } | string>
}

export interface ConfiguredResponse {
  configured: boolean
  message?: string
}

export const settingsAPI = {
  getSettings: async (): Promise<SettingsData> => {
    const response = await api.get<SettingsData>('/settings/')
    return response.data
  },
  saveSettings: async (settings: SettingsRequest): Promise<SettingsResponse> => {
    const response = await api.post<SettingsResponse>('/settings/save', settings)
    return response.data
  },
  verifyToken: async (token: string): Promise<TokenVerifyResponse> => {
    const response = await api.post<TokenVerifyResponse>('/settings/verify-token', { token })
    return response.data
  },
  validateSetupToken: async (token: string): Promise<TokenValidateResponse> => {
    const response = await api.post<TokenValidateResponse>('/settings/validate-setup-token', { token })
    return response.data
  },
  invalidateSetupToken: async (token: string): Promise<void> => {
    await api.post('/settings/invalidate-setup-token', { token })
  },
  checkConfigured: async (): Promise<ConfiguredResponse> => {
    const response = await api.get<ConfiguredResponse>('/settings/check-configured')
    return response.data
  }
}

