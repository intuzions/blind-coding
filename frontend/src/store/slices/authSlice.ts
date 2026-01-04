import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { authAPI } from '../../api/auth'
import { User } from '../../types'

interface AuthState {
  user: User | null
  token: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
}

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('token'),
  refreshToken: localStorage.getItem('refreshToken'),
  isAuthenticated: !!localStorage.getItem('token'),
  loading: false,
  error: null,
}

export const loginUser = createAsyncThunk(
  'auth/login',
  async ({ email, password }: { email: string; password: string }) => {
    const response = await authAPI.login(email, password)
    localStorage.setItem('token', response.access_token)
    localStorage.setItem('refreshToken', response.refresh_token)
    return response
  }
)

export const refreshAccessToken = createAsyncThunk(
  'auth/refresh',
  async (refreshToken: string) => {
    const response = await authAPI.refreshToken(refreshToken)
    localStorage.setItem('token', response.access_token)
    localStorage.setItem('refreshToken', response.refresh_token)
    return response
  }
)

export const registerUser = createAsyncThunk(
  'auth/register',
  async (data: {
    username: string
    email: string
    password: string
    repeat_password: string
    first_name?: string
    last_name?: string
    personal_website?: string
  }) => {
    const response = await authAPI.register(data)
    return response
  }
)

export const getCurrentUser = createAsyncThunk('auth/me', async () => {
  const response = await authAPI.getCurrentUser()
  return response
})

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.user = null
      state.token = null
      state.refreshToken = null
      state.isAuthenticated = false
      const refreshToken = localStorage.getItem('refreshToken')
      if (refreshToken) {
        // Call logout API but don't wait for it
        authAPI.logout(refreshToken).catch((error) => {
          console.error('Logout error:', error)
        })
      }
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
    },
    setTokens: (state, action: PayloadAction<{ access_token: string; refresh_token: string }>) => {
      state.token = action.payload.access_token
      state.refreshToken = action.payload.refresh_token
      localStorage.setItem('token', action.payload.access_token)
      localStorage.setItem('refreshToken', action.payload.refresh_token)
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false
        state.token = action.payload.access_token
        state.refreshToken = action.payload.refresh_token
        state.isAuthenticated = true
      })
      .addCase(refreshAccessToken.fulfilled, (state, action) => {
        state.token = action.payload.access_token
        state.refreshToken = action.payload.refresh_token
        state.isAuthenticated = true
      })
      .addCase(refreshAccessToken.rejected, (state) => {
        state.token = null
        state.refreshToken = null
        state.isAuthenticated = false
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Login failed'
      })
      .addCase(registerUser.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(registerUser.fulfilled, (state) => {
        state.loading = false
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Registration failed'
      })
      .addCase(getCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload
        state.isAuthenticated = true
      })
  },
})

export const { logout, clearError, setTokens } = authSlice.actions
export default authSlice.reducer

