import React, { useState, useEffect } from 'react';
import {
  Zap,
  Plus,
  Play,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowLeft,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
  FileCode,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import { automationService, taskTypeService } from '../services/api';

interface AutomationRuleItem {
  id: string;
  name: string;
  event: string;
  condition?: string;
  action: string;
  actionPayload?: string;
  active: boolean;
  createdAt: string;
  executions?: any[];
}

export const AutomationRuleBuilder: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'rules' | 'logs'>('rules');
  const [rules, setRules] = useState<AutomationRuleItem[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // New Rule Form State
  const [ruleName, setRuleName] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('LEAD_HOT');
  const [selectedAction, setSelectedAction] = useState('CREATE_TASK');
  const [taskTitle, setTaskTitle] = useState('تماس پیگیری فوری با مشتری');
  const [taskPriority, setTaskPriority] = useState('HIGH');
  const [taskType, setTaskType] = useState('Call Customer');
  const [taskTypes, setTaskTypes] = useState<Array<{ id: string; label: string }>>([]);
  const [taskAssignedUser, setTaskAssignedUser] = useState('کارشناس ارشد فروش');
  const [minLeadScore, setMinLeadScore] = useState<number>(80);
  const [inactiveDays, setInactiveDays] = useState<number>(3);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manual Test Trigger
  const [testEventName, setTestEventName] = useState('LEAD_HOT');
  const [testScore, setTestScore] = useState(85);
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    fetchRules();
    fetchExecutions();
    taskTypeService.getTypes().then((res: any) => {
      if (res.success) {
        setTaskTypes(res.data);
        if (res.data[0]) setTaskType(res.data[0].id);
      }
    }).catch(() => undefined);
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await automationService.getRules();
      if (res.data && res.data.success) {
        setRules(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchExecutions = async () => {
    try {
      const res = await automationService.getExecutions();
      if (res.data && res.data.success) {
        setExecutions(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch executions:', err);
    }
  };

  const handleToggleRuleActive = async (rule: AutomationRuleItem) => {
    try {
      await automationService.updateRule(rule.id, { active: !rule.active });
      fetchRules();
    } catch (err) {
      console.error('Failed to toggle rule active state:', err);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('آیا از حذف این قانون اتوماسیون اطمینان دارید؟')) return;
    try {
      await automationService.deleteRule(id);
      fetchRules();
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  const handleCreateRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName) return;

    setIsSubmitting(true);
    try {
      let conditionObj: any = {};
      if (selectedEvent === 'LEAD_HOT') conditionObj.scoreGt = minLeadScore;
      if (selectedEvent === 'QUOTATION_SENT_INACTIVE' || selectedEvent === 'CUSTOMER_INACTIVE') {
        conditionObj.inactiveDays = inactiveDays;
      }

      let payloadObj: any = {};
      if (selectedAction === 'CREATE_TASK') {
        payloadObj = {
          taskTitle,
          taskType,
          priority: taskPriority,
          assignedUser: taskAssignedUser,
        };
      } else if (selectedAction === 'SEND_NOTIFICATION') {
        payloadObj = {
          title: `اعلان اتوماسیون: ${ruleName}`,
          priority: taskPriority,
          type: 'Follow Up Required',
        };
      } else if (selectedAction === 'CHANGE_LEAD_STATUS') {
        payloadObj = { status: 'QUALIFIED' };
      } else if (selectedAction === 'ASSIGN_EXPERT') {
        payloadObj = { expertName: taskAssignedUser };
      }

      await automationService.createRule({
        name: ruleName,
        event: selectedEvent,
        condition: JSON.stringify(conditionObj),
        action: selectedAction,
        actionPayload: JSON.stringify(payloadObj),
        active: true,
      });

      setIsModalOpen(false);
      setRuleName('');
      fetchRules();
    } catch (err) {
      console.error('Failed to create automation rule:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualTestTrigger = async () => {
    try {
      setTestMessage('در حال اجرا و تست قوانین...');
      const res = await automationService.triggerEvent(testEventName, {
        score: Number(testScore),
        inactiveDays: Number(inactiveDays),
        notes: 'تست دستی توسط مدیر سیستم',
      });
      if (res.data && res.data.success) {
        setTestMessage(`رویداد با موفقیت اجرا شد. ${res.data.data.length} قانون اعمال گردید.`);
        fetchExecutions();
        fetchRules();
      }
    } catch (err) {
      setTestMessage('خطا در تست اجرای رویداد');
    }
  };

  const getEventPersianLabel = (event: string) => {
    switch (event) {
      case 'LEAD_HOT':
        return 'داغ شدن لید (Lead Score > X)';
      case 'CONVERSATION_NEW':
        return 'شروع گفتگوی جدید توسط مشتری';
      case 'QUOTATION_SENT_INACTIVE':
        return 'استعلام قیمت ارسال‌شده بدون پاسخ';
      case 'CUSTOMER_INACTIVE':
        return 'غیرفعال شدن مشتری (توقف چت)';
      case 'QUOTATION_COMPLETED':
        return 'تکمیل فرم استعلام قیمت';
      case 'RENEWAL_APPROACHING':
        return 'نزدیك شدن به موعد تمدید بیمه‌نامه';
      default:
        return event;
    }
  };

  const getActionPersianLabel = (action: string) => {
    switch (action) {
      case 'CREATE_TASK':
        return 'ایجاد وظیفه جدید برای کارشناس';
      case 'SEND_NOTIFICATION':
        return 'ارسال هشدار زنده در سیستم';
      case 'CHANGE_LEAD_STATUS':
        return 'تغییر وضعیت لید فروش';
      case 'ASSIGN_EXPERT':
        return 'تخصیص کارشناس ارشد به مشتری';
      case 'ADD_TAG':
        return 'افزودن برچسب ویژه به مشتری';
      default:
        return action;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs mb-1">
            <Zap className="w-4 h-4" />
            موتور قوانین اتوماسیون هوشمند فروش (Automation Rules Engine)
          </div>
          <h2 className="text-2xl font-black">تعریف قوانین خودکار (WHEN → THEN)</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
            بدون نیاز به کدنویسی، قوانین پاسخ‌دهی هوشمند، ارجاع لیدها و یادآوری استعلام‌های بیمه‌ای را پیکربندی کنید.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-lg transition-transform hover:scale-105 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            ایجاد قانون جدید
          </button>
        </div>
      </div>

      {/* Safety Notice Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 leading-relaxed">
          <strong>فرآیند عملیاتی بیمه جم:</strong> دستیار هوشمند (AI) به صورت کاملاً مستقل و مستقیم با مشتری در چت‌روم گفتگو کرده و تمامی اطلاعات استعلام قیمت را جمع‌آوری می‌نماید. پس از تکمیل پاسخ‌های استعلام، سیستم خودکار پرونده استعلام را برای کارشناس مربوطه آماده کرده و گفتگو به وضعیت <strong>«آماده اعلام قیمت توسط کارشناس»</strong> منتقل می‌شود.
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'rules'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          قوانین فعال ({rules.length})
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'logs'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Activity className="w-4 h-4" />
          سابقه اجرا و لاگ‌ها ({executions.length})
        </button>
      </div>

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          {/* Manual Test Trigger Widget */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-600" />
                تست و اجرای دستی موتور اتوماسیون
              </span>
              {testMessage && <span className="text-xs font-semibold text-blue-600">{testMessage}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[11px] text-slate-500 font-semibold mb-1">رویداد آزمایشی</label>
                <select
                  value={testEventName}
                  onChange={(e) => setTestEventName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                >
                  <option value="LEAD_HOT">LEAD_HOT (لید داغ)</option>
                  <option value="CONVERSATION_NEW">CONVERSATION_NEW (گفتگوی جدید)</option>
                  <option value="QUOTATION_SENT_INACTIVE">QUOTATION_SENT_INACTIVE (استعلام بدون پاسخ)</option>
                  <option value="CUSTOMER_INACTIVE">CUSTOMER_INACTIVE (مشتری غیرفعال)</option>
                </select>
              </div>

              {testEventName === 'LEAD_HOT' && (
                <div className="w-32">
                  <label className="block text-[11px] text-slate-500 font-semibold mb-1">امتیاز لید (Score)</label>
                  <input
                    type="number"
                    value={testScore}
                    onChange={(e) => setTestScore(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  />
                </div>
              )}

              <button
                onClick={handleManualTestTrigger}
                className="mt-5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                تست و فراخوانی رویداد
              </button>
            </div>
          </div>

          {/* Rules List */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            {loading ? (
              <div className="text-center py-12 text-slate-400 text-xs">در حال بارگذاری قوانین اتوماسیون...</div>
            ) : rules.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-400">هیچ قانونی تعریف نشده است.</div>
            ) : (
              <div className="space-y-4">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`p-5 rounded-2xl border transition-all duration-200 space-y-3 ${
                      rule.active ? 'bg-white border-slate-200 hover:border-blue-300 shadow-2xs' : 'bg-slate-50 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{rule.name}</h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${rule.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                            {rule.active ? 'فعال' : 'غیرفعال'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">شناسه: {rule.id}</p>
                      </div>

                      <div className="flex items-center gap-3 self-end md:self-center">
                        <button
                          onClick={() => handleToggleRuleActive(rule)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 ${
                            rule.active ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {rule.active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                        </button>

                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                          title="حذف قانون"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* WHEN / THEN visual flow representation */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 text-xs">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">WHEN (هنگام وقوع رویداد)</span>
                        <div className="font-bold text-slate-800">{getEventPersianLabel(rule.event)}</div>
                        {rule.condition && rule.condition !== '{}' && (
                          <div className="text-[11px] text-slate-500 font-mono">شرط: {rule.condition}</div>
                        )}
                      </div>

                      <div className="space-y-1 border-t md:border-t-0 md:border-r border-slate-200 pt-2 md:pt-0 md:pr-4">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">THEN (اقدام سیستم)</span>
                        <div className="font-bold text-slate-800">{getActionPersianLabel(rule.action)}</div>
                        {rule.actionPayload && rule.actionPayload !== '{}' && (
                          <div className="text-[11px] text-slate-500 font-mono">پیکربندی: {rule.actionPayload}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Execution Logs Tab */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800">تاریخچه اجراهای اخیر موتور اتوماسیون</h3>
            <button
              onClick={fetchExecutions}
              className="text-xs text-blue-600 font-bold hover:underline"
            >
              به‌روزرسانی
            </button>
          </div>

          {executions.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400">هیچ رویدادی اجرا نشده است.</div>
          ) : (
            <div className="space-y-3">
              {executions.map((exe) => (
                <div key={exe.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">{exe.rule?.name || 'قانون اتوماسیون'}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${exe.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {exe.status}
                    </span>
                  </div>
                  <p className="text-slate-600">{exe.details}</p>
                  <span className="text-[10px] text-slate-400 block pt-1">
                    تاریخ اجرا: {new Date(exe.executedAt).toLocaleDateString('fa-IR')} {new Date(exe.executedAt).toLocaleTimeString('fa-IR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Create Rule */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                تعریف قانون اتوماسیون جدید
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRuleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نام قانون *</label>
                <input
                  type="text"
                  required
                  placeholder="مثلا: ارجاع فوری لیدهای بالای ۸۰ امتیاز"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* WHEN section */}
              <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-xl space-y-2">
                <label className="block text-xs font-bold text-blue-900">WHEN (رویداد محرک)</label>
                <select
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-medium"
                >
                  <option value="LEAD_HOT">لید داغ می‌شود (Lead Score &gt; threshold)</option>
                  <option value="CONVERSATION_NEW">گفتگوی جدید توسط مشتری آغاز شد</option>
                  <option value="QUOTATION_SENT_INACTIVE">پیشنهاد/استعلام قیمت ارسال‌شده بدون پاسخ ماند</option>
                  <option value="CUSTOMER_INACTIVE">مشتری چند روز غیرفعال ماند</option>
                  <option value="QUOTATION_COMPLETED">فرم استعلام قیمت توسط مشتری تکمیل شد</option>
                </select>

                {selectedEvent === 'LEAD_HOT' && (
                  <div className="pt-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">حداقل امتیاز لید (Lead Score)</label>
                    <input
                      type="number"
                      value={minLeadScore}
                      onChange={(e) => setMinLeadScore(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                )}

                {(selectedEvent === 'QUOTATION_SENT_INACTIVE' || selectedEvent === 'CUSTOMER_INACTIVE') && (
                  <div className="pt-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">تعداد روزهای عدم فعالیت</label>
                    <input
                      type="number"
                      value={inactiveDays}
                      onChange={(e) => setInactiveDays(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                )}
              </div>

              {/* THEN section */}
              <div className="p-3.5 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-2">
                <label className="block text-xs font-bold text-emerald-900">THEN (اقدام خودکار)</label>
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-medium"
                >
                  <option value="CREATE_TASK">ایجاد وظیفه (Task) برای کارشناس</option>
                  <option value="SEND_NOTIFICATION">ارسال اعلان (Notification) در سیستم</option>
                  <option value="CHANGE_LEAD_STATUS">تغییر وضعیت لید به QUALIFIED</option>
                  <option value="ASSIGN_EXPERT">تخصیص مشتری به کارشناس ارشد</option>
                </select>

                {selectedAction === 'CREATE_TASK' && (
                  <div className="space-y-2 pt-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">عنوان وظیفه</label>
                      <input
                        type="text"
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">نوع وظیفه</label>
                      <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs">
                        {taskTypes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">اولویت</label>
                        <select
                          value={taskPriority}
                          onChange={(e) => setTaskPriority(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
                        >
                          <option value="URGENT">URGENT (فوری)</option>
                          <option value="HIGH">HIGH (بالا)</option>
                          <option value="MEDIUM">MEDIUM (متوسط)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">کارشناس مسئول</label>
                        <input
                          type="text"
                          value={taskAssignedUser}
                          onChange={(e) => setTaskAssignedUser(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-md"
                >
                  {isSubmitting ? 'در حال ثبت...' : 'ذخیره قانون'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
