/**
 * API Client for backend communication
 *
 * Handles:
 * - HTTP requests to Django REST API
 * - Authentication with JWT tokens
 * - Device ID header for sync tracking
 * - Request/response interceptors
 * - Error handling and retry logic
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getDeviceId, getDeviceFingerprint, setServerDeviceId, clearDeviceIds } from '../db';
import {
  Task,
  Comment,
  TaskHistory,
  PaginatedResponse,
  TaskFilters,
  TaskOrderBy,
  CreateTaskInput,
  UpdateTaskInput,
  CreateCommentInput,
  UpdateCommentInput,
  ApiError
} from '../types';

/**
 * API Client class
 */
class ApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: 'http://localhost:8000',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Load tokens from localStorage
    this.loadTokens();

    // Request interceptor - add auth and device headers
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // Add device ID header
        config.headers['X-Device-ID'] = getDeviceId();

        // Add auth token if available
        if (this.accessToken) {
          config.headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle 401 and refresh token
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // Handle 401 Unauthorized - try to refresh token
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            await this.refreshAccessToken();
            return this.client(originalRequest);
          } catch (refreshError) {
            // Refresh failed, clear tokens (React auth state will show login page)
            this.clearTokens();
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(this.formatError(error));
      }
    );
  }

  /**
   * Set authentication tokens
   */
  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
  }

  /**
   * Clear authentication tokens
   */
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  /**
   * Load tokens from localStorage
   */
  private loadTokens() {
    this.accessToken = localStorage.getItem('access_token');
    this.refreshToken = localStorage.getItem('refresh_token');
  }

  /**
   * Refresh access token
   */
  private async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await axios.post('http://localhost:8000/api/auth/refresh/', {
      refresh: this.refreshToken
    });

    this.accessToken = response.data.access;
    localStorage.setItem('access_token', this.accessToken!);
  }

  /**
   * Format axios error to ApiError
   */
  private formatError(error: AxiosError): ApiError {
    if (error.response) {
      return {
        message: (error.response.data as any)?.detail || error.message,
        errors: (error.response.data as any)?.errors,
        status: error.response.status
      };
    }
    return {
      message: error.message || 'Network error',
      status: 0
    };
  }

  // ============================================================
  // TASK ENDPOINTS
  // ============================================================

  /**
   * Fetch tasks with filters and pagination
   */
  async getTasks(
    filters?: TaskFilters,
    orderBy?: TaskOrderBy,
    page = 1,
    pageSize = 50
  ): Promise<PaginatedResponse<Task>> {
    const params: any = {
      page,
      page_size: pageSize
    };

    if (filters?.status) {
      params.status = Array.isArray(filters.status) ? filters.status.join(',') : filters.status;
    }
    if (filters?.priority) {
      params.priority = Array.isArray(filters.priority) ? filters.priority.join(',') : filters.priority;
    }
    if (filters?.assigned_to) {
      params.assigned_to = filters.assigned_to;
    }
    if (filters?.project) {
      params.project = filters.project;
    }
    if (filters?.search) {
      params.search = filters.search;
    }
    if (orderBy) {
      params.ordering = orderBy;
    }

    const response = await this.client.get<PaginatedResponse<Task>>('/api/tasks/', { params });
    return response.data;
  }

  /**
   * Get a single task
   */
  async getTask(id: string): Promise<Task> {
    const response = await this.client.get<Task>(`/api/tasks/${id}/`);
    return response.data;
  }

  /**
   * Create a new task
   */
  async createTask(data: CreateTaskInput): Promise<Task> {
    const response = await this.client.post<Task>('/api/tasks/', data);
    return response.data;
  }

  /**
   * Update a task
   */
  async updateTask(id: string, data: UpdateTaskInput): Promise<Task> {
    const response = await this.client.patch<Task>(`/api/tasks/${id}/`, data);
    return response.data;
  }

  /**
   * Delete a task
   */
  async deleteTask(id: string): Promise<void> {
    await this.client.delete(`/api/tasks/${id}/`);
  }

  /**
   * Get task history
   */
  async getTaskHistory(id: string): Promise<TaskHistory[]> {
    const response = await this.client.get<TaskHistory[]>(`/api/tasks/${id}/history/`);
    return response.data;
  }

  // ============================================================
  // COMMENT ENDPOINTS
  // ============================================================

  /**
   * Get comments for a task
   */
  async getComments(taskId: string): Promise<Comment[]> {
    const response = await this.client.get<PaginatedResponse<Comment>>('/api/comments/', {
      params: { task: taskId }
    });
    return response.data.results;
  }

  /**
   * Get a single comment
   */
  async getComment(id: string): Promise<Comment> {
    const response = await this.client.get<Comment>(`/api/comments/${id}/`);
    return response.data;
  }

  /**
   * Create a comment
   */
  async createComment(data: CreateCommentInput): Promise<Comment> {
    const response = await this.client.post<Comment>('/api/comments/', data);
    return response.data;
  }

  /**
   * Update a comment
   */
  async updateComment(id: string, data: UpdateCommentInput): Promise<Comment> {
    const response = await this.client.patch<Comment>(`/api/comments/${id}/`, data);
    return response.data;
  }

  /**
   * Delete a comment
   */
  async deleteComment(id: string): Promise<void> {
    await this.client.delete(`/api/comments/${id}/`);
  }

  // ============================================================
  // PROPER SYNC PUSH/PULL ENDPOINTS
  // ============================================================

  /**
   * Push changes to server using batch sync endpoint
   */
  async syncPush(data: {
    deviceId: string;
    vectorClock: Record<string, number>;
    timestamp: number;
    changes: {
      tasks?: Array<{
        id: string;
        operation: 'create' | 'update' | 'delete';
        data: any;
      }>;
      comments?: Array<{
        id: string;
        operation: 'create' | 'update' | 'delete';
        data: any;
      }>;
    };
  }): Promise<{
    success: boolean;
    processed: number;
    conflicts: Array<{
      entityType: string;
      entityId: string;
      conflictReason: string;
      serverVersion: any;
      serverVectorClock: Record<string, number>;
    }>;
    serverVectorClock: Record<string, number>;
    timestamp: number;
  }> {
    const response = await this.client.post('/api/sync/push/', data);
    return response.data;
  }

  /**
   * Pull changes from server using batch sync endpoint
   */
  async syncPull(params: {
    since: number;  // Unix timestamp in milliseconds
    limit?: number; // Max entities per type (default: 100)
  }): Promise<{
    tasks: Task[];
    comments: Comment[];
    tombstones: Array<{
      id: string;
      entity_type: string;
      entity_id: string;
      deleted_by: string;
      deleted_from_device: string | null;
      vector_clock: Record<string, number>;
      created_at: number;
      expires_at: number;
    }>;
    serverVectorClock: Record<string, number>;
    hasMore: boolean;
    timestamp: number;
  }> {
    const response = await this.client.get('/api/sync/pull/', { params });
    return response.data;
  }

  // ============================================================
  // LEGACY INDIVIDUAL ENDPOINTS (kept for backwards compatibility)
  // ============================================================

  /**
   * Sync multiple tasks in batch (DEPRECATED - use syncPush instead)
   */
  async batchSyncTasks(tasks: Task[]): Promise<Task[]> {
    const response = await this.client.post<Task[]>('/api/tasks/batch_sync/', { tasks });
    return response.data;
  }

  /**
   * Get tasks updated since timestamp (DEPRECATED - use syncPull instead)
   */
  async getTasksSince(timestamp: string): Promise<Task[]> {
    const response = await this.client.get<PaginatedResponse<Task>>('/api/tasks/', {
      params: { updated_since: timestamp }
    });
    return response.data.results;
  }

  // ============================================================
  // AUTHENTICATION ENDPOINTS
  // ============================================================

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<{
    user: any;
    device: any;
  }> {
    // Use device fingerprint for login (not the ID)
    const fingerprint = getDeviceFingerprint();
    const response = await this.client.post('/api/auth/login/', {
      email,
      password,
      deviceFingerprint: fingerprint,
      deviceName: navigator.userAgent.substring(0, 50)
    });

    const { access, refresh, user, device } = response.data;
    this.setTokens(access, refresh);
    
    // Save server device ID for future requests
    if (device && device.id) {
      setServerDeviceId(device.id);
    }

    // Save user info to localStorage for offline access
    if (user) {
      localStorage.setItem('user_id', user.id);
      localStorage.setItem('user_name', user.name);
      localStorage.setItem('user_email', user.email);
      if (user.avatar_url) {
        localStorage.setItem('user_avatar', user.avatar_url);
      }
    }

    return { user, device };
  }

  /**
   * Logout and clear tokens
   */
  logout() {
    this.clearTokens();
    clearDeviceIds();
    // Clear user info
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_avatar');
  }

  /**
   * Check if user is authenticated with a valid token
   */
  isAuthenticated(): boolean {
    if (!this.accessToken) return false;

    try {
      // Decode JWT token and check expiry
      const payload = this.accessToken.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      const currentTime = Math.floor(Date.now() / 1000);

      // Check if token is expired
      if (decoded.exp && decoded.exp < currentTime) {
        // Token expired, clear it
        this.clearTokens();
        return false;
      }

      return true;
    } catch {
      // Invalid token format, clear it
      this.clearTokens();
      return false;
    }
  }

  /**
   * Get current user info from token
   */
  getCurrentUser(): any {
    if (!this.accessToken) return null;

    try {
      // Decode JWT token (simple base64 decode)
      const payload = this.accessToken.split('.')[1];
      const decoded = JSON.parse(atob(payload));

      // Check if token is expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp < currentTime) {
        this.clearTokens();
        return null;
      }

      return decoded;
    } catch {
      this.clearTokens();
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/api/health/');
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
