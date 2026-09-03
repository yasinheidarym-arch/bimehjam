import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  Filter,
  Search,
  Sparkles,
  PhoneCall,
  Send,
  FileText,
  UserCheck,
  Calendar,
  ChevronRight,
  RefreshCw,
  Zap,
  Check,
  XCircle,
  Tag,
  MessageSquare,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { taskService, customerService, taskSmsService, taskTypeService } from '../services/api';

interface TaskItem {
  id: string;
  customerId?: string;
  customer?: { id: string; name: string; phone?: string; avatar?: string };
  leadId?: string;
  conversationId?: string;
  assignedUser: string;
  title: string;
  description?: string;
  type: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'New' | 'In Progress' | 'Completed' | 'Cancelled' | 'Expired';
  source: 'AI' | 'Operator' | 'Automation Rule' | 'Admin';
  dueDate?: string;
  createdAt: string;
  completedAt?: string;
}

interface SmartSuggestion {
  action: string;
  title: string;
  reason: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

interface SmsUser {
  id: string;
  name: string;
  role: string;
  mobile?: string | null;
}

interface TaskSmsSettings {
  enabled: boolean;
  selectedTaskTypes: string[];
  selectedRecipientUserIds: string[];
  taskTypes: TaskTypeDefinition[];
  users: SmsUser[];
}

interface TaskTypeDefinition { id: string; label: string; active: boolean; builtin: boolean; smsTemplate: string }

const DEFAULT_TASK_SMS_TEMPLATE = 'بیمه جم: وظیفه «{{taskType}}» برای {{customerFullName}} ثبت شد. عنوان: {{taskTitle}} | اولویت: {{priority}} | شناسه: {{taskId}} | {{taskLink}}';
const TASK_SMS_VARIABLES = ['{{taskType}}', '{{taskTitle}}', '{{priority}}', '{{customerFullName}}', '{{taskId}}', '{{taskLink}}'];

export const TaskManagerView: React.FC = () => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // AI Follow-up suggestions
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState<boolean>(false);

  // New task modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isTaskTypeModalOpen, setIsTaskTypeModalOpen] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskType, setNewTaskType] = useState('Call Customer');
  const [newTaskPriority, setNewTaskPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('HIGH');
  const [newTaskUserId, setNewTaskUserId] = useState('');
  const [newTaskCustomerId, setNewTaskCustomerId] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [smsSettings, setSmsSettings] = useState<TaskSmsSettings | null>(null);
  const [savingSms, setSavingSms] = useState(false);
  const [smsMessage, setSmsMessage] = useState('');
  const [taskTypes, setTaskTypes] = useState<TaskTypeDefinition[]>([]);
  const [newTaskTypeLabel, setNewTaskTypeLabel] = useState('');
  const [taskTypeTemplate, setTaskTypeTemplate] = useState(DEFAULT_TASK_SMS_TEMPLATE);
  const [editingTaskTypeId, setEditingTaskTypeId] = useState<string | null>(null);
  const [taskTypeMessage, setTaskTypeMessage] = useState('');
  const currentRole = (() => {
    try { return JSON.parse(localStorage.getItem('bimeh_jam_user') || '{}')?.role; } catch { return null; }
  })();

  useEffect(() => {
    fetchTasks();
    fetchSmartSuggestions();
    fetchCustomersList();
  }, [statusFilter, priorityFilter, typeFilter, sourceFilter]);

  const loadSmsSettings = async () => {
    try {
      const res: any = await taskSmsService.getSettings();
      if (res.success) setSmsSettings(res.data);
    } catch { /* The task UI remains usable if SMS settings are unavailable. */ }
  };

  useEffect(() => { loadSmsSettings(); }, []);

  const loadTaskTypes = async () => {
    try {
      const res: any = await taskTypeService.getTypes(currentRole === 'ADMIN');
      if (res.success) {
        setTaskTypes(res.data);
        const firstActive = res.data.find((item: TaskTypeDefinition) => item.active);
        if (firstActive && !res.data.some((item: TaskTypeDefinition) => item.id === newTaskType && item.active)) setNewTaskType(firstActive.id);
      }
    } catch { setTaskTypeMessage('دریافت انواع وظیفه ناموفق بود.'); }
  };

  useEffect(() => { loadTaskTypes(); }, []);

  const addTaskType = async () => {
    if (!newTaskTypeLabel.trim()) return;
    try {
      if (editingTaskTypeId) {
        await taskTypeService.updateType(editingTaskTypeId, { label: newTaskTypeLabel, smsTemplate: taskTypeTemplate });
      } else {
        await taskTypeService.createType(newTaskTypeLabel, taskTypeTemplate);
      }
      setNewTaskTypeLabel('');
      setTaskTypeTemplate(DEFAULT_TASK_SMS_TEMPLATE);
      setEditingTaskTypeId(null);
      setTaskTypeMessage(editingTaskTypeId ? 'نوع وظیفه و قالب پیامک ویرایش شد.' : 'نوع وظیفه اضافه شد.');
      await Promise.all([loadTaskTypes(), loadSmsSettings()]);
      window.dispatchEvent(new CustomEvent('bimehjam-task-types-updated'));
    } catch (error) { setTaskTypeMessage(error instanceof Error ? error.message : 'ثبت ناموفق بود.'); }
  };

  const startEditingTaskType = (item: TaskTypeDefinition) => {
    setEditingTaskTypeId(item.id);
    setNewTaskTypeLabel(item.label);
    setTaskTypeTemplate(item.smsTemplate || DEFAULT_TASK_SMS_TEMPLATE);
    setTaskTypeMessage('');
  };

  const cancelEditingTaskType = () => {
    setEditingTaskTypeId(null);
    setNewTaskTypeLabel('');
    setTaskTypeTemplate(DEFAULT_TASK_SMS_TEMPLATE);
  };

  const taskSmsPreview = taskTypeTemplate.replace(/{{\s*(taskType|taskTitle|priority|customerFullName|taskId|taskLink)\s*}}/g, (_match, key) => ({
    taskType: newTaskTypeLabel || 'تماس برای قیمت‌دهی',
    taskTitle: 'پیگیری درخواست قیمت مشتری',
    priority: 'HIGH',
    customerFullName: 'علی رضایی',
    taskId: 'TASK-123',
    taskLink: 'https://bimehjam.com/admin/tasks?taskId=TASK-123',
  }[key] || ''));

  const deleteTaskType = async (id: string) => {
    try {
      const res: any = await taskTypeService.deleteType(id);
      setTaskTypeMessage(res.data?.mode === 'archived' ? 'نوع استفاده‌شده آرشیو شد.' : 'نوع بدون استفاده حذف شد.');
      await Promise.all([loadTaskTypes(), loadSmsSettings()]);
      window.dispatchEvent(new CustomEvent('bimehjam-task-types-updated'));
    } catch (error) { setTaskTypeMessage(error instanceof Error ? error.message : 'حذف ناموفق بود.'); }
  };

  const saveSmsSettings = async (next: TaskSmsSettings) => {
    setSmsSettings(next);
    setSavingSms(true);
    setSmsMessage('');
    try {
      const res: any = await taskSmsService.updateSettings({
        enabled: next.enabled,
        selectedTaskTypes: next.selectedTaskTypes,
        selectedRecipientUserIds: next.selectedRecipientUserIds,
      });
      if (res.success) setSmsMessage('تنظیمات ذخیره شد.');
    } catch (error) {
      setSmsMessage(error instanceof Error ? error.message : 'ذخیره تنظیمات ناموفق بود.');
    } finally {
      setSavingSms(false);
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await taskService.getTasks({
        status: statusFilter,
        priority: priorityFilter,
        type: typeFilter,
        source: sourceFilter,
      });
      if (res.success) {
        setTasks(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSmartSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const res = await taskService.getSmartSuggestions();
      if (res.success) {
        setSuggestions(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch AI suggestions:', err);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const fetchCustomersList = async () => {
    try {
      const res = await customerService.getCustomers({ limit: 50 });
      if (res.success) {
        setCustomers(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await taskService.updateTask(id, { status: newStatus });
      fetchTasks();
    } catch (err) {
      console.error('Failed to update task status:', err);
    }
  };

  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle) return;
    setIsSubmitting(true);
    try {
      await taskService.createTask({
        title: newTaskTitle,
        description: newTaskDesc,
        type: newTaskType,
        priority: newTaskPriority,
        assignedUserId: newTaskUserId || undefined,
        customerId: newTaskCustomerId || undefined,
        dueDate: newTaskDueDate || undefined,
        source: 'Operator',
      });
      setIsModalOpen(false);
      setNewTaskTitle('');
      setNewTaskDesc('');
      fetchTasks();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConvertSuggestionToTask = async (sugg: SmartSuggestion) => {
    try {
      await taskService.createTask({
        title: sugg.title,
        description: `علت پیشنهاد AI: ${sugg.reason}`,
        type: sugg.action,
        priority: sugg.urgency,
        assignedUser: 'کارشناس ارشد فروش',
        source: 'AI',
      });
      fetchTasks();
    } catch (err) {
      console.error('Failed to convert suggestion:', err);
    }
  };

  // Filter tasks locally by search term
  const filteredTasks = tasks.filter((t) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      t.title.toLowerCase().includes(term) ||
      (t.description && t.description.toLowerCase().includes(term)) ||
      (t.customer && t.customer.name.toLowerCase().includes(term)) ||
      t.assignedUser.toLowerCase().includes(term)
    );
  });

  // Task Stats
  const todayTasksCount = tasks.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled').length;
  const overdueTasksCount = tasks.filter((t) => t.status === 'New' && t.priority === 'URGENT').length;
  const urgentTasksCount = tasks.filter((t) => t.priority === 'URGENT' && t.status !== 'Completed').length;
  const completedTasksCount = tasks.filter((t) => t.status === 'Completed').length;

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">فوری (Urgent)</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">بالا</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200">متوسط</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">پایین</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> تکمیل شده</span>;
      case 'In Progress':
        return <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> در حال انجام</span>;
      case 'Cancelled':
        return <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> لغو شده</span>;
      default:
        return <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> جدید</span>;
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'AI':
        return <span className="text-[10px] bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md flex items-center gap-1"><Sparkles className="w-3 h-3" /> هوش مصنوعی</span>;
      case 'Automation Rule':
        return <span className="text-[10px] bg-cyan-100 text-cyan-700 border border-cyan-200 px-2 py-0.5 rounded-md flex items-center gap-1"><Zap className="w-3 h-3" /> قانون اتوماسیون</span>;
      case 'Admin':
        return <span className="text-[10px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md">مدیریت</span>;
      default:
        return <span className="text-[10px] bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md">کارشناس</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs mb-1">
            <Zap className="w-4 h-4" />
            سیستم هوشمند پیگیری و اتوماسیون فروش بیمه جم
          </div>
          <h2 className="text-2xl font-black">مدیریت وظایف و موتور پیگیری (Task Engine)</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
            تعریف، ارجاع و پیگیری خودکار لیدها، استعلام‌های قیمت و تمدیدهای بیمه‌ای بدون از دست رفتن هیچ شانس فروشی.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentRole === 'ADMIN' && (
            <button onClick={() => setIsTaskTypeModalOpen(true)} className="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2">
              <Tag className="w-4 h-4" /> مدیریت نوع وظیفه
            </button>
          )}
          <button onClick={() => setIsModalOpen(true)} className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs shadow-lg transition-transform hover:scale-105 flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> ثبت وظیفه جدید
          </button>
        </div>
      </div>

      {currentRole === 'ADMIN' && smsSettings && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-black text-slate-800">اعلان پیامکی FastNotify</h3>
              <p className="text-xs text-slate-500 mt-1">اعلان فقط برای مسئول همان وظیفه ارسال می‌شود.</p>
            </div>
            <button
              type="button"
              disabled={savingSms}
              onClick={() => saveSmsSettings({ ...smsSettings, enabled: !smsSettings.enabled })}
              className={`relative w-12 h-7 rounded-full transition-colors ${smsSettings.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
              aria-label="فعال‌سازی اعلان پیامکی"
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${smsSettings.enabled ? 'right-6' : 'right-1'}`} />
            </button>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-700 mb-2">نوع وظیفه‌ها</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {smsSettings.taskTypes.map((taskType) => (
                <label key={taskType.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={smsSettings.selectedTaskTypes.includes(taskType.id)}
                    disabled={savingSms}
                    onChange={() => saveSmsSettings({
                      ...smsSettings,
                      selectedTaskTypes: smsSettings.selectedTaskTypes.includes(taskType.id)
                        ? smsSettings.selectedTaskTypes.filter((id) => id !== taskType.id)
                        : [...smsSettings.selectedTaskTypes, taskType.id],
                    })}
                  />
                  {taskType.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-700 mb-2">دریافت‌کنندگان مجاز</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {smsSettings.users.map((user) => (
                <label key={user.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={smsSettings.selectedRecipientUserIds.includes(user.id)}
                    disabled={savingSms || !user.mobile}
                    onChange={() => saveSmsSettings({
                      ...smsSettings,
                      selectedRecipientUserIds: smsSettings.selectedRecipientUserIds.includes(user.id)
                        ? smsSettings.selectedRecipientUserIds.filter((id) => id !== user.id)
                        : [...smsSettings.selectedRecipientUserIds, user.id],
                    })}
                  />
                  <span>{user.name} ({user.role === 'ADMIN' ? 'مدیر' : 'اپراتور'})</span>
                  {!user.mobile && <span className="text-amber-600">بدون موبایل</span>}
                </label>
              ))}
            </div>
          </div>
          {smsMessage && <div className="text-xs text-slate-600">{smsMessage}</div>}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium block">وظایف امروز</span>
            <span className="text-2xl font-black text-slate-800">{todayTasksCount}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-rose-100 shadow-xs flex items-center gap-3">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium block">وظایف فوری و عقب‌افتاده</span>
            <span className="text-2xl font-black text-rose-600">{overdueTasksCount}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-amber-100 shadow-xs flex items-center gap-3">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium block">اولویت بالا (Urgent)</span>
            <span className="text-2xl font-black text-amber-600">{urgentTasksCount}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-emerald-100 shadow-xs flex items-center gap-3">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium block">تکمیل‌شده</span>
            <span className="text-2xl font-black text-emerald-600">{completedTasksCount}</span>
          </div>
        </div>
      </div>

      {/* AI Smart Follow-Up Suggestions Section */}
      <div className="bg-gradient-to-br from-purple-900/90 to-indigo-900/90 text-white rounded-2xl p-5 shadow-lg border border-purple-500/30">
        <div className="flex items-center justify-between border-b border-purple-700/50 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-500/20 text-purple-300 rounded-lg">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">موتور هوشمند پیشنهاد اقدام بعدی (AI Smart Follow-up Engine)</h3>
              <p className="text-[11px] text-purple-200">پیشنهادات هوش مصنوعی برای جلوگیری از ریزش مشتریان بر اساس رفتار اخیر</p>
            </div>
          </div>
          <button
            onClick={fetchSmartSuggestions}
            disabled={loadingSuggestions}
            className="text-xs text-purple-200 hover:text-white flex items-center gap-1 bg-purple-800/40 px-3 py-1.5 rounded-lg border border-purple-600/40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingSuggestions ? 'animate-spin' : ''}`} />
            به‌روزرسانی تحلیل
          </button>
        </div>

        {loadingSuggestions ? (
          <div className="text-center py-6 text-xs text-purple-200">در حال تحلیل سوابق گفتگوها و محاسبه بهترین اقدام بعدی...</div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-4 text-xs text-purple-200">هیچ پیشنهاد معوقه‌ای یافت نشد. تمام لیدها در وضعیت مطلوب هستند.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {suggestions.map((s, idx) => (
              <div key={idx} className="bg-purple-950/60 border border-purple-500/30 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                      {s.action}
                    </span>
                    <span className="text-[10px] text-purple-300 font-semibold">{s.urgency}</span>
                  </div>
                  <h4 className="text-xs font-bold text-white leading-snug">{s.title}</h4>
                  <p className="text-[11px] text-purple-200/90 leading-relaxed">{s.reason}</p>
                </div>
                <button
                  onClick={() => handleConvertSuggestionToTask(s)}
                  className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  تبدیل به وظیفه و ارجاع
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Task Filters & List */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        {/* Search & Filter Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              type="text"
              placeholder="جستجو در عنوان، توضیح یا نام مشتری..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
            >
              <option value="ALL">تمام وضعیت‌ها</option>
              <option value="New">جدید (New)</option>
              <option value="In Progress">در حال انجام</option>
              <option value="Completed">تکمیل شده</option>
              <option value="Cancelled">لغو شده</option>
            </select>

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
            >
              <option value="ALL">تمام اولویت‌ها</option>
              <option value="URGENT">فوری (Urgent)</option>
              <option value="HIGH">بالا (High)</option>
              <option value="MEDIUM">متوسط (Medium)</option>
              <option value="LOW">پایین (Low)</option>
            </select>

            {/* Source Filter */}
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700">
              <option value="ALL">تمام نوع‌ها</option>
              {taskTypes.map((item) => <option key={item.id} value={item.id}>{item.label}{!item.active ? ' (آرشیو)' : ''}</option>)}
            </select>

            {/* Source Filter */}
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
            >
              <option value="ALL">تمام منبع‌ها</option>
              <option value="AI">هوش مصنوعی</option>
              <option value="Automation Rule">قوانین اتوماسیون</option>
              <option value="Operator">اپراتور</option>
            </select>
          </div>
        </div>

        {/* Task Cards List */}
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-xs">در حال بارگذاری لیست وظایف...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">هیچ وظیفه‌ای ثبت نشده یا یافت نشد</h4>
            <p className="text-xs text-slate-400">می‌توانید با دکمه "ثبت وظیفه جدید" اقدام به تعریف وظیفه نمایید.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className={`p-4 rounded-xl border transition-all duration-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                  task.status === 'Completed'
                    ? 'bg-slate-50/70 border-slate-200 opacity-75'
                    : task.priority === 'URGENT'
                    ? 'bg-rose-50/30 border-rose-200'
                    : 'bg-white border-slate-200 hover:border-blue-300 shadow-2xs'
                }`}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="mt-1">{getStatusBadge(task.status)}</div>

                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className={`text-sm font-bold text-slate-900 ${task.status === 'Completed' ? 'line-through text-slate-500' : ''}`}>
                        {task.title}
                      </h4>
                      {getPriorityBadge(task.priority)}
                      {getSourceBadge(task.source)}
                      <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-mono">
                        نوع: {taskTypes.find((item) => item.id === task.type)?.label || task.type}
                      </span>
                    </div>

                    {task.description && (
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 pt-1">
                      {task.customer && (
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                          مشتری: {task.customer.name} {task.customer.phone ? `(${task.customer.phone})` : ''}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        کارشناس مسئول: <strong className="text-slate-800">{task.assignedUser}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        ثبت: {new Date(task.createdAt).toLocaleDateString('fa-IR')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  {task.status === 'New' && (
                    <button
                      onClick={() => handleUpdateStatus(task.id, 'In Progress')}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors"
                    >
                      شروع اقدام
                    </button>
                  )}
                  {task.status !== 'Completed' && (
                    <button
                      onClick={() => handleUpdateStatus(task.id, 'Completed')}
                      className="px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-xs"
                    >
                      <Check className="w-3.5 h-3.5" />
                      تکمیل وظیفه
                    </button>
                  )}
                  {task.status !== 'Cancelled' && task.status !== 'Completed' && (
                    <button
                      onClick={() => handleUpdateStatus(task.id, 'Cancelled')}
                      className="px-2 py-1.5 text-slate-400 hover:text-rose-600 rounded-lg text-xs font-medium transition-colors"
                    >
                      لغو
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isTaskTypeModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div><h3 className="font-black text-slate-800">مدیریت نوع وظیفه</h3><p className="text-xs text-slate-500 mt-1">نوع‌های استفاده‌شده آرشیو و نوع‌های بدون استفاده حذف می‌شوند.</p></div>
              <button type="button" onClick={() => setIsTaskTypeModalOpen(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <input value={newTaskTypeLabel} onChange={(e) => setNewTaskTypeLabel(e.target.value)} placeholder="عنوان نوع وظیفه" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">قالب پیامک اعلان</label>
                <textarea value={taskTypeTemplate} onChange={(e) => setTaskTypeTemplate(e.target.value)} rows={4} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs leading-6" />
                <div className="mt-2 flex flex-wrap gap-1" dir="ltr">
                  {TASK_SMS_VARIABLES.map((variable) => <code key={variable} className="rounded bg-white px-1.5 py-1 text-[10px] text-blue-700">{variable}</code>)}
                </div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-3 text-xs leading-6 text-slate-600">
                <span className="font-bold text-slate-800">پیش‌نمایش: </span>{taskSmsPreview || 'قالب پیش‌فرض امن هنگام ارسال استفاده می‌شود.'}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={addTaskType} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white">{editingTaskTypeId ? 'ذخیره ویرایش' : 'افزودن نوع'}</button>
                {editingTaskTypeId && <button type="button" onClick={cancelEditingTaskType} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">انصراف</button>}
              </div>
            </div>
            <div className="space-y-2">
              {taskTypes.map((item) => (
                <div key={item.id} className={`flex items-center justify-between rounded-xl border p-3 text-xs ${item.active ? 'border-slate-200' : 'border-slate-100 bg-slate-50 text-slate-400'}`}>
                  <span className="font-bold">{item.label}{!item.active && ' — آرشیوشده'}</span>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => startEditingTaskType(item)} className="font-bold text-blue-600">ویرایش</button>
                    {item.active && <button type="button" onClick={() => deleteTaskType(item.id)} className="text-rose-600 font-bold">حذف / آرشیو</button>}
                  </div>
                </div>
              ))}
            </div>
            {taskTypeMessage && <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{taskTypeMessage}</div>}
          </div>
        </div>
      )}

      {/* Modal Create Task */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                تعریف وظیفه و پیگیری جدید
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTaskSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">عنوان وظیفه *</label>
                <input
                  type="text"
                  required
                  placeholder="مثلا: تماس تلفنی جهت تخفیف بیمه بدنه دنا پلاس"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع اقدام</label>
                  <select
                    value={newTaskType}
                    onChange={(e) => setNewTaskType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  >
                    {taskTypes.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اولویت</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  >
                    <option value="URGENT">فوری (URGENT)</option>
                    <option value="HIGH">بالا (HIGH)</option>
                    <option value="MEDIUM">متوسط (MEDIUM)</option>
                    <option value="LOW">پایین (LOW)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مشتری مربوطه</label>
                  <select
                    value={newTaskCustomerId}
                    onChange={(e) => setNewTaskCustomerId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  >
                    <option value="">-- بدون انتخاب (عمومی) --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone || 'بدون شماره'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مسئول پیگیری</label>
                  <select
                    value={newTaskUserId}
                    onChange={(e) => setNewTaskUserId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  >
                    <option value="">-- بدون مسئول مشخص --</option>
                    {(smsSettings?.users || []).map((user) => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">توضیحات تکمیلی</label>
                <textarea
                  rows={3}
                  placeholder="سابقه صحبت‌ها، نکات کلیدی و نیازهای مشتری..."
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                ></textarea>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-md"
                >
                  {isSubmitting ? 'در حال ثبت...' : 'ثبت وظیفه'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
