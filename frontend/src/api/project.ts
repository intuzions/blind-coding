import api from './axios'
import { Project } from '../types'

export const projectAPI = {
  getAll: async (): Promise<Project[]> => {
    const response = await api.get('/projects/')
    return response.data
  },

  getOne: async (id: number): Promise<Project> => {
    const response = await api.get(`/projects/${id}`)
    return response.data
  },

  create: async (data: { 
    name: string; 
    description?: string; 
    frontend_framework?: string; 
    backend_framework?: string; 
    database_type?: string; 
    database_url?: string;
    database_name?: string;
    database_username?: string;
    database_password?: string;
    database_host?: string;
    database_port?: string;
  }): Promise<Project> => {
    const response = await api.post('/projects/', data)
    return response.data
  },

  update: async (id: number, data: Partial<Project>): Promise<Project> => {
    const response = await api.put(`/projects/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/projects/${id}`)
  },
}

