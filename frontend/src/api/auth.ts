import api from './axios'
import { User, Token } from '../types'

export const authAPI = {
  login: async (email: string, password: string): Promise<Token> => {
    const formData = new FormData()
    formData.append('username', email)
    formData.append('password', password)
    const response = await api.post('/auth/login', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  refreshToken: async (refreshToken: string): Promise<Token> => {
    const formData = new FormData()
    formData.append('username', refreshToken)  // OAuth2PasswordRequestForm uses 'username' field
    formData.append('password', '')  // Required but not used
    const response = await api.post('/auth/refresh', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  logout: async (refreshToken: string): Promise<void> => {
    const formData = new FormData()
    formData.append('username', refreshToken)  // OAuth2PasswordRequestForm uses 'username' field
    formData.append('password', '')  // Required but not used
    await api.post('/auth/logout', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  register: async (data: {
    username: string
    email: string
    password: string
    repeat_password: string
    first_name?: string
    last_name?: string
    personal_website?: string
  }): Promise<User> => {
    const response = await api.post('/auth/register', data)
    return response.data
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await api.get('/auth/me')
    return response.data
  },
}

