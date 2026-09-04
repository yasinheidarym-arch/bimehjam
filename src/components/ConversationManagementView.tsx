import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Search, 
  Send, 
  User, 
  Bot, 
  UserCheck, 
  Clock, 
  Phone, 
  MapPin, 
  Tag, 
  CheckCircle2, 
  RefreshCw, 
  FileText, 
  Sparkles, 
  Database,
  ListChecks,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowRight,
  Flame,
  Award,
  XCircle,
  HelpCircle,
  Edit3,
  DollarSign,
  TrendingUp,
  Coins
} from 'lucide-react';
import { conversationService, customerService, settingService } from '../services/api';
import { AiMode } from '../types';

export interface MessageData {
  id: string;
  senderType: 'CUSTOMER' | 'AI' | 'OPERATOR' | 'SYSTEM';
  content: string;
  createdAt: string;
  rawTime?: number;
  isTestMode?: boolean;
  metadata?: any;
}

export interface SaleOutcome {
  outcome: 'YES' | 'NO' | 'PENDING';
  amount?: number;
  policyNumber?: string;
  reason?: string;
  updatedAt: string;
}

export interface ConversationItem {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerCity?: string;
  lastMessage: string;
  time: string;
  status: string;
  aiStatus: string;
  humanStatus: string;
  assignedOperator: string;
  currentProductName: string;
  leadScore: number;
  leadStatus: string;
  collectedData: Record<string, any>;
  remainingQuestions: string[];
  aiSummary?: string;
  messages: MessageData[];
  timelineEvents?: any[];
}

interface ManagerSaleInquiryWidgetProps {
  conversation: ConversationItem;
  currentOutcome?: SaleOutcome;
  onSaveOutcome: (convId: string, outcome: SaleOutcome) => Promise<void> | void;
}

const ManagerSaleInquiryWidget: React.FC<ManagerSaleInquiryWidgetProps> = ({
  conversation,
  currentOutcome,
  onSaveOutcome,
}) => {
  const [outcomeChoice, setOutcomeChoice] = useState<'YES' | 'NO'>(
    currentOutcome?.outcome === 'NO' ? 'NO' : 'YES'
  );
  const [reason, setReason] = useState<string>(
    currentOutcome?.reason || ''
  );
  const [saleAmount, setSaleAmount] = useState<string>(
    currentOutcome?.amount ? String(currentOutcome.amount) : ''
  );
  const [isEditing, setIsEditing] = useState<boolean>(!currentOutcome);
  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<boolean>(false);

  useEffect(() => {
    if (currentOutcome) {
      setOutcomeChoice(currentOutcome.outcome === 'NO' ? 'NO' : 'YES');
      if (currentOutcome.reason) setReason(currentOutcome.reason);
      if (currentOutcome.amount) setSaleAmount(String(currentOutcome.amount));
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  }, [currentOutcome, conversation.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const numericAmount = saleAmount ? parseInt(saleAmount.replace(/,/g, ''), 10) || undefined : undefined;
    const outcomeData: SaleOutcome = {
      outcome: outcomeChoice,
      amount: outcomeChoice === 'YES' ? numericAmount : undefined,
      reason: outcomeChoice === 'NO' ? reason : undefined,
      updatedAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    };

    await onSaveOutcome(conversation.id, outcomeData);
    setSaving(false);
    setIsEditing(false);
    setSuccessMsg(true);
    setTimeout(() => setSuccessMsg(false), 3000);
  };

  return (
    <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-indigo-500/10 border-2 border-amber-400/80 rounded-2xl p-4 space-y-3.5 shadow-md transition-all relative font-['Vazirmatn',sans-serif]">
      {/* Top Section Header */}
      <div className="flex items-center justify-between gap-2 border-b border-amber-200/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Flame className="w-4.5 h-4.5 text-yellow-200" />
          </div>
          <div>
            <h4 className="font-black text-sm text-slate-900">
              فروش موفق بود؟
            </h4>
            <p className="text-[10px] text-slate-500">
              پرونده مشتری: {conversation.customerName} ({conversation.currentProductName || 'بیمه‌نامه'})
            </p>
          </div>
        </div>

        <span className="text-[10px] font-black text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg shrink-0">
          لید داغ 🔥
        </span>
      </div>

      {/* Success Notification Alert */}
      {successMsg && (
        <div className="bg-emerald-600 text-white text-xs font-bold p-2.5 rounded-xl flex items-center gap-2 animate-fade-in shadow-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>پاسخ ثبت و اطلاعات به پرونده مشتری اضافه گردید!</span>
        </div>
      )}

      {/* Saved Summary View */}
      {!isEditing && currentOutcome ? (
        <div className="space-y-2">
          {currentOutcome.outcome === 'YES' ? (
            <div className="bg-emerald-50 border border-emerald-300 p-3 rounded-xl space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-600" />
                  فروش موفق ثبت شد
                </span>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-[10px] text-indigo-700 hover:text-indigo-900 font-bold bg-white px-2 py-1 rounded-lg border border-indigo-200 shadow-2xs hover:bg-indigo-50 transition-colors"
                >
                  <Edit3 className="w-3 h-3 inline ml-1" /> ویرایش
                </button>
              </div>
              {currentOutcome.amount && (
                <div className="text-xs text-emerald-950 font-bold">
                  مبلغ فروش: {Number(currentOutcome.amount).toLocaleString('fa-IR')} تومان
                </div>
              )}
            </div>
          ) : (
            <div className="bg-rose-50 border border-rose-300 p-3 rounded-xl space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-rose-600" />
                  عدم موفقیت در فروش
                </span>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-[10px] text-indigo-700 hover:text-indigo-900 font-bold bg-white px-2 py-1 rounded-lg border border-indigo-200 shadow-2xs hover:bg-indigo-50 transition-colors"
                >
                  <Edit3 className="w-3 h-3 inline ml-1" /> ویرایش
                </button>
              </div>
              {currentOutcome.reason && (
                <div className="bg-white/80 p-2.5 rounded-lg text-xs text-rose-900 font-medium border border-rose-200">
                  <span className="font-bold block text-[10px] text-rose-700 mb-0.5">علت عدم فروش (ثبت در پرونده مشتری):</span>
                  {currentOutcome.reason}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Interactive Form View */
        <form onSubmit={handleSubmit} className="space-y-3 bg-white/95 p-3.5 rounded-xl border border-amber-200">
          
          {/* Two Buttons Only: بله / خیر */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-700 block">پاسخ:</span>
            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setOutcomeChoice('YES')}
                className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all font-black ${
                  outcomeChoice === 'YES'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-300'
                }`}
              >
                <CheckCircle2 className="w-4.5 h-4.5" />
                <span className="text-xs">بله</span>
              </button>

              <button
                type="button"
                onClick={() => setOutcomeChoice('NO')}
                className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all font-black ${
                  outcomeChoice === 'NO'
                    ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-rose-50 hover:border-rose-300'
                }`}
              >
                <XCircle className="w-4.5 h-4.5" />
                <span className="text-xs">خیر</span>
              </button>
            </div>
          </div>

          {/* Conditional Input Box for 'خیر': Reason field */}
          {outcomeChoice === 'NO' && (
            <div className="space-y-1.5 pt-2 border-t border-slate-100 animate-fade-in">
              <label className="text-[11px] font-bold text-slate-800 block flex items-center gap-1">
                <span>علت عدم فروش:</span>
                <span className="text-rose-600 text-xs">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={3}
                placeholder="دلیل عدم موفقیت در فروش را توسط اپراتور بنویسید (مثلاً: عدم توافق قیمت، خرید از رقیب، عدم پاسخگویی و...)"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-rose-500 focus:bg-white"
              />
            </div>
          )}

          {/* Optional Amount Input for 'بله' */}
          {outcomeChoice === 'YES' && (
            <div className="space-y-1 pt-2 border-t border-slate-100 animate-fade-in">
              <label className="text-[10px] font-bold text-slate-700 block">
                مبلغ نهایی فروش (اختیاری - تومان):
              </label>
              <input
                type="text"
                value={saleAmount}
                onChange={(e) => setSaleAmount(e.target.value)}
                placeholder="مثلاً ۲,۵۰۰,۰۰۰"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
            </div>
          )}

          {/* Save Button */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 font-black text-xs py-2.5 rounded-xl text-white transition-all shadow-md flex items-center justify-center gap-1.5 ${
                outcomeChoice === 'YES'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{saving ? 'در حال افزودن به پرونده...' : 'ذخیره'}</span>
            </button>
            {currentOutcome && (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-2.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                انصراف
              </button>
            )}
          </div>

        </form>
      )}
    </div>
  );
};

interface ConversationManagementViewProps {
  initialConversationId?: string;
}

export const ConversationManagementView: React.FC<ConversationManagementViewProps> = ({
  initialConversationId,
}) => {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string>(
    initialConversationId || ''
  );
  const [activeConversation, setActiveConversation] = useState<ConversationItem | null>(null);
  const [detailsLoading, setDetailsLoading] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replyInput, setReplyInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showCustomerDetails, setShowCustomerDetails] = useState<boolean>(false);
  const [forceShowManagerWidget, setForceShowManagerWidget] = useState<boolean>(false);
  const [aiMode, setAiMode] = useState<AiMode>('TEST_MODE');
  const [changingAiMode, setChangingAiMode] = useState<boolean>(false);
  
  // Persistent manager sale outcomes
  const [saleOutcomes, setSaleOutcomes] = useState<Record<string, SaleOutcome>>(() => {
    try {
      const saved = localStorage.getItem('bimeh_manager_sale_outcomes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedConvIdRef = useRef<string>('');

  useEffect(() => {
    selectedConvIdRef.current = selectedConvId;
  }, [selectedConvId]);

  useEffect(() => {
    if (initialConversationId) {
      setSelectedConvId(initialConversationId);
    }
  }, [initialConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages?.length, activeConversation?.id]);

  const handleSaveSaleOutcome = async (convId: string, outcomeData: SaleOutcome) => {
    const updated = {
      ...saleOutcomes,
      [convId]: outcomeData,
    };
    setSaleOutcomes(updated);
    try {
      localStorage.setItem('bimeh_manager_sale_outcomes', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed saving sale outcome:', e);
    }

    const targetConv = conversations.find((c) => c.id === convId) || (activeConversation?.id === convId ? activeConversation : null);
    if (targetConv?.customerId) {
      const outcomeLabel = outcomeData.outcome === 'YES' ? 'فروش موفق' : 'عدم فروش';
      const detailText = outcomeData.outcome === 'YES'
        ? (outcomeData.amount ? `مبلغ فروش: ${Number(outcomeData.amount).toLocaleString('fa-IR')} تومان` : 'ثبت بدون مبلغ')
        : (outcomeData.reason ? `علت عدم فروش: ${outcomeData.reason}` : 'بدون ذکر علت');

      const noteContent = `[استعلام فروش مدیر] نتیجه: ${outcomeLabel} | ${detailText} (${outcomeData.updatedAt})`;

      try {
        await customerService.addNote(targetConv.customerId, {
          content: noteContent,
          author: 'مدیر سیستم / اپراتور',
        });
      } catch (err) {
        console.warn('Failed to post customer note to database:', err);
      }
    }

    if (outcomeData.outcome === 'YES') {
      handleStatusChange('POLICY_ISSUED');
    } else if (outcomeData.outcome === 'NO') {
      handleStatusChange('CLOSED');
    }
  };

  const isHumanExpertRequired = (c: ConversationItem) => {
    return (
      c.status === 'READY_FOR_PRICE_REQUEST' ||
      c.status === 'WAITING_FOR_EXPERT' ||
      c.status === 'PURCHASE_REQUEST' ||
      c.status === 'PRICE_SENT_TO_CUSTOMER' ||
      c.status === 'NEGOTIATION' ||
      c.humanStatus === 'ASSIGNED' ||
      c.humanStatus === 'IN_PROGRESS' ||
      c.aiStatus === 'HANDED_OFF'
    );
  };

  const isHotLead = (c: ConversationItem) => {
    return c.leadStatus?.toLowerCase() === 'hot' || c.leadScore >= 70;
  };

  const isManagerInquiryTarget = (c: ConversationItem) => {
    return isHumanExpertRequired(c) && isHotLead(c);
  };


  const formatMessage = (m: any): MessageData => {
    const senderType =
      m.senderType === 'CUSTOMER' || m.sender === 'customer' || m.sender === 'user'
        ? 'CUSTOMER'
        : m.senderType === 'OPERATOR' || m.sender === 'operator' || m.sender === 'agent'
        ? 'OPERATOR'
        : m.senderType === 'AI' || m.sender === 'ai' || m.sender === 'bot'
        ? 'AI'
        : 'SYSTEM';

    let isTestMode = Boolean(m.isTestMode);
    if (!isTestMode && m.metadata) {
      try {
        const meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata;
        if (meta?.isTestMode) isTestMode = true;
      } catch {}
    }

    return {
      id: m.id,
      senderType,
      content: m.content || '',
      createdAt: m.createdAt
        ? new Date(m.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
        : '',
      rawTime: m.createdAt ? new Date(m.createdAt).getTime() : 0,
      isTestMode,
      metadata: m.metadata,
    };
  };

  const formatConversationItem = (c: any): ConversationItem => {
    const timeFormatted = c.lastMessageAt
      ? new Date(c.lastMessageAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
      : 'هم‌اکنون';

    const rawMsgs = Array.isArray(c.messages) ? c.messages : [];
    const mappedMessages: MessageData[] = rawMsgs
      .map(formatMessage)
      .sort((a, b) => (a.rawTime || 0) - (b.rawTime || 0));

    let parsedCollectedData = {};
    if (typeof c.collectedData === 'string') {
      try { parsedCollectedData = JSON.parse(c.collectedData); } catch {}
    } else if (typeof c.collectedData === 'object' && c.collectedData !== null) {
      parsedCollectedData = c.collectedData;
    }

    let parsedRemainingQuestions: string[] = [];
    if (typeof c.remainingQuestions === 'string') {
      try { parsedRemainingQuestions = JSON.parse(c.remainingQuestions); } catch {}
    } else if (Array.isArray(c.remainingQuestions)) {
      parsedRemainingQuestions = c.remainingQuestions;
    }

    return {
      id: c.id,
      customerId: c.customerId || c.customer?.id || '',
      customerName: c.customer?.name || 'کاربر جدید گفتینو',
      customerPhone: c.customer?.phone || '',
      customerCity: c.customer?.city || 'نامشخص',
      lastMessage: c.lastMessage || '',
      time: timeFormatted,
      status: c.status || 'NEW',
      aiStatus: c.aiStatus || 'ACTIVE',
      humanStatus: c.humanStatus || 'UNASSIGNED',
      assignedOperator: c.assignedOperator || c.assignedUser?.name || 'دستیار بیمه جم',
      currentProductName: c.currentProductName || 'بیمه عمومی',
      leadScore: c.customer?.leadScore || 50,
      leadStatus: c.customer?.leadStatus || 'Cold',
      collectedData: parsedCollectedData,
      remainingQuestions: parsedRemainingQuestions,
      aiSummary: c.aiSummary || '',
      messages: mappedMessages,
      timelineEvents: c.timelineEvents || [],
    };
  };

  const loadSelectedConversation = async (convId: string, silent = false) => {
    if (!convId) {
      setActiveConversation(null);
      return;
    }
    if (!silent) setDetailsLoading(true);
    try {
      const res: any = await conversationService.getConversationById(convId);
      if (res && res.conversation) {
        const fullConv = formatConversationItem(res.conversation);
        setActiveConversation(fullConv);
      }
    } catch (err) {
      console.warn('Error fetching detailed conversation:', convId, err);
    } finally {
      if (!silent) setDetailsLoading(false);
    }
  };

  const fetchConversationsList = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res: any = await conversationService.getConversations({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: searchQuery,
      });

      if (res && res.data && Array.isArray(res.data)) {
        const mappedList: ConversationItem[] = res.data.map(formatConversationItem);
        setConversations(mappedList);

        const currentSel = selectedConvIdRef.current;
        const exists = mappedList.some((item) => item.id === currentSel);

        if (currentSel && exists) {
          // Keep current selection
        } else if (mappedList.length > 0) {
          const firstId = mappedList[0].id;
          setSelectedConvId(firstId);
          loadSelectedConversation(firstId, silent);
        } else {
          setSelectedConvId('');
          setActiveConversation(null);
        }
      } else {
        setConversations([]);
        setSelectedConvId('');
        setActiveConversation(null);
      }
    } catch (err) {
      console.warn('Error fetching conversations list:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchAiMode = async () => {
    try {
      const res: any = await settingService.getAiMode();
      if (res?.data?.effectiveMode) {
        setAiMode(res.data.effectiveMode);
      }
    } catch (e) {
      console.warn('Failed to fetch AI mode:', e);
    }
  };

  const handleUpdateAiMode = async (newMode: AiMode) => {
    setChangingAiMode(true);
    try {
      const res: any = await settingService.setAiMode(newMode);
      if (res?.data?.effectiveMode) setAiMode(res.data.effectiveMode);
      else await fetchAiMode();
    } catch (e) {
      console.error('Failed to update AI mode:', e);
    } finally {
      setChangingAiMode(false);
    }
  };

  useEffect(() => {
    fetchAiMode();
    fetchConversationsList(false);

    const interval = setInterval(() => {
      fetchConversationsList(true);
      if (selectedConvIdRef.current) {
        loadSelectedConversation(selectedConvIdRef.current, true);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    const aiModeInterval = window.setInterval(fetchAiMode, 30_000);
    return () => window.clearInterval(aiModeInterval);
  }, []);

  const handleSelectConversation = (convId: string) => {
    if (convId === selectedConvId) return;
    setSelectedConvId(convId);
    loadSelectedConversation(convId, false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyInput.trim() || !activeConversation || !selectedConvId) return;

    const text = replyInput.trim();
    setReplyInput('');

    const newMsg: MessageData = {
      id: `m-${Date.now()}`,
      senderType: 'OPERATOR',
      content: text,
      createdAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    };

    setActiveConversation((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lastMessage: text,
        time: 'هم‌اکنون',
        status: 'PRICE_SENT_TO_CUSTOMER',
        messages: [...prev.messages, newMsg],
      };
    });

    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedConvId
          ? { ...c, lastMessage: text, time: 'هم‌اکنون', status: 'PRICE_SENT_TO_CUSTOMER' }
          : c
      )
    );

    try {
      await conversationService.sendMessage(selectedConvId, {
        content: text,
        senderType: 'OPERATOR',
        messageType: 'TEXT',
      });
      loadSelectedConversation(selectedConvId, true);
      fetchConversationsList(true);
    } catch (err) {
      console.error('Failed to post message to backend:', err);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!activeConversation || !selectedConvId) return;

    setActiveConversation((prev) => (prev ? { ...prev, status: newStatus } : null));
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedConvId ? { ...c, status: newStatus } : c))
    );

    try {
      await conversationService.updateStatus(selectedConvId, newStatus);
      loadSelectedConversation(selectedConvId, true);
      fetchConversationsList(true);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'NEW':
        return <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md text-[10px] font-bold">جدید</span>;
      case 'AI_CONVERSATION':
        return <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1"><Sparkles className="w-3 h-3 text-purple-600" /> گفتگو با AI</span>;
      case 'COLLECTING_QUOTATION_INFORMATION':
        return <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md text-[10px] font-bold">در حال دریافت استعلام</span>;
      case 'READY_FOR_PRICE_REQUEST':
        return <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md text-[10px] font-black animate-pulse flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-600" /> آماده استعلام قیمت</span>;
      case 'WAITING_FOR_EXPERT':
        return <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md text-[10px] font-bold">در انتظار کارشناس</span>;
      case 'PRICE_SENT_TO_CUSTOMER':
        return <span className="bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-md text-[10px] font-bold">قیمت ارسال شد</span>;
      case 'NEGOTIATION':
        return <span className="bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-md text-[10px] font-bold">در حال مذاکره</span>;
      case 'PURCHASE_REQUEST':
        return <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-md text-[10px] font-bold">درخواست خرید ثبت شد</span>;
      case 'POLICY_ISSUED':
        return <span className="bg-emerald-500 text-white px-2 py-0.5 rounded-md text-[10px] font-black">بیمه‌نامه صادر شد</span>;
      case 'CLOSED':
        return <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md text-[10px] font-bold">بسته شده</span>;
      default:
        return <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-bold">{status}</span>;
    }
  };

  const humanQueueCount = conversations.filter(isHumanExpertRequired).length;
  const hotManagerCount = conversations.filter(isManagerInquiryTarget).length;

  const filteredConversations = conversations.filter((c) => {
    const matchesFilter =
      statusFilter === 'ALL' ||
      (statusFilter === 'HOT_MANAGER' && isManagerInquiryTarget(c)) ||
      (statusFilter === 'EXPERT_QUEUE' && isHumanExpertRequired(c)) ||
      (statusFilter === 'READY' && c.status === 'READY_FOR_PRICE_REQUEST') ||
      (statusFilter === 'AI' && (c.status === 'AI_CONVERSATION' || c.status === 'COLLECTING_QUOTATION_INFORMATION')) ||
      (statusFilter === 'CLOSED' && c.status === 'CLOSED');

    const matchesSearch =
      searchQuery === '' ||
      c.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.currentProductName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const activeCollectedData = activeConversation?.collectedData || {};
  const collectedKeys = Object.keys(activeCollectedData);
  const remainingQuestionsList: string[] = activeConversation?.remainingQuestions || [];
  const activeTimeline = activeConversation?.timelineEvents || [];

  return (
    <div className="space-y-4 font-['Vazirmatn',sans-serif] text-slate-800">
      
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">صندوق ورودی گفتگوها و استعلام قیمت (Inbox)</h2>
              {aiMode === 'TEST_MODE' && (
                <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-lg text-[11px] font-black flex items-center gap-1 shadow-2xs">
                  <span>🧪 AI Test Mode فعال</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">مشاهده صف کارشناسان، داده‌های استخراجی استعلام قیمت و ثبت آمار فروش نهایی مدیر</p>
          </div>
        </div>

        {/* AI Mode Selector & Status Filter Buttons */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* AI Mode Quick Toggle */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
            <span className="text-[11px] font-bold text-slate-500 shrink-0">وضعیت AI:</span>
            <select
              value={aiMode}
              onChange={(e) => handleUpdateAiMode(e.target.value as AiMode)}
              disabled={changingAiMode}
              className={`font-black text-xs px-2.5 py-1 rounded-lg border focus:outline-hidden transition-colors cursor-pointer ${
                aiMode === 'TEST_MODE'
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : aiMode === 'ACTIVE'
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : 'bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              <option value="TEST_MODE">🧪 تست مود (AI Test Mode)</option>
              <option value="ACTIVE">🟢 فعال (ارسال زنده به مشتری)</option>
              <option value="OFF">🔴 خاموش</option>
            </select>
          </div>

          {/* Status Filter Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold overflow-x-auto w-full md:w-auto">
            <button
              onClick={() => setStatusFilter('HOT_MANAGER')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                statusFilter === 'HOT_MANAGER'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-xs font-black'
                  : 'bg-amber-100/70 text-amber-900 hover:bg-amber-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              <span>🔥 استعلام فروش مدیر</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${statusFilter === 'HOT_MANAGER' ? 'bg-white text-amber-900' : 'bg-amber-600 text-white'}`}>
                {hotManagerCount}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('EXPERT_QUEUE')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                statusFilter === 'EXPERT_QUEUE'
                  ? 'bg-amber-500 text-white shadow-xs font-black'
                  : 'bg-slate-200/70 text-slate-700 hover:bg-slate-300'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>صف کارشناسان ({humanQueueCount})</span>
            </button>

            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'ALL' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              همه ({conversations.length})
            </button>

            <button
              onClick={() => setStatusFilter('READY')}
              className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'READY' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              آماده قیمت
            </button>

            <button
              onClick={() => setStatusFilter('AI')}
              className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'AI' ? 'bg-white text-purple-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              استعلام AI
            </button>
          </div>
        </div>
      </div>

      {/* Main 3-Column Layout: Inbox (List) | Chat Window | Structured Collected Data Side Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[620px]">
        
        {/* Column 1: Conversations List (Inbox) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden">
          
          {/* Search Bar */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <input
                type="text"
                placeholder="جستجو بر اساس نام، محصول یا پیام..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs focus:outline-hidden focus:border-indigo-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            </div>
          </div>

          {/* List Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                گفتگویی با این مشخصات یافت نشد.
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = conv.id === selectedConvId;
                const saleRecord = saleOutcomes[conv.id];

                return (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`p-3.5 transition-all cursor-pointer flex flex-col gap-2 border-r-4 ${
                      isSelected 
                        ? 'bg-indigo-50/70 border-r-indigo-600' 
                        : 'hover:bg-slate-50/80 border-r-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-slate-700 to-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {conv.customerName.charAt(0)}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 text-xs block">{conv.customerName}</span>
                          <span className="text-[10px] text-indigo-700 font-bold">{conv.currentProductName}</span>
                        </div>
                      </div>

                      <span className="text-[10px] text-slate-400">{conv.time}</span>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-1 font-medium pr-1">
                      {conv.lastMessage || 'بدون پیام اولیه'}
                    </p>

                    <div className="flex items-center justify-between pt-1 text-[10px]">
                      {getStatusBadge(conv.status)}
                      
                      {saleRecord?.outcome === 'YES' ? (
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded text-[9px] font-black flex items-center gap-1">
                          <Award className="w-3 h-3 text-emerald-600" />
                          فروش موفق
                        </span>
                      ) : saleRecord?.outcome === 'NO' ? (
                        <span className="bg-rose-100 text-rose-800 border border-rose-300 px-1.5 py-0.5 rounded text-[9px] font-bold">
                          ❌ عدم فروش
                        </span>
                      ) : isManagerInquiryTarget(conv) ? (
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[9px] font-black animate-pulse flex items-center gap-1">
                          <Flame className="w-3 h-3 text-amber-600" />
                          استعلام فروش مدیر
                        </span>
                      ) : (
                        <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                          لید {conv.leadScore}٪
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>

        {/* Column 2: Chat Window */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden">
          
          {detailsLoading && !activeConversation ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
              <span>در حال بارگذاری اطلاعات گفتگو...</span>
            </div>
          ) : activeConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
                    {activeConversation.customerName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      <span>{activeConversation.customerName}</span>
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-[10px]">
                        {activeConversation.currentProductName}
                      </span>
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span>{activeConversation.customerPhone || 'تلفن ثبت‌نشده'}</span>
                      <span>•</span>
                      <span>{activeConversation.customerCity}</span>
                    </div>
                  </div>
                </div>

                {/* Change Conversation Status Dropdown */}
                <select
                  value={activeConversation.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-bold text-slate-700 focus:outline-hidden"
                >
                  <option value="NEW">جدید</option>
                  <option value="AI_CONVERSATION">گفتگو با AI</option>
                  <option value="COLLECTING_QUOTATION_INFORMATION">در حال دریافت استعلام</option>
                  <option value="READY_FOR_PRICE_REQUEST">آماده محاسبه و اعلام قیمت</option>
                  <option value="WAITING_FOR_EXPERT">در انتظار کارشناس بیمه</option>
                  <option value="PRICE_SENT_TO_CUSTOMER">قیمت و استعلام ارسال شد</option>
                  <option value="NEGOTIATION">در حال مذاکره</option>
                  <option value="PURCHASE_REQUEST">درخواست خرید</option>
                  <option value="POLICY_ISSUED">بیمه‌نامه صادر شد</option>
                  <option value="CLOSED">خاتمه گفتگو</option>
                </select>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
                {activeConversation.messages.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs space-y-1">
                    <MessageSquare className="w-6 h-6 mx-auto text-slate-300" />
                    <p className="font-bold">پیامی در این گفتگو وجود ندارد.</p>
                    <p className="text-[10px] text-slate-400">پیام‌های ارسال شده توسط مشتری یا اپراتور در این قسمت نمایش داده خواهند شد.</p>
                  </div>
                ) : (
                  activeConversation.messages.map((msg) => {
                    const isCustomer = msg.senderType === 'CUSTOMER';
                    const isAI = msg.senderType === 'AI';
                    const isOperator = msg.senderType === 'OPERATOR';
                    const isSystem = msg.senderType === 'SYSTEM';

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="flex justify-center my-2">
                          <span className="bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-medium px-3 py-1 rounded-full shadow-2xs">
                            {msg.content}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={msg.id}
                        className={`flex w-full ${isCustomer ? 'justify-start' : 'justify-end'} my-1.5`}
                      >
                        <div
                          className={`flex gap-2.5 text-xs max-w-[82%] ${
                            isCustomer ? 'flex-row' : 'flex-row-reverse'
                          }`}
                        >
                          {/* Avatar */}
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-xs shadow-xs ${
                              isCustomer
                                ? 'bg-gradient-to-tr from-blue-700 to-indigo-600'
                                : isAI
                                ? 'bg-gradient-to-tr from-purple-700 to-purple-500'
                                : 'bg-gradient-to-tr from-emerald-700 to-teal-600'
                            }`}
                          >
                            {isCustomer ? (
                              <User className="w-4 h-4" />
                            ) : isAI ? (
                              <Bot className="w-4 h-4" />
                            ) : (
                              <UserCheck className="w-4 h-4" />
                            )}
                          </div>

                          {/* Message Bubble */}
                          <div
                            className={`p-3.5 rounded-2xl space-y-1.5 shadow-xs border ${
                              isCustomer
                                ? 'bg-indigo-600 text-white border-indigo-500 rounded-tr-xs'
                                : isAI
                                ? 'bg-purple-50/95 text-purple-950 border-purple-200/90 rounded-tl-xs'
                                : 'bg-emerald-50/95 text-emerald-950 border-emerald-200/90 rounded-tl-xs'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-4 text-[11px] font-bold border-b pb-1 opacity-90 border-current/10">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {isCustomer && `خریدار: ${activeConversation.customerName}`}
                                {isAI && (
                                  <>
                                    <Sparkles className="w-3 h-3 text-purple-600 inline" />
                                    <span>دستیار هوشمند بیمه (AI)</span>
                                    {msg.isTestMode && (
                                      <span className="bg-amber-200/90 text-amber-950 border border-amber-400 px-2 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1 shadow-2xs">
                                        <span>🧪 تست مود فعال</span>
                                      </span>
                                    )}
                                  </>
                                )}
                                {isOperator && `کارشناس: ${activeConversation.assignedOperator}`}
                              </div>
                              <span className="font-mono text-[10px] dir-ltr opacity-75">{msg.createdAt}</span>
                            </div>

                            <p className="leading-relaxed font-medium text-xs whitespace-pre-wrap">{msg.content}</p>

                            {/* Test Mode Warning Banner under AI message */}
                            {isAI && msg.isTestMode && (
                              <div className="mt-2.5 pt-2 border-t border-amber-300/80 bg-amber-100/80 -mx-1.5 -mb-1 p-2 rounded-xl text-[11px] text-amber-950 font-semibold flex items-start gap-1.5 border border-amber-300 shadow-2xs">
                                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                                <span>این پاسخ فقط برای بررسی مدیر ایجاد شده و برای مشتری ارسال نشده است.</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
                <input
                  type="text"
                  placeholder="پاسخ به گفتگو و اعلام قیمت به خریدار..."
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-hidden focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!replyInput.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold p-2.5 rounded-xl transition-all shadow-md shadow-indigo-600/20"
                >
                  <Send className="w-4 h-4 rotate-180" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs space-y-2">
              <MessageSquare className="w-8 h-8 text-slate-300" />
              <span>گفتگویی انتخاب نشده است.</span>
            </div>
          )}

        </div>

        {/* Column 3: STRUCTURED COLLECTED DATA SIDE PANEL (Single Source of Truth for Quotations) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col space-y-4 overflow-y-auto">
          {activeConversation ? (
            <>
              {/* Manager Final Sale Inquiry Widget (Automatic for Hot Leads transferred to Human Operator, or if Manager toggled) */}
              {(isManagerInquiryTarget(activeConversation) || forceShowManagerWidget || saleOutcomes[activeConversation.id]) && (
                <ManagerSaleInquiryWidget
                  conversation={activeConversation}
                  currentOutcome={saleOutcomes[activeConversation.id]}
                  onSaveOutcome={handleSaveSaleOutcome}
                />
              )}

              {/* Optional Manual Toggle Button if not auto-triggered */}
              {!isManagerInquiryTarget(activeConversation) && !saleOutcomes[activeConversation.id] && (
                <button
                  onClick={() => setForceShowManagerWidget(!forceShowManagerWidget)}
                  className="w-full bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold py-2 px-3 rounded-xl transition-colors flex items-center justify-between shadow-2xs"
                >
                  <span className="flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-amber-600" />
                    <span>{forceShowManagerWidget ? 'بستن استعلام فروش مدیر' : 'نمایش بخش استعلام فروش مدیر'}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${forceShowManagerWidget ? 'rotate-180' : ''}`} />
                </button>
              )}

              {/* Collected Data Panel Title */}
              <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-3.5 rounded-xl space-y-1.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-300 flex items-center gap-1">
                    <Database className="w-3.5 h-3.5 text-indigo-400" />
                    اطلاعات استعلام قیمت (Collected Data)
                  </span>
                  <span className="bg-indigo-700/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                    مختص این گفتگو
                  </span>
                </div>
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <span>{activeConversation.currentProductName}</span>
                </h4>
                <p className="text-[10px] text-indigo-200 leading-normal">
                  منبع رسمی داده‌های استعلام جهت محاسبه نرخ توسط کارشناس بیمه
                </p>
              </div>

              {/* Status Banner */}
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">وضعیت استعلام:</span>
                {getStatusBadge(activeConversation.status)}
              </div>

              {/* Structured Extracted Key-Values */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-indigo-600" />
                    <span>فیلدهای دریافت‌شده ({collectedKeys.length})</span>
                  </span>
                  {collectedKeys.length > 0 && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-bold border border-emerald-100">
                      تکمیل‌شده توسط AI
                    </span>
                  )}
                </div>

                {collectedKeys.length === 0 ? (
                  <div className="bg-amber-50/60 border border-amber-200 p-3 rounded-xl text-center space-y-1">
                    <AlertCircle className="w-4 h-4 text-amber-600 mx-auto" />
                    <p className="text-xs text-amber-900 font-bold">هنوز فیلدی استخراج نشده است</p>
                    <p className="text-[10px] text-amber-700">با پاسخ کاربر در چت، فیلدها به‌صورت خودکار در این پنل ذخیره می‌شوند.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {collectedKeys.map((key) => {
                      const val = String(activeCollectedData[key]);
                      const isCopied = copiedKey === key;
                      return (
                        <div
                          key={key}
                          className="bg-white border border-slate-200 hover:border-indigo-300 p-2.5 rounded-xl shadow-2xs flex items-center justify-between transition-all"
                        >
                          <div className="space-y-0.5">
                            <span className="text-[10px] text-slate-500 font-bold block">{key}:</span>
                            <span className="text-xs font-bold text-slate-900">{val}</span>
                          </div>
                          <button
                            onClick={() => copyToClipboard(`${key}: ${val}`, key)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="کپی در حافظه"
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Remaining Required Questions */}
              {remainingQuestionsList.length > 0 && (
                <div className="bg-indigo-50/60 border border-indigo-200 p-3 rounded-xl space-y-2">
                  <span className="text-[11px] font-bold text-indigo-900 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                    <span>سوالات باقی‌مانده جهت تکمیل استعلام:</span>
                  </span>
                  <ul className="space-y-1.5 text-xs text-indigo-950 font-medium pr-3 list-disc">
                    {remainingQuestionsList.map((q, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* AI Summary for Operator */}
              {activeConversation.aiSummary && (
                <div className="bg-purple-50/70 border border-purple-200 p-3 rounded-xl space-y-1.5">
                  <span className="text-[10px] font-black text-purple-900 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    خلاصه AI برای کارشناس بیمه:
                  </span>
                  <p className="text-xs text-purple-950 font-medium leading-relaxed">
                    {activeConversation.aiSummary}
                  </p>
                </div>
              )}

              {/* Conversation Event Timeline */}
              {activeTimeline.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-slate-600" />
                    تایم‌لاین رویدادهای این استعلام ({activeTimeline.length})
                  </span>
                  <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                    {activeTimeline.map((ev: any) => (
                      <div key={ev.id} className="text-[11px] bg-slate-50 border border-slate-200/70 p-2 rounded-lg space-y-0.5">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-900">{ev.title}</span>
                          <span className="text-[9px] text-slate-400 font-mono">
                            {new Date(ev.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {ev.description && <p className="text-slate-600 text-[10px]">{ev.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Collapsible Customer Profile Info */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <button
                  onClick={() => setShowCustomerDetails(!showCustomerDetails)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-slate-600" />
                    مشخصات کلی پرونده مشتری
                  </span>
                  {showCustomerDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showCustomerDetails && (
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">نام:</span>
                      <span className="font-bold text-slate-900">{activeConversation.customerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">تلفن:</span>
                      <span className="font-mono text-slate-900 dir-ltr">{activeConversation.customerPhone || 'ثبت‌نشده'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">شهر:</span>
                      <span className="font-bold text-slate-900">{activeConversation.customerCity}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">اپراتور مسئول:</span>
                      <span className="font-bold text-indigo-700">{activeConversation.assignedOperator}</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-slate-400 text-xs text-center py-8">
              اطلاعات گفتگویی انتخاب نشده است.
            </div>
          )}
        </div>

      </div>

    </div>
  );
};

