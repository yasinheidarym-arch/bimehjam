import axios from 'axios';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Request interceptor to attach JWT token if available
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('bimeh_jam_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for consistent error handling
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error.response?.status;

    // Session expired or token is invalid.
    // Notify the React app so it can return the user to Login.
    if (status === 401 || status === 403) {
      localStorage.removeItem('bimeh_jam_token');
      localStorage.removeItem('bimeh_jam_user');

      window.dispatchEvent(new CustomEvent('bimeh-jam-auth-expired'));
    }

    const errorMessage =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'خطا در برقراری ارتباط با سرور';

    return Promise.reject(new Error(errorMessage));
  }
);

// Dashboard Services
export const dashboardService = {
  // 1. Dashboard Summary Cards
  getSummary: async () => {
    return apiClient.get('/dashboard/summary');
  },

  // 2. Conversation Chart
  getConversationsChart: async () => {
    return apiClient.get('/dashboard/conversations-chart');
  },

  // 3. User Sources Chart
  getSources: async () => {
    return apiClient.get('/dashboard/sources');
  },

  // 4. Hot Leads
  getHotLeads: async () => {
    return apiClient.get('/leads/hot');
  },

  // 5. Operators Status
  getOperatorsStatus: async () => {
    return apiClient.get('/operators/status');
  },

  // 6. Popular Pages
  getPopularPages: async () => {
    return apiClient.get('/dashboard/pages');
  },

  // 7. Bottom Activity Statistics
  getActivityStats: async () => {
    return apiClient.get('/dashboard/activity');
  },

  // Combined Dashboard Stats
  getStats: async () => {
    return apiClient.get('/dashboard/stats');
  },
};

// Customer Services
export const customerService = {
  getCustomers: async (params?: { page?: number; limit?: number; search?: string; city?: string; tag?: string }) => {
    return apiClient.get('/customers', { params });
  },
  getCustomerById: async (id: string) => {
    return apiClient.get(`/customers/${id}`);
  },
  createCustomer: async (data: any) => {
    return apiClient.post('/customers', data);
  },
  updateCustomer: async (id: string, data: any) => {
    return apiClient.put(`/customers/${id}`, data);
  },
  addNote: async (id: string, noteData: { content: string; author?: string }) => {
    return apiClient.post(`/customers/${id}/notes`, noteData);
  },
};

// Conversation Services
export const conversationService = {
  getConversations: async (params?: { page?: number; limit?: number; status?: string; search?: string; operatorId?: string }) => {
    return apiClient.get('/conversations', { params });
  },
  getConversationById: async (id: string) => {
    return apiClient.get(`/conversations/${id}`);
  },
  getConversationMessages: async (id: string) => {
    return apiClient.get(`/conversations/${id}/messages`);
  },
  sendMessage: async (id: string, messageData: { content: string; senderType?: string; senderId?: string; messageType?: string }) => {
    return apiClient.post(`/conversations/${id}/messages`, messageData);
  },
  updateStatus: async (id: string, status: string) => {
    return apiClient.patch(`/conversations/${id}/status`, { status });
  },
};

// Lead Services
export const leadService = {
  getLeads: async (params?: { page?: number; limit?: number; insuranceType?: string; status?: string; search?: string; minScore?: number }) => {
    return apiClient.get('/leads', { params });
  },
  getLeadById: async (id: string) => {
    return apiClient.get(`/leads/${id}`);
  },
  createLead: async (data: any) => {
    return apiClient.post('/leads', data);
  },
  updateLead: async (id: string, data: any) => {
    return apiClient.patch(`/leads/${id}`, data);
  },
};

// Task Services
export const taskService = {
  getTasks: async (params?: { status?: string; priority?: string; type?: string; source?: string; customerId?: string }) => {
    return apiClient.get('/tasks', { params });
  },
  createTask: async (data: any) => {
    return apiClient.post('/tasks', data);
  },
  updateTask: async (id: string, data: any) => {
    return apiClient.patch(`/tasks/${id}`, data);
  },
  getSmartSuggestions: async (params?: { customerId?: string; leadId?: string; conversationId?: string }) => {
    return apiClient.get('/tasks/smart-suggestions', { params });
  },
};

// Notification Services
export const notificationService = {
  getNotifications: async (params?: { read?: boolean; priority?: string; type?: string }) => {
    return apiClient.get('/notifications', { params });
  },
  markAsRead: async (id: string) => {
    return apiClient.patch(`/notifications/${id}/read`);
  },
  markAllAsRead: async () => {
    return apiClient.patch('/notifications/read-all');
  },
};

// Automation Rules Services
export const automationService = {
  getRules: async () => {
    return apiClient.get('/automation-rules');
  },
  createRule: async (data: any) => {
    return apiClient.post('/automation-rules', data);
  },
  updateRule: async (id: string, data: any) => {
    return apiClient.put(`/automation-rules/${id}`, data);
  },
  deleteRule: async (id: string) => {
    return apiClient.delete(`/automation-rules/${id}`);
  },
  triggerEvent: async (eventName: string, eventData?: any) => {
    return apiClient.post('/automation-rules/trigger', { eventName, eventData });
  },
  getExecutions: async () => {
    return apiClient.get('/automation-rules/executions');
  },
};


// AI Response Policy Services
export const aiPolicyService = {
  getPolicies: async () => {
    return apiClient.get('/settings/ai-response-policies');
  },

  updatePolicy: async (
    id: string,
    data: { enabled: boolean }
  ) => {
    return apiClient.put(
      `/settings/ai-response-policies/${id}`,
      data
    );
  },
};

export const taskSmsService = {
  getSettings: async () => apiClient.get('/settings/task-sms'),
  updateSettings: async (data: {
    enabled: boolean;
    selectedTaskTypes: string[];
    selectedRecipientUserIds: string[];
  }) => apiClient.put('/settings/task-sms', data),
};

export const taskTypeService = {
  getTypes: async (includeArchived = false) => apiClient.get('/task-types', { params: { includeArchived } }),
  createType: async (label: string, smsTemplate: string) => apiClient.post('/task-types', { label, smsTemplate }),
  updateType: async (id: string, data: { label: string; smsTemplate: string }) => apiClient.put(`/task-types/${encodeURIComponent(id)}`, data),
  restoreType: async (id: string) => apiClient.post(`/task-types/${encodeURIComponent(id)}/restore`),
  deleteType: async (id: string) => apiClient.delete(`/task-types/${encodeURIComponent(id)}`),
};


// Brain Layer Services
export const brainService = {
  getBrainLogs: async (params?: { conversationId?: string; intent?: string; validationResult?: string; limit?: number }) => {
    return apiClient.get('/ai/brain-logs', { params });
  },
  getBrainStats: async () => {
    return apiClient.get('/ai/brain-stats');
  },
};

// Knowledge & AI Training Center Services
export const knowledgeService = {
  // 1. Knowledge Articles
  getArticles: async (params?: { category?: string; status?: string; search?: string }) => {
    return apiClient.get('/knowledge/articles', { params });
  },
  createArticle: async (data: any) => {
    return apiClient.post('/knowledge/articles', data);
  },
  updateArticle: async (id: string, data: any) => {
    return apiClient.put(`/knowledge/articles/${id}`, data);
  },
  deleteArticle: async (id: string) => {
    return apiClient.delete(`/knowledge/articles/${id}`);
  },

  // 2. Insurance Products
  getProducts: async () => {
    return apiClient.get('/knowledge/products');
  },
  createProduct: async (data: any) => {
    return apiClient.post('/knowledge/products', data);
  },
  updateProduct: async (id: string, data: any) => {
    return apiClient.put(`/knowledge/products/${id}`, data);
  },
  deleteProduct: async (id: string) => {
    return apiClient.delete(`/knowledge/products/${id}`);
  },

  // 2. Insurance Categories & Sub-Categories
  getInsuranceCategories: async () => {
    return apiClient.get('/knowledge/categories');
  },
  createInsuranceCategory: async (data: any) => {
    return apiClient.post('/knowledge/categories', data);
  },
  updateInsuranceCategory: async (id: string, data: any) => {
    return apiClient.put(`/knowledge/categories/${id}`, data);
  },
  deleteInsuranceCategory: async (id: string) => {
    return apiClient.delete(`/knowledge/categories/${id}`);
  },
  createInsuranceSubCategory: async (data: any) => {
    return apiClient.post('/knowledge/sub-categories', data);
  },
  updateInsuranceSubCategory: async (id: string, data: any) => {
    return apiClient.put(`/knowledge/sub-categories/${id}`, data);
  },
  deleteInsuranceSubCategory: async (id: string) => {
    return apiClient.delete(`/knowledge/sub-categories/${id}`);
  },

  // 3. FAQ
  getFaqs: async (params?: { category?: string; search?: string }) => {
    return apiClient.get('/knowledge/faqs', { params });
  },
  createFaq: async (data: any) => {
    return apiClient.post('/knowledge/faqs', data);
  },
  updateFaq: async (id: string, data: any) => {
    return apiClient.put(`/knowledge/faqs/${id}`, data);
  },
  deleteFaq: async (id: string) => {
    return apiClient.delete(`/knowledge/faqs/${id}`);
  },

  // 5. AI Behavior Rules (Single Source of Truth)
  getAiBehavior: async () => {
    return apiClient.get('/knowledge/ai-behavior');
  },
  createAiBehavior: async (data: { title: string; directive: string; sortOrder?: number; status?: 'ACTIVE' | 'INACTIVE' }) => {
    return apiClient.post('/knowledge/ai-behavior', data);
  },
  updateAiBehavior: async (id: string, data: any) => {
    return apiClient.put(`/knowledge/ai-behavior/${id}`, data);
  },
  deleteAiBehavior: async (id: string) => {
    return apiClient.delete(`/knowledge/ai-behavior/${id}`);
  },
  reorderAiBehavior: async (orderedIds: string[]) => {
    return apiClient.put('/knowledge/ai-behavior/reorder', { orderedIds });
  },

  // 6. Live AI Test
  testAi: async (question: string, history?: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    return apiClient.post('/knowledge/test-ai', { question, history });
  },

  // 7. Quotation Questions inside Insurance Product
  getQuotationQuestions: async (productId?: string) => {
    return apiClient.get('/knowledge/questions', { params: { productId } });
  },
  createQuotationQuestion: async (data: any) => {
    return apiClient.post('/knowledge/questions', data);
  },
  updateQuotationQuestion: async (id: string, data: any) => {
    return apiClient.put(`/knowledge/questions/${id}`, data);
  },
  reorderQuotationQuestions: async (questions: { id: string; order: number }[]) => {
    return apiClient.put('/knowledge/questions-reorder', { questions });
  },
  deleteQuotationQuestion: async (id: string) => {
    return apiClient.delete(`/knowledge/questions/${id}`);
  },
};

// System & AI Mode Settings Services
export const settingService = {
  getAiMode: async () => {
    return apiClient.get('/ai/mode');
  },
  setAiMode: async (mode: 'OFF' | 'TEST_MODE' | 'ACTIVE') => {
    return apiClient.post('/ai/mode', { mode });
  },
  setAiSchedule: async (schedule: {
    enabled: boolean;
    days: string[];
    startTime: string;
    endTime: string;
    allowedMode: 'ACTIVE' | 'TEST_MODE';
    timezone: 'Asia/Tehran';
  }) => apiClient.put('/ai/schedule', schedule),
  getAiConfig: async () => {
    return apiClient.get('/settings/ai-config');
  },
  updateAiConfig: async (config: {
    aiMode?: string;
    aiProvider?: string;
    openaiApiKey?: string;
    openaiModel?: string;
    geminiApiKey?: string;
    geminiModel?: string;
    temperature?: number;
    maxTokens?: number;
    systemPromptOverride?: string;
  }) => {
    return apiClient.post('/settings/ai-config', config);
  },
  testAiConnection: async (params?: { provider?: string; apiKey?: string; model?: string }) => {
    return apiClient.post('/settings/ai-test', params || {});
  },
  getSettings: async () => {
    return apiClient.get('/settings');
  },
  updateSetting: async (key: string, value: any, description?: string) => {
    return apiClient.post('/settings', { key, value, description });
  },
};


export default dashboardService;
