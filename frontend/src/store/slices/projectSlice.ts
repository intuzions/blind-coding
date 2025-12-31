import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { projectAPI } from '../../api/project'
import { Project } from '../../types'

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  loading: boolean
  error: string | null
}

const initialState: ProjectState = {
  projects: [],
  currentProject: null,
  loading: false,
  error: null,
}

export const fetchProjects = createAsyncThunk('projects/fetchAll', async () => {
  const response = await projectAPI.getAll()
  return response
})

export const fetchProject = createAsyncThunk(
  'projects/fetchOne',
  async (id: number) => {
    const response = await projectAPI.getOne(id)
    return response
  }
)

export const createProject = createAsyncThunk(
  'projects/create',
  async (data: { name: string; description?: string }) => {
    const response = await projectAPI.create(data)
    return response
  }
)

export const updateProject = createAsyncThunk(
  'projects/update',
  async ({ id, data }: { id: number; data: Partial<Project> }) => {
    const response = await projectAPI.update(id, data)
    return response
  }
)

export const deleteProject = createAsyncThunk(
  'projects/delete',
  async (id: number) => {
    await projectAPI.delete(id)
    return id
  }
)

const projectSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    setCurrentProject: (state, action) => {
      state.currentProject = action.payload
    },
    clearCurrentProject: (state) => {
      state.currentProject = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.loading = false
        state.projects = action.payload
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch projects'
      })
      .addCase(fetchProject.fulfilled, (state, action) => {
        state.currentProject = action.payload
      })
      .addCase(createProject.fulfilled, (state, action) => {
        state.projects.push(action.payload)
      })
      .addCase(updateProject.fulfilled, (state, action) => {
        const index = state.projects.findIndex((p) => p.id === action.payload.id)
        if (index !== -1) {
          state.projects[index] = action.payload
        }
        if (state.currentProject?.id === action.payload.id) {
          state.currentProject = action.payload
        }
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        state.projects = state.projects.filter((p) => p.id !== action.payload)
        if (state.currentProject?.id === action.payload) {
          state.currentProject = null
        }
      })
  },
})

export const { setCurrentProject, clearCurrentProject } = projectSlice.actions
export default projectSlice.reducer

