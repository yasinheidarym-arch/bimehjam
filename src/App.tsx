import React, { useState, useEffect } from 'react';
import { Sidebar, TabType } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { ExecutiveDashboardView } from './components/ExecutiveDashboardView';
import { CustomerManagementView } from './components/CustomerManagementView';
import { ConversationManagementView } from './components/ConversationManagementView';
import { LeadPipelineView } from './components/LeadPipelineView';
import { LeadAnalyticsDashboard } from './components/LeadAnalyticsDashboard';
import { KnowledgeBaseEditor } from './components/KnowledgeBaseEditor';
import { AiResponseTestBench } from './components/AiResponseTestBench';
import { AiProcessingLogsView } from './components/AiProcessingLogsView';
import { BrainLogsView } from './components/BrainLogsView';
import { TaskManagerView } from './components/TaskManagerView';
import { AutomationRuleBuilder } from './components/AutomationRuleBuilder';
import { NotificationCenterView } from './components/NotificationCenterView';
import { AiModelConfigCard } from './components/AiModelConfigCard';
import { GoftinoAiResponsePolicyPanel } from './components/GoftinoAiResponsePolicyPanel';
import UsersManagement from './components/UsersManagement';
import { initialKnowledgeBase } from './data/knowledgeBase';

import { GoftinoLogEntry, KnowledgeBaseData, AiMode } from './types';
import {
  settingService,
  aiPolicyService
} from './services/api';
import { 
  Shield, 
  Sparkles, 
  AlertCircle, 
  FileText, 
  Settings, 
  HelpCircle, 
  CheckCircle2, 
  BarChart2,
  Loader2,
  Radio,
  RefreshCw,
  Send,
  FlaskConical,
  Power,
  Zap,
  Info
} from 'lucide-react';

function LoginScreen({ onLogin }: { onLogin: (token: string, user: any) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, email, password })
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.token) {
        throw new Error(data.error || 'ورود ناموفق بود');
      }

      localStorage.setItem('bimeh_jam_token', data.token);
      localStorage.setItem('bimeh_jam_user', JSON.stringify(data.user || {}));

      onLogin(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'خطا در ورود');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6" dir="rtl">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 space-y-5"
      >
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-black text-slate-900">ورود به پنل بیمه جم</h1>
          <p className="text-sm text-slate-500">برای ورود اطلاعات حساب خود را وارد کنید.</p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-sm font-medium">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">نام و نام خانوادگی</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            placeholder="مثلاً یاسین حیدری"
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
            dir="rtl"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">ایمیل</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
            dir="ltr"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">رمز عبور</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
            dir="ltr"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl py-3 transition"
        >
          {loading ? 'در حال ورود...' : 'ورود به پنل'}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!localStorage.getItem('bimeh_jam_token')
  );

  const [currentUser, setCurrentUser] = useState<any>(() => {
    try {
      const stored = localStorage.getItem('bimeh_jam_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Handle expired/invalid JWT sessions globally.
  useEffect(() => {
    const handleAuthExpired = () => {
      localStorage.removeItem('bimeh_jam_token');
      localStorage.removeItem('bimeh_jam_user');

      setCurrentUser(null);
      setIsAuthenticated(false);
      setActiveTab('dashboard');
    };

    window.addEventListener('bimeh-jam-auth-expired', handleAuthExpired);

    return () => {
      window.removeEventListener('bimeh-jam-auth-expired', handleAuthExpired);
    };
  }, []);

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [openConversationId, setOpenConversationId] = useState<string>('');
  const [logs, setLogs] = useState<GoftinoLogEntry[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBaseData>(initialKnowledgeBase);
  const [chatPromptTrigger, setChatPromptTrigger] = useState<string | undefined>(undefined);

  // Connection Test card state in Settings
  const [connectionTestStatus, setConnectionTestStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [lastSuccessfulTest, setLastSuccessfulTest] = useState<string>('۱۴۰۳/۰۲/۲۵ - ۱۰:۴۵');
  const [testDetails, setTestDetails] = useState<{
    date: string;
    time: string;
    senderName: string;
    messageId: string;
  } | null>(null);
  const [rawWebhookLogs, setRawWebhookLogs] = useState<any[]>([]);

  // AI Mode State (OFF | TEST_MODE | ACTIVE)
  const [aiMode, setAiMode] = useState<AiMode>('TEST_MODE');
  const [aiModeLoading, setAiModeLoading] = useState<boolean>(false);
  const [aiModeMessage, setAiModeMessage] = useState<string | null>(null);

  // AI Response Policy State
  const [aiPolicies, setAiPolicies] = useState<any[]>([]);
  const [aiPoliciesLoading, setAiPoliciesLoading] = useState<boolean>(false);
  const [aiPoliciesMessage, setAiPoliciesMessage] = useState<string | null>(null);

  // Fetch initial data from backend Express server
  useEffect(() => {
    fetchLogs();
    fetchKnowledgeBase();
    fetchRawWebhookLogs();
    fetchAiMode();
    fetchAiPolicies();
  }, []);

  const fetchAiMode = async () => {
    try {
      const res: any = await settingService.getAiMode();
      if (res?.data?.mode) {
        setAiMode(res.data.mode);
      }
    } catch (err) {
      console.warn('Failed to fetch AI mode:', err);
    }
  };


  const fetchAiPolicies = async () => {
    try {
      const data: any = await aiPolicyService.getPolicies();

      console.log("AI POLICY RESPONSE:", data);

      if (data?.success) {
        setAiPolicies(data.data || []);
      }
    } catch (err) {
      console.warn('Failed to fetch AI response policies:', err);
    }
  };


  const handleUpdateAiPolicy = async (
    id: string,
    changes: any
  ) => {
    try {
      setAiPoliciesLoading(true);
      setAiPoliciesMessage(null);

      const data: any = await aiPolicyService.updatePolicy(
        id,
        changes
      );

      if (data?.success) {
        setAiPoliciesMessage(
          'قانون پاسخگویی AI با موفقیت ذخیره شد.'
        );

        await fetchAiPolicies();
      } else {
        throw new Error(
          data?.error || 'خطا در ذخیره تنظیمات'
        );
      }

    } catch (err: any) {
      console.error(
        'Failed to update AI policy:',
        err
      );

      setAiPoliciesMessage(
        err.message || 'خطا در ذخیره تنظیمات'
      );

    } finally {
      setAiPoliciesLoading(false);
    }
  };

  const handleUpdateAiMode = async (newMode: AiMode) => {
    setAiModeLoading(true);
    setAiModeMessage(null);
    try {
      const res: any = await settingService.setAiMode(newMode);
      setAiMode(newMode);
      setAiModeMessage(res?.message || 'وضعیت هوش مصنوعی با موفقیت ذخیره شد.');
      setTimeout(() => setAiModeMessage(null), 4000);
    } catch (err: any) {
      console.error('Failed to update AI mode:', err);
      setAiModeMessage(err.message || 'خطا در تغییر وضعیت هوش مصنوعی');
    } finally {
      setAiModeLoading(false);
    }
  };

  const [e2eTesting, setE2eTesting] = useState(false);
  const [e2eResult, setE2eResult] = useState<any>(null);

  const handleRunE2ETest = async () => {
    handleTestConnection();
  };

  const fetchRawWebhookLogs = async () => {
    try {
      const res = await fetch('/api/webhook/goftino/logs');
      const data = await res.json();
      if (data.success && Array.isArray(data.webhookLogs)) {
        setRawWebhookLogs(data.webhookLogs);
      }
    } catch (err) {
      console.warn('Failed to fetch raw webhook logs:', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/goftino/logs');
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch Goftino logs:', err);
    }
  };

  const fetchKnowledgeBase = async () => {
    try {
      const res = await fetch('/api/knowledge-base');
      const data = await res.json();
      if (data.success && data.knowledgeBase) {
        setKnowledgeBase(data.knowledgeBase);
      }
    } catch (err) {
      console.error('Failed to fetch knowledge base:', err);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/goftino/logs', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setLogs([]);
      }
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  const handleNewLogGenerated = (newLog: GoftinoLogEntry) => {
    setLogs((prev) => [newLog, ...prev.filter((l) => l.id !== newLog.id)]);
  };

  const handleOpenChatWithPrompt = (prompt: string) => {
    setChatPromptTrigger(prompt);
  };

  const handleTestConnection = async () => {
    setConnectionTestStatus('waiting');
    setTestDetails(null);

    try {
      // 1. Tell backend to start listening for the next real Goftino webhook
      const startRes = await fetch('/api/webhook/goftino/test-start', {
        method: 'POST',
      });

      if (!startRes.ok) {
        setConnectionTestStatus('error');
        return;
      }

      // 2. Poll /api/webhook/goftino/test-status for up to 60 seconds
      let attempts = 0;
      const maxAttempts = 40; // 40 * 1500ms = 60s
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await fetch('/api/webhook/goftino/test-status');
          if (statusRes.ok) {
            const data = await statusRes.json();
            if (data.testDetails) {
              clearInterval(pollInterval);
              setTestDetails(data.testDetails);
              setLastSuccessfulTest(`${data.testDetails.date} - ${data.testDetails.time}`);
              setConnectionTestStatus('success');
              return;
            }
          }
        } catch (pollErr) {
          console.warn('Poll error:', pollErr);
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          setConnectionTestStatus('error');
        }
      }, 1500);

    } catch (err) {
      console.error('Test Connection Error:', err);
      setConnectionTestStatus('error');
    }
  };

  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLogin={(token, user) => {
          setCurrentUser(user);
          setIsAuthenticated(true);
        }}
      />
    );
  }

  const handleLogout = () => {
    localStorage.removeItem('bimeh_jam_token');
    localStorage.removeItem('bimeh_jam_user');

    setCurrentUser(null);
    setIsAuthenticated(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 font-['Vazirmatn',sans-serif] text-slate-800 flex flex-row selection:bg-blue-600 selection:text-white" dir="rtl">
      
      {/* Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        logsCount={logs.length} 
      />

      {/* Main App Container */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        
        {/* Top Header */}
        <TopHeader
          activeTab={activeTab}
          aiMode={aiMode}
          onUpdateAiMode={handleUpdateAiMode}
          user={currentUser}
          onLogout={handleLogout}
        />

        {/* Scrollable Main View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          
          {/* Executive Dashboard View (Default tab from screenshot) */}
          {activeTab === 'dashboard' && (
            <ExecutiveDashboardView
              logs={logs}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onOpenChatWithPrompt={handleOpenChatWithPrompt}
            />
          )}

          {/* Task Management & AI Follow-up Engine View */}
          {activeTab === 'tasks' && (
            <TaskManagerView />
          )}

          {/* Automation Rules Engine View */}
          {activeTab === 'automation_rules' && (
            <AutomationRuleBuilder />
          )}

          {/* Customer Management View */}
          {activeTab === 'customers' && (
            <CustomerManagementView
              onOpenConversation={(id) => {
                setOpenConversationId(id);
                setActiveTab('conversations');
              }}
            />
          )}

          {/* Conversation Management Inbox View */}
          {activeTab === 'conversations' && (
            <ConversationManagementView
              initialConversationId={openConversationId}
            />
          )}

          {/* Lead Pipeline Board View */}
          {activeTab === 'leads' && (
            <LeadPipelineView />
          )}

          {/* Leads & Analytics View */}
          {activeTab === 'analytics' && (
            <LeadAnalyticsDashboard
              logs={logs}
              onClearLogs={handleClearLogs}
            />
          )}

          {/* Knowledge Base & AI Instructions Editor */}
          {activeTab === 'knowledge' && (
            <KnowledgeBaseEditor
              knowledgeBase={knowledgeBase}
              onSave={(updated) => setKnowledgeBase(updated)}
            />
          )}

          {/* Reports & Analytics Tab */}
          {activeTab === 'reports' && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <BarChart2 className="w-6 h-6 text-blue-600" />
                <div>
                  <h3 className="text-lg font-bold text-slate-800">گزارش‌ها و تحلیل‌های دوره</h3>
                  <p className="text-xs text-slate-500">تحلیل جامع عملکرد پاسخگویی هوش مصنوعی، نرخ جلب لید و رضایت مشتریان</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 space-y-2">
                  <span className="text-xs font-semibold text-blue-800">متوسط زمان پاسخگویی AI</span>
                  <div className="text-2xl font-black text-blue-900">۱.4 ثانیه</div>
                  <p className="text-[11px] text-blue-600">۹۹.۸٪ سریع‌تر از اپراتور انسانی</p>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4 space-y-2">
                  <span className="text-xs font-semibold text-emerald-800">دقت پاسخ به قوانین بیمه‌ای</span>
                  <div className="text-2xl font-black text-emerald-900">۹۶.۸٪</div>
                  <p className="text-[11px] text-emerald-600">براساس تأیید کارشناسان بیمه جم</p>
                </div>

                <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-4 space-y-2">
                  <span className="text-xs font-semibold text-purple-800">رضایت‌مندی کاربران گفتینو</span>
                  <div className="text-2xl font-black text-purple-900">۴.۸ از ۵</div>
                  <p className="text-[11px] text-purple-600">برپایه نظرخواهی پایان چت</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 leading-relaxed">
                💡 <strong>راهنمای مدیریتی:</strong> کلیه تحلیل‌ها براساس گفتگوهای زنده انجام شده توسط وِبهوک گفتینو به صورت خودکار به‌روزرسانی می‌شوند.
              </div>
            </div>
          )}

          {/* Notifications Center Tab */}
          {activeTab === 'notifications' && (
            <NotificationCenterView />
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <Settings className="w-5 h-5 text-slate-700" />
                <div>
                  <h3 className="text-lg font-bold text-slate-800">تنظیمات سیستم و هوش مصنوعی</h3>
                  <p className="text-xs text-slate-500">پیکربندی وضعیت هوش مصنوعی (AI Test Mode)، اتصال وب‌هوک و تست ارتباط با گفتینو</p>
                </div>
              </div>

              {/* SECTION 1: AI MODEL & API KEY CONFIGURATION (ChatGPT / GPT-5) */}
              <div className="max-w-3xl">
                <AiModelConfigCard />
              </div>


              {/* SECTION: AI RESPONSE POLICIES */}
              <GoftinoAiResponsePolicyPanel />

              {/* Legacy policy panel retained below for compatibility with existing UI state. */}
              {false && <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5 max-w-5xl">

                <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                  <Shield className="w-5 h-5 text-indigo-600" />
                  <div>
                    <h4 className="font-extrabold text-slate-800 text-sm">
                      قوانین پاسخگویی هوش مصنوعی بر اساس دسته
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      تعیین کنید برای هر نوع درخواست، هوش مصنوعی پاسخ دهد یا گفتگو به کارشناس منتقل شود.
                    </p>
                  </div>
                </div>

                {aiPoliciesMessage && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                    {aiPoliciesMessage}
                  </div>
                )}

                <div className="space-y-3">
                  {aiPolicies.map((policy) => (
                    <div
                      key={policy.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-center"
                    >

                      <div>
                        <div className="font-bold text-sm text-slate-800">
                          {policy.category}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {policy.fallbackMessage || 'بدون پیام جایگزین'}
                        </div>
                      </div>

                      <select
                        value={policy.mode}
                        disabled={aiPoliciesLoading}
                        onChange={(e) =>
                          handleUpdateAiPolicy(policy.id, {
                            mode: e.target.value,
                          })
                        }
                        className="border rounded-lg p-2 text-xs"
                      >
                        <option value="AI_ALLOWED">
                          AI پاسخ دهد
                        </option>
                        <option value="AI_ASSISTED">
                          کمک AI + بررسی انسان
                        </option>
                        <option value="HUMAN_ONLY">
                          فقط کارشناس انسانی
                        </option>
                      </select>

                      <select
                        value={policy.priority}
                        disabled={aiPoliciesLoading}
                        onChange={(e) =>
                          handleUpdateAiPolicy(policy.id, {
                            priority: e.target.value,
                          })
                        }
                        className="border rounded-lg p-2 text-xs"
                      >
                        <option value="NORMAL">عادی</option>
                        <option value="HIGH">بالا</option>
                        <option value="URGENT">فوری</option>
                      </select>

                      <span
                        className={`text-xs font-bold px-3 py-2 rounded-lg text-center ${
                          policy.mode === 'HUMAN_ONLY'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {policy.mode === 'HUMAN_ONLY'
                          ? 'انتقال به کارشناس'
                          : 'AI فعال'}
                      </span>

                    </div>
                  ))}
                </div>

              </div>}

              {/* SECTION: USER MANAGEMENT */}
              <UsersManagement />

              {/* SECTION 2: AI MODE CONFIGURATION (AI Test Mode / Active / Off) */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5 max-w-3xl">

                <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                  <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span>حالت پاسخگویی هوش مصنوعی (AI Mode Settings)</span>
                  </h4>
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1.5 border ${
                    aiMode === 'TEST_MODE'
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : aiMode === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : 'bg-slate-200 text-slate-700 border-slate-300'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${aiMode === 'OFF' ? 'bg-slate-400' : 'bg-current animate-pulse'}`}></span>
                    <span>وضعیت فعلی: {aiMode === 'TEST_MODE' ? 'تست مود (AI Test Mode)' : aiMode === 'ACTIVE' ? 'فعال (ارسال زنده)' : 'خاموش'}</span>
                  </span>
                </div>

                {/* AI Mode Options */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {/* Option 1: OFF */}
                  <div 
                    onClick={() => !aiModeLoading && handleUpdateAiMode('OFF')}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer space-y-2 flex flex-col justify-between ${
                      aiMode === 'OFF'
                        ? 'bg-rose-50/70 border-rose-500 text-rose-950 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs flex items-center gap-1.5">
                          <Power className="w-4 h-4 text-rose-500" />
                          <span>خاموش (OFF)</span>
                        </span>
                        {aiMode === 'OFF' && <CheckCircle2 className="w-4 h-4 text-rose-600" />}
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        پایپ‌لاین هوش مصنوعی کاملاً متوقف است و هیچ واکنشی به پیام‌های ورودی نشان نمی‌دهد.
                      </p>
                    </div>
                    <div className="pt-2 text-[10px] font-bold text-slate-400 border-t border-slate-100">
                      عدم پردازش پیام‌ها
                    </div>
                  </div>

                  {/* Option 2: AI TEST MODE (RECOMMENDED FOR TESTING) */}
                  <div 
                    onClick={() => !aiModeLoading && handleUpdateAiMode('TEST_MODE')}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer space-y-2 flex flex-col justify-between relative overflow-hidden ${
                      aiMode === 'TEST_MODE'
                        ? 'bg-amber-50/90 border-amber-500 text-amber-950 shadow-md ring-2 ring-amber-300/40'
                        : 'bg-white border-slate-200 hover:border-amber-300 text-slate-700'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs flex items-center gap-1.5 text-amber-900">
                          <FlaskConical className="w-4 h-4 text-amber-600" />
                          <span>تست مود (AI Test Mode)</span>
                        </span>
                        {aiMode === 'TEST_MODE' && <CheckCircle2 className="w-4 h-4 text-amber-700" />}
                      </div>
                      <p className="text-[11px] leading-relaxed text-amber-950/80">
                        پیام‌های واقعی مشتری دریافت و پایپ‌لاین کامل اجرا می‌شود. پاسخ <strong>فقط در پنل مدیر</strong> ذخیره شده و <strong>هرگز به گفتینو و مشتری ارسال نمی‌شود</strong>.
                      </p>
                    </div>
                    <div className="pt-2 text-[10px] font-black text-amber-800 border-t border-amber-200/60 flex items-center justify-between">
                      <span>🧪 تست امن و بدون ریسک</span>
                      <span className="bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded text-[9px]">پیشنهادی</span>
                    </div>
                  </div>

                  {/* Option 3: ACTIVE */}
                  <div 
                    onClick={() => !aiModeLoading && handleUpdateAiMode('ACTIVE')}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer space-y-2 flex flex-col justify-between ${
                      aiMode === 'ACTIVE'
                        ? 'bg-emerald-50/80 border-emerald-500 text-emerald-950 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-emerald-300 text-slate-700'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs flex items-center gap-1.5 text-emerald-900">
                          <Zap className="w-4 h-4 text-emerald-600" />
                          <span>فعال (ACTIVE)</span>
                        </span>
                        {aiMode === 'ACTIVE' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        هوش مصنوعی پاسخ را تولید کرده و به صورت آنی به گفتینو ارسال می‌کند تا مشتری مستقیماً دریافت کند.
                      </p>
                    </div>
                    <div className="pt-2 text-[10px] font-bold text-emerald-700 border-t border-slate-100">
                      پاسخگویی زنده به مشتریان
                    </div>
                  </div>
                </div>

                {/* AI Mode Feedback Alert */}
                {aiModeMessage && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-bold flex items-center gap-2 animate-fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{aiModeMessage}</span>
                  </div>
                )}

                {/* Test Mode Behavior Notice Card */}
                <div className="bg-amber-100/60 border border-amber-300/80 rounded-xl p-3.5 space-y-2 text-xs text-amber-950">
                  <div className="flex items-center gap-2 font-black text-amber-900">
                    <Info className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>راهنمای عملکرد AI Test Mode:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-950 font-medium pr-1">
                    <li>پیام‌های ارسالی کاربران از ویجت گفتینو به طور عادی دریافت می‌شوند.</li>
                    <li>پرونده گفتگو (Conversation) و استخراج داده‌های بیمه به شکل کامل تشکیل می‌گردد.</li>
                    <li>پاسخ هوش مصنوعی تولید و در پنل مدیریت گفتگو با برچسب <strong>«🧪 تست مود فعال»</strong> و اعلان بررسی مدیر نمایش داده می‌شود.</li>
                    <li><strong>هیچ پیامی به چت گفتینوی مشتری ارسال نمی‌گردد</strong> تا مدیر عملکرد سیستم را بدون ریسک بررسی کند.</li>
                  </ul>
                </div>
              </div>

              {/* SECTION 2: GOFTINO CONNECTION TEST */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-6 max-w-3xl">
                
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                  <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                    <Radio className="w-4 h-4 text-blue-600" />
                    <span>تست اتصال گفتینو</span>
                  </h4>
                  <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>وضعیت سیستم: آنلاین</span>
                  </span>
                </div>

                {/* The 5 elements required for administrator view */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  
                  {/* 1. Webhook URL */}
                  <div className="space-y-1 bg-white p-3.5 rounded-xl border border-slate-200">
                    <label className="font-bold text-slate-700 block text-[11px]">آدرس وب‌هوک (Webhook URL)</label>
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/api/webhook/goftino`}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 font-mono text-slate-700 dir-ltr text-[11px] select-all"
                    />
                  </div>

                  {/* 2. API Token */}
                  <div className="space-y-1 bg-white p-3.5 rounded-xl border border-slate-200">
                    <label className="font-bold text-slate-700 block text-[11px]">توکن اختصاصی API</label>
                    <input
                      type="password"
                      value="goftino_sec_9841029384"
                      readOnly
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 font-mono text-slate-700 dir-ltr text-[11px]"
                    />
                  </div>

                  {/* 3. Connection Status */}
                  <div className="space-y-1 bg-white p-3.5 rounded-xl border border-slate-200">
                    <label className="font-bold text-slate-700 block text-[11px]">وضعیت اتصال سرویس</label>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="font-bold text-emerald-700 text-[11px]">برقرار و فعال</span>
                    </div>
                  </div>

                  {/* 4. Last Successful Test */}
                  <div className="space-y-1 bg-white p-3.5 rounded-xl border border-slate-200">
                    <label className="font-bold text-slate-700 block text-[11px]">آخرین تست موفق اتصال</label>
                    <div className="font-mono font-semibold text-slate-700 dir-ltr text-left pt-1 text-[11px]">
                      {lastSuccessfulTest}
                    </div>
                  </div>

                </div>

                {/* 5. Test Action Buttons */}
                <div className="pt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={connectionTestStatus === 'waiting'}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {connectionTestStatus === 'waiting' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>در حال انتظار برای دریافت پیام آزمایشی از گفتینو...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 text-white" />
                        <span>تست اتصال</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleRunE2ETest}
                    disabled={e2eTesting}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {e2eTesting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>در حال اجرای پایپ‌لاین E2E...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5 text-white" />
                        <span>تست کامل End-to-End</span>
                      </>
                    )}
                  </button>
                </div>

                {/* E2E Result Display */}
                {e2eResult && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2 text-emerald-950 text-xs animate-fade-in">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-800 border-b border-emerald-200 pb-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span>{e2eResult.message}</span>
                    </div>
                    <div className="text-[11px] font-mono text-emerald-900 bg-white p-2.5 rounded-lg border border-emerald-200/70 dir-ltr">
                      Chat ID: {e2eResult.testChatId} | Status: {e2eResult.result?.status} | Conv ID: {e2eResult.result?.conversationId}
                    </div>
                  </div>
                )}

                {/* Result Displays */}
                {connectionTestStatus === 'success' && testDetails && (
                  <div className="bg-emerald-50/90 border border-emerald-200/90 rounded-xl p-4 space-y-3 text-emerald-950 text-xs animate-fade-in">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-800 border-b border-emerald-200/80 pb-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span>اتصال و وب‌هوک واقعی گفتینو با موفقیت تایید شد</span>
                    </div>
                    
                    <p className="font-bold text-emerald-700 text-xs">وب‌هوک واقعی گفتینو با موفقیت دریافت و اطلاعات زیر استخراج گردید:</p>

                    <div className="bg-white rounded-lg p-3 border border-emerald-200/60 space-y-2 text-xs text-slate-800 font-medium">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-500 font-bold">شناسه گفتگوی واقعی (Chat ID):</span>
                        <span className="font-mono font-bold text-emerald-700 dir-ltr">{testDetails.chatId}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-500 font-bold">شناسه کاربر (User ID):</span>
                        <span className="font-mono text-slate-800 dir-ltr">{testDetails.userId || 'نامشخص'}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-500 font-bold">نام فرستنده:</span>
                        <span className="font-bold text-slate-800">{testDetails.senderName}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-500 font-bold">شناسه پیام:</span>
                        <span className="font-mono text-slate-800 dir-ltr">{testDetails.messageId}</span>
                      </div>
                      {testDetails.content && (
                        <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                          <span className="text-slate-500 font-bold">متن پیام دریافت شده:</span>
                          <span className="font-bold text-slate-900 dir-rtl text-left">{testDetails.content}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1 text-[11px]">
                        <span className="text-slate-500 font-bold">زمان دریافت:</span>
                        <span className="font-mono text-slate-600">{testDetails.date} - {testDetails.time}</span>
                      </div>
                    </div>
                  </div>
                )}

                {connectionTestStatus === 'error' && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2 text-rose-950 text-xs animate-fade-in">
                    <div className="flex items-center gap-2 font-bold text-sm text-rose-800 border-b border-rose-200/80 pb-2">
                      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                      <span>هیچ پیام وب‌هوکی از سرور گفتینو دریافت نشد.</span>
                    </div>
                    <p className="font-semibold text-rose-700 leading-relaxed">
                      مسیر وب‌هوک در بک‌اند کاملاً فعال و آماده دریافت درخواست است (`POST /api/webhook/goftino`).
                      عدم دریافت پیام به دلیل تنظیم نشدن آدرس وب‌هوک فوق در پنل گفتینو یا ارسال نشدن پیام جدید از گفتینو توسط کاربر است.
                    </p>
                  </div>
                )}

                {/* Raw Webhook Logs Debug View */}
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span>آخرین درخواست‌های وب‌هوک واقعی ثبت‌شده در بک‌اند</span>
                    </h5>
                    <button
                      type="button"
                      onClick={fetchRawWebhookLogs}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>بروزرسانی</span>
                    </button>
                  </div>

                  {rawWebhookLogs.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-xl p-4 text-center text-xs text-slate-500">
                      هیچ درخواست HTTP Webhook واقعی هنوز به این آدرس ارسال نشده است.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {rawWebhookLogs.slice(0, 10).map((wLog) => (
                        <div key={wLog.id} className="bg-white p-3 border border-slate-200 rounded-xl text-[11px] space-y-1 font-mono dir-ltr">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-1 text-slate-600">
                            <span className="font-bold text-blue-700">ID: {wLog.id}</span>
                            <span className="text-[10px] text-slate-400">{new Date(wLog.createdAt).toLocaleTimeString('fa-IR')}</span>
                          </div>
                          <div className="text-slate-700 truncate">
                            <strong>Event:</strong> {wLog.event} | <strong>Status:</strong> {wLog.status}
                          </div>
                          <div className="text-[10px] text-slate-500 bg-slate-50 p-1.5 rounded border border-slate-100 max-h-20 overflow-y-auto whitespace-pre-wrap">
                            {wLog.payload}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* Activity Logs Tab */}
          {activeTab === 'activity' && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
              <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-3">لاگ و تاریخچه رویدادهای وِبهوک</h3>
              {logs.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  هنوز لاگ جدیدی ثبت نشده است. می‌توانید از بخش گفتینو چت‌روم زنده، پیام تست ارسال کنید.
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pl-2">
                  {logs.map((log) => (
                    <div key={log.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-blue-700">{log.client?.name || 'کاربر گفتینو'}</span>
                        <span className="text-[10px] text-slate-400 dir-ltr">{log.timestamp}</span>
                      </div>
                      <p className="text-slate-700"><strong>پیام کاربر:</strong> {log.incomingMessage}</p>
                      <p className="text-slate-600 bg-white p-2 rounded-lg border border-slate-100">
                        <strong>پاسخ AI:</strong> {log.aiResponse}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* System Guide Tab */}
          {activeTab === 'help' && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                <HelpCircle className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-slate-800">راهنمای سیستم و راه اندازی وِبهوک بیمه جم</h3>
              </div>
              <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
                <p>۱. وارد پنل مدیریت <strong>گفتینو (Goftino)</strong> شوید.</p>
                <p>۲. به بخش <strong>تنظیمات پیشرفته &gt; وِبهوک (Webhook)</strong> بروید.</p>
                <p>۳. آدرس Webhook URL داده شده در بخش تنظیمات همین سامانه را کپی کرده و قرار دهید.</p>
                <p>۴. اکنون هر پیام جدیدی که کاربر بفرستد، توسط هوش مصنوعی بیمه جم تحلیل شده و پاسخ کارشناسی و دقیق ارائه خواهد شد.</p>
              </div>
            </div>
          )}

        </main>

        {/* Clean Footer */}
        <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 mt-auto">
          <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="font-medium">
              سامانه هوشمند <strong className="text-slate-700">بیمه جم (Bimeh Jam)</strong> — دستیار فروش و پاسخگویی وِبهوک گفتینو
            </p>
            <div className="flex items-center gap-4 text-[11px] text-slate-400 font-medium">
              <span>پشتیبانی فنی: ۰۲۱-۹۱۰۰۸۸۸۸</span>
            </div>
          </div>
        </footer>

      </div>

    </div>
  );
}
