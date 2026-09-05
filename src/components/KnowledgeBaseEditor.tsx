import React, { useState, useEffect, useRef } from 'react';
import {
  Brain,
  Plus,
  Trash2,
  Edit3,
  Search,
  CheckCircle2,
  XCircle,
  FileText,
  Shield,
  HelpCircle,
  MessageSquare,
  Sliders,
  RefreshCw,
  Info,
  Sparkles,
  Tag,
  AlertTriangle,
  Layers,
  ChevronRight,
  Filter,
  Check,
  Zap,
  UserCheck,
  PhoneOff,
  DollarSign,
  Maximize2,
  X,
  Clock,
  Terminal,
  ChevronDown,
  ChevronUp,
  Play,
  Loader2,
  ListChecks,
  RotateCcw,
  Calendar,
  Hash,
  ToggleLeft,
  Upload,
  ArrowUp,
  ArrowDown,
  GripVertical,
  BookOpen,
  FolderTree,
  Pencil,
  CornerDownLeft,
  Send
} from 'lucide-react';
import { knowledgeService } from '../services/api';
import { AiBehaviorRule } from '../types';
import { FULL_NAME_HANDOFF_RULE_CATEGORY } from '../../shared/humanHandoffRule';
import {
  DEFAULT_QUOTATION_ROUTING_TEMPLATES,
  isValidOptionalProductPurchaseUrl,
  normalizeProductPurchaseUrl,
  parseQuotationRoutingTemplates,
  PURCHASE_LINK_RULE_CATEGORY,
  QuotationRoutingTemplates,
  serializeQuotationRoutingTemplates,
} from '../../shared/productPurchaseLink';

type ModuleTab = 'categories' | 'products' | 'faqs' | 'ai-behavior';
type ModuleLoadState = 'loading' | 'ready' | 'error';

const KNOWLEDGE_MODULE_TABS: ModuleTab[] = ['categories', 'products', 'faqs', 'ai-behavior'];

interface KnowledgeBaseEditorProps {
  knowledgeBase?: any;
  onSave?: (updated: any) => void;
}

export const KnowledgeBaseEditor: React.FC<KnowledgeBaseEditorProps> = () => {
  const [activeTab, setActiveTab] = useState<ModuleTab>('products');
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Goftino Chat Simulator state
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    sender: 'user' | 'ai';
    text: string;
    timestamp: string;
    knowledgeUsedData?: {
      intentDetected: string;
      knowledgeUsed: Array<{ type: string; title: string }>;
      appliedRules: Array<{ title: string; enforcement: string; directive: string }>;
      details?: any;
    };
  }>>([
    {
      id: 'msg-welcome-1',
      sender: 'ai',
      text: 'سلام! 👋 به پشتیبانی آنلاین بیمه جم خوش آمدید. من دستیار هوشمند بیمه جم هستم. چطور می‌توانم در استعلام قیمت، شرایط اقساط یا صدور آنلاین به شما کمک کنم؟',
      timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [expandedKnowledgeMap, setExpandedKnowledgeMap] = useState<{ [msgId: string]: boolean }>({});
  const [expandedDevDetailsMap, setExpandedDevDetailsMap] = useState<{ [msgId: string]: boolean }>({});
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Modals visibility state
  const [showArticleModal, setShowArticleModal] = useState<boolean>(false);
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [showFaqModal, setShowFaqModal] = useState<boolean>(false);

  // Product Modal Tab & Quotation Form State
  const [productModalTab, setProductModalTab] = useState<'info' | 'quotation'>('info');
  const [productQuestions, setProductQuestions] = useState<any[]>([]);
  const [showQuestionModal, setShowQuestionModal] = useState<boolean>(false);
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);

  const [questionForm, setQuestionForm] = useState<{
    title: string;
    aiQuestion: string;
    fieldName: string;
    type: string;
    required: boolean;
    validationRule: string;
    placeholder: string;
    helpText: string;
    order: number;
    minVal: string;
    maxVal: string;
    minLength: string;
    maxLength: string;
    optionsList: string[];
    newOptionText: string;
    editingOptionIndex: number | null;
    editingOptionText: string;
  }>({
    title: '',
    aiQuestion: '',
    fieldName: '',
    type: 'text',
    required: true,
    validationRule: '',
    placeholder: '',
    helpText: '',
    order: 1,
    minVal: '',
    maxVal: '',
    minLength: '',
    maxLength: '',
    optionsList: [],
    newOptionText: '',
    editingOptionIndex: null,
    editingOptionText: '',
  });

  const [draggedQuestionIndex, setDraggedQuestionIndex] = useState<number | null>(null);

  // Quotation Session Simulation State
  const [simAnswers, setSimAnswers] = useState<{ [key: string]: any }>({});
  const [simCurrentInput, setSimCurrentInput] = useState<string>('');

  // Edit target state
  const [editingItem, setEditingItem] = useState<any | null>(null);

  // Data Collections
  const [products, setProducts] = useState<any[]>([]);
  const [insuranceCategories, setInsuranceCategories] = useState<any[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
  const [showSubCategoryModal, setShowSubCategoryModal] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [editingSubCategory, setEditingSubCategory] = useState<any | null>(null);
  const [selectedCategoryForSub, setSelectedCategoryForSub] = useState<any | null>(null);

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    slug: '',
    description: '',
    status: 'ACTIVE',
    sortOrder: 0,
    aiKnowledgeArticle: '',
    aiRules: '',
  });

  const [subCategoryForm, setSubCategoryForm] = useState({
    categoryId: '',
    name: '',
    slug: '',
    description: '',
    status: 'ACTIVE',
    sortOrder: 0,
  });

  const [faqs, setFaqs] = useState<any[]>([]);

  // Form states
  const [articleForm, setArticleForm] = useState({
    title: '',
    content: '',
    category: 'خودرو',
    tags: '',
    status: 'PUBLISHED',
  });

  const [productForm, setProductForm] = useState({
    name: '',
    category: '',
    categoryId: '',
    subCategoryId: '',
    description: '',
    coverage: '',
    purchaseConditions: '',
    purchaseUrl: '',
    exclusions: '',
    aiKnowledgeArticle: '',
    aiRules: '',
    status: 'ACTIVE',
  });

  const [faqForm, setFaqForm] = useState({
    question: '',
    answer: '',
    insuranceType: 'عمومی',
    keywords: '',
    status: 'APPROVED',
  });

  const [aiBehaviorRules, setAiBehaviorRules] = useState<AiBehaviorRule[]>([]);
  const [moduleLoadState, setModuleLoadState] = useState<Record<ModuleTab, ModuleLoadState>>({
    categories: 'loading',
    products: 'loading',
    faqs: 'loading',
    'ai-behavior': 'loading',
  });
  const loadedModulesRef = useRef<Set<ModuleTab>>(new Set());
  const inFlightModulesRef = useRef<Map<ModuleTab, Promise<void>>>(new Map());
  const [showBehaviorModal, setShowBehaviorModal] = useState<boolean>(false);
  const [editingBehaviorRule, setEditingBehaviorRule] = useState<AiBehaviorRule | null>(null);
  const [behaviorForm, setBehaviorForm] = useState<{
    title: string;
    directive: string;
    status: 'ACTIVE' | 'INACTIVE';
    sortOrder: number;
    routingTemplates: QuotationRoutingTemplates | null;
  }>({
    title: '',
    directive: '',
    status: 'ACTIVE',
    sortOrder: 0,
    routingTemplates: null,
  });
  const [draggedBehaviorIndex, setDraggedBehaviorIndex] = useState<number | null>(null);

  const fetchModuleData = async (tab: ModuleTab): Promise<void> => {
    let response: unknown;
    if (tab === 'categories') response = await knowledgeService.getInsuranceCategories();
    else if (tab === 'products') response = await knowledgeService.getProducts();
    else if (tab === 'faqs') response = await knowledgeService.getFaqs();
    else response = await knowledgeService.getAiBehavior();

    const payload = response as { success?: boolean; data?: unknown };
    if (!payload.success || !Array.isArray(payload.data)) throw new Error(`Invalid ${tab} response`);
    if (tab === 'categories') setInsuranceCategories(payload.data);
    else if (tab === 'products') setProducts(payload.data);
    else if (tab === 'faqs') setFaqs(payload.data);
    else setAiBehaviorRules(payload.data as AiBehaviorRule[]);
  };

  const loadModule = (tab: ModuleTab, force = false): Promise<void> => {
    const existing = inFlightModulesRef.current.get(tab);
    if (existing) return existing;
    if (!force && loadedModulesRef.current.has(tab)) return Promise.resolve();

    setModuleLoadState((current) => ({ ...current, [tab]: 'loading' }));
    const request = fetchModuleData(tab)
      .then(() => {
        loadedModulesRef.current.add(tab);
        setModuleLoadState((current) => ({ ...current, [tab]: 'ready' }));
      })
      .catch((err) => {
        loadedModulesRef.current.delete(tab);
        setModuleLoadState((current) => ({ ...current, [tab]: 'error' }));
        console.error(`Failed to load knowledge module ${tab}:`, err);
      })
      .finally(() => {
        inFlightModulesRef.current.delete(tab);
      });
    inFlightModulesRef.current.set(tab, request);
    return request;
  };

  const loadAllModules = async (force = false): Promise<void> => {
    await Promise.all(KNOWLEDGE_MODULE_TABS.map((tab) => loadModule(tab, force)));
  };

  const loadTabContent = (): Promise<void> => loadModule(activeTab, true);

  useEffect(() => {
    void loadAllModules();
  }, []);

  useEffect(() => {
    void loadModule(activeTab);
  }, [activeTab]);

  // --- Handlers for Dynamic AI Behavior Rules ---
  const handleOpenCreateBehaviorModal = () => {
    setEditingBehaviorRule(null);
    setBehaviorForm({ title: '', directive: '', status: 'ACTIVE', sortOrder: aiBehaviorRules.length + 1, routingTemplates: null });
    setShowBehaviorModal(true);
  };

  const handleOpenEditBehaviorModal = (rule: AiBehaviorRule) => {
    setEditingBehaviorRule(rule);
    setBehaviorForm({
      title: rule.title,
      directive: rule.directive,
      status: rule.status,
      sortOrder: rule.sortOrder,
      routingTemplates: rule.category === PURCHASE_LINK_RULE_CATEGORY
        ? parseQuotationRoutingTemplates(rule.directive) || DEFAULT_QUOTATION_ROUTING_TEMPLATES
        : null,
    });
    setShowBehaviorModal(true);
  };

  const handleSaveBehaviorRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!behaviorForm.title.trim() || !behaviorForm.directive.trim()) {
      alert('لطفاً عنوان و متن دستورالعمل قانون را وارد نمایید.');
      return;
    }
    setLoading(true);
    try {
      if (editingBehaviorRule) {
        await knowledgeService.updateAiBehavior(editingBehaviorRule.id, {
          title: behaviorForm.title,
          directive: behaviorForm.routingTemplates
            ? serializeQuotationRoutingTemplates(behaviorForm.routingTemplates)
            : behaviorForm.directive,
          status: behaviorForm.status,
          sortOrder: behaviorForm.sortOrder,
        });
      } else {
        await knowledgeService.createAiBehavior({
          title: behaviorForm.title,
          directive: behaviorForm.directive,
          status: behaviorForm.status,
          sortOrder: behaviorForm.sortOrder,
        });
      }
      setShowBehaviorModal(false);
      setEditingBehaviorRule(null);
      setBehaviorForm({ title: '', directive: '', status: 'ACTIVE', sortOrder: 0, routingTemplates: null });
      await loadTabContent();
    } catch (err: any) {
      alert('خطا در ذخیره‌سازی قانون رفتار: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBehaviorStatus = async (rule: AiBehaviorRule) => {
    const nextStatus = rule.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setAiBehaviorRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, status: nextStatus } : r))
    );
    try {
      await knowledgeService.updateAiBehavior(rule.id, { status: nextStatus });
    } catch (err: any) {
      alert('خطا در ویرایش وضعیت: ' + err.message);
      await loadTabContent();
    }
  };

  const handleDeleteBehaviorRule = async (id: string) => {
    if (!confirm('آیا از حذف این قانون رفتار هوش مصنوعی اطمینان دارید؟')) return;
    setLoading(true);
    try {
      await knowledgeService.deleteAiBehavior(id);
      await loadTabContent();
    } catch (err: any) {
      alert('خطا در حذف قانون رفتار: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMoveBehaviorRule = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= aiBehaviorRules.length) return;

    const list = [...aiBehaviorRules];
    const item = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = item;

    const reordered = list.map((r, i) => ({ ...r, sortOrder: i + 1 }));
    setAiBehaviorRules(reordered);

    try {
      await knowledgeService.reorderAiBehavior(reordered.map((r) => r.id));
    } catch (err: any) {
      console.error('Failed to reorder rules:', err);
      await loadTabContent();
    }
  };

  const handleBehaviorDragStart = (e: React.DragEvent, index: number) => {
    setDraggedBehaviorIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleBehaviorDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleBehaviorDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedBehaviorIndex === null || draggedBehaviorIndex === dropIndex) return;

    const list = [...aiBehaviorRules];
    const [moved] = list.splice(draggedBehaviorIndex, 1);
    list.splice(dropIndex, 0, moved);

    const reordered = list.map((r, i) => ({ ...r, sortOrder: i + 1 }));
    setAiBehaviorRules(reordered);
    setDraggedBehaviorIndex(null);

    try {
      await knowledgeService.reorderAiBehavior(reordered.map((r) => r.id));
    } catch (err: any) {
      console.error('Failed to reorder rules:', err);
      await loadTabContent();
    }
  };

  // --- Handlers for Articles ---
  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await knowledgeService.updateArticle(editingItem.id, articleForm);
      } else {
        await knowledgeService.createArticle(articleForm);
      }
      setShowArticleModal(false);
      setEditingItem(null);
      resetArticleForm();
      loadTabContent();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!window.confirm('آیا از حذف این مقاله اطمینان دارید؟')) return;
    try {
      await knowledgeService.deleteArticle(id);
      loadTabContent();
    } catch (err) {
      console.error(err);
    }
  };

  const resetArticleForm = () => {
    setArticleForm({
      title: '',
      content: '',
      category: 'خودرو',
      tags: '',
      status: 'PUBLISHED',
    });
  };

  // --- Handlers for Products ---
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidOptionalProductPurchaseUrl(productForm.purchaseUrl)) {
      window.alert('لینک خرید محصول باید یک آدرس معتبر با http یا https باشد.');
      return;
    }
    try {
      if (editingItem) {
        await knowledgeService.updateProduct(editingItem.id, productForm);
      } else {
        await knowledgeService.createProduct({
          ...productForm,
          slug: productForm.name.toLowerCase().replace(/\s+/g, '-'),
        });
      }
      setShowProductModal(false);
      setEditingItem(null);
      resetProductForm();
      await Promise.all([loadModule('products', true), loadModule('categories', true)]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!window.confirm('آیا از حذف این محصول بیمه‌ای اطمینان دارید؟')) return;
    try {
      await knowledgeService.deleteProduct(id);
      await Promise.all([loadModule('products', true), loadModule('categories', true)]);
    } catch (err) {
      console.error(err);
    }
  };

  const resetProductForm = () => {
    setProductForm({
      name: '',
      category: '',
      categoryId: '',
      subCategoryId: '',
      description: '',
      coverage: '',
      purchaseConditions: '',
      purchaseUrl: '',
      exclusions: '',
      aiKnowledgeArticle: '',
      aiRules: '',
      status: 'ACTIVE',
    });
  };

  const resetQuestionForm = () => {
    setQuestionForm({
      title: '',
      aiQuestion: '',
      fieldName: '',
      type: 'text',
      required: true,
      validationRule: '',
      placeholder: '',
      helpText: '',
      order: (productQuestions?.length || 0) + 1,
      minVal: '',
      maxVal: '',
      minLength: '',
      maxLength: '',
      optionsList: [],
      newOptionText: '',
      editingOptionIndex: null,
      editingOptionText: '',
    });
  };

  const handleOpenProductModal = async (product?: any, tab: 'info' | 'quotation' = 'info') => {
    setEditingItem(product || null);
    setProductModalTab(tab);
    if (product) {
      setProductForm({
        name: product.name || '',
        category: product.category || '',
        categoryId: product.categoryId || product.categoryRef?.id || '',
        subCategoryId: product.subCategoryId || product.subCategoryRef?.id || '',
        description: product.description || '',
        coverage: product.coverage || '',
        purchaseConditions: product.purchaseConditions || '',
        purchaseUrl: product.purchaseUrl || '',
        exclusions: product.exclusions || '',
        aiKnowledgeArticle: product.aiKnowledgeArticle || '',
        aiRules: product.aiRules || '',
        status: product.status || 'ACTIVE',
      });
      try {
        const res = await knowledgeService.getQuotationQuestions(product.id);
        if (res.success && Array.isArray(res.data)) {
          setProductQuestions(res.data);
        } else {
          setProductQuestions(product.quotationQuestions || []);
        }
      } catch {
        setProductQuestions(product.quotationQuestions || []);
      }
    } else {
      resetProductForm();
      setProductQuestions([]);
    }
    setSimAnswers({});
    setShowProductModal(true);
  };

  // --- Options Manager Handlers ---
  const handleAddOption = () => {
    if (!questionForm.newOptionText.trim()) return;
    setQuestionForm((prev) => ({
      ...prev,
      optionsList: [...prev.optionsList, prev.newOptionText.trim()],
      newOptionText: '',
    }));
  };

  const handleRemoveOption = (index: number) => {
    setQuestionForm((prev) => ({
      ...prev,
      optionsList: prev.optionsList.filter((_, i) => i !== index),
    }));
  };

  const handleMoveOption = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questionForm.optionsList.length) return;
    const list = [...questionForm.optionsList];
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;
    setQuestionForm((prev) => ({ ...prev, optionsList: list }));
  };

  // --- Question Reordering Handlers ---
  const handleMoveQuestion = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= productQuestions.length) return;

    const newQuestions = [...productQuestions];
    const temp = newQuestions[index];
    newQuestions[index] = newQuestions[targetIndex];
    newQuestions[targetIndex] = temp;

    const updated = newQuestions.map((q, idx) => ({ ...q, order: idx + 1 }));
    setProductQuestions(updated);

    try {
      await knowledgeService.reorderQuotationQuestions(
        updated.map((q) => ({ id: q.id, order: q.order }))
      );
    } catch (err) {
      console.error('Failed to update question order:', err);
    }
  };

  const handleQuestionDragStart = (e: React.DragEvent, index: number) => {
    setDraggedQuestionIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleQuestionDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleQuestionDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedQuestionIndex === null || draggedQuestionIndex === dropIndex) return;

    const newQuestions = [...productQuestions];
    const item = newQuestions.splice(draggedQuestionIndex, 1)[0];
    newQuestions.splice(dropIndex, 0, item);

    const updated = newQuestions.map((q, idx) => ({ ...q, order: idx + 1 }));
    setProductQuestions(updated);
    setDraggedQuestionIndex(null);

    try {
      await knowledgeService.reorderQuotationQuestions(
        updated.map((q) => ({ id: q.id, order: q.order }))
      );
    } catch (err) {
      console.error('Failed to update question order:', err);
    }
  };

  const openEditQuestionModal = (q: any, idx: number) => {
    setEditingQuestion(q);
    let rawOpts: string[] = [];
    if (Array.isArray(q.options)) {
      rawOpts = q.options;
    } else if (typeof q.options === 'string' && q.options) {
      try {
        const parsed = JSON.parse(q.options);
        if (Array.isArray(parsed)) rawOpts = parsed;
        else rawOpts = q.options.split(',').map((s: string) => s.trim()).filter(Boolean);
      } catch {
        rawOpts = q.options.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    }

    setQuestionForm({
      title: q.title || '',
      aiQuestion: q.aiQuestion || q.title || '',
      fieldName: q.fieldName || '',
      type: q.type || 'text',
      required: q.required !== false,
      validationRule: q.validationRule || '',
      placeholder: q.placeholder || '',
      helpText: q.helpText || '',
      order: q.order || idx + 1,
      minVal: q.minVal !== null && q.minVal !== undefined ? String(q.minVal) : '',
      maxVal: q.maxVal !== null && q.maxVal !== undefined ? String(q.maxVal) : '',
      minLength: q.minLength !== null && q.minLength !== undefined ? String(q.minLength) : '',
      maxLength: q.maxLength !== null && q.maxLength !== undefined ? String(q.maxLength) : '',
      optionsList: rawOpts,
      newOptionText: '',
      editingOptionIndex: null,
      editingOptionText: '',
    });
    setShowQuestionModal(true);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[DEBUG LOG] Step 4: Submit Clicked');

    if (!editingItem?.id) {
      console.log('[DEBUG LOG] Step 4.1: FAILED - editingItem?.id is missing on submit');
      alert('لطفاً ابتدا مشخصات کلی محصول را ذخیره و ایجاد فرمایید.');
      return;
    }

    try {
      let optionsPayload: string[] = [];
      if (['select', 'radio', 'checkbox'].includes(questionForm.type)) {
        optionsPayload = questionForm.optionsList;
      }

      const payload = {
        productId: editingItem.id,
        title: questionForm.title,
        aiQuestion: questionForm.aiQuestion || questionForm.title,
        fieldName: questionForm.fieldName || `field_${Date.now()}`,
        type: questionForm.type,
        required: questionForm.required,
        validationRule: questionForm.validationRule,
        placeholder: questionForm.placeholder,
        helpText: questionForm.helpText,
        order: Number(questionForm.order) || 1,
        options: optionsPayload,
        minVal: questionForm.minVal !== '' ? Number(questionForm.minVal) : null,
        maxVal: questionForm.maxVal !== '' ? Number(questionForm.maxVal) : null,
        minLength: questionForm.minLength !== '' ? Number(questionForm.minLength) : null,
        maxLength: questionForm.maxLength !== '' ? Number(questionForm.maxLength) : null,
      };

      console.log('[DEBUG LOG] Step 5: POST Request Started with payload:', payload);

      let res;
      if (editingQuestion) {
        res = await knowledgeService.updateQuotationQuestion(editingQuestion.id, payload);
      } else {
        res = await knowledgeService.createQuotationQuestion(payload);
      }

      console.log('[DEBUG LOG] Step 6: POST Request Finished. Server response:', res);

      if (res.success || res.status === 200 || res.status === 201) {
        console.log('[DEBUG LOG] Step 7: Database Saved successfully.');
      }

      setShowQuestionModal(false);
      setEditingQuestion(null);
      resetQuestionForm();

      const resQuestions = await knowledgeService.getQuotationQuestions(editingItem.id);
      if (resQuestions.data?.success && Array.isArray(resQuestions.data.data)) {
        setProductQuestions(resQuestions.data.data);
      }
      loadTabContent();

      console.log('[DEBUG LOG] Step 8: UI Updated');
    } catch (err: any) {
      console.error('[DEBUG LOG] ERROR saving quotation question:', err);
      alert('خطا در ذخیره‌سازی سوال: ' + (err.response?.data?.error || err.message || String(err)));
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!window.confirm('آیا از حذف این سوال استعلام قیمت اطمینان دارید؟')) return;
    try {
      await knowledgeService.deleteQuotationQuestion(qId);
      if (editingItem?.id) {
        const res = await knowledgeService.getQuotationQuestions(editingItem.id);
        if (res.success && Array.isArray(res.data)) {
          setProductQuestions(res.data);
        }
      }
      loadTabContent();
    } catch (err) {
      console.error(err);
    }
  };

  // --- Handlers for FAQs ---
  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await knowledgeService.updateFaq(editingItem.id, faqForm);
      } else {
        await knowledgeService.createFaq(faqForm);
      }
      setShowFaqModal(false);
      setEditingItem(null);
      resetFaqForm();
      loadTabContent();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteFaq = async (id: string) => {
    if (!window.confirm('آیا از حذف این پرسش متداول اطمینان دارید؟')) return;
    try {
      await knowledgeService.deleteFaq(id);
      loadTabContent();
    } catch (err) {
      console.error(err);
    }
  };

  const resetFaqForm = () => {
    setFaqForm({
      question: '',
      answer: '',
      insuranceType: 'عمومی',
      keywords: '',
      status: 'APPROVED',
    });
  };

  // Goftino Chat Simulator Handlers
  const handleSendChatMessage = async (presetText?: string) => {
    const query = (presetText || chatInput).trim();
    if (!query || chatLoading) return;

    setChatInput('');
    const userMsgId = 'usr-' + Date.now();
    const timeStr = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

    const newUserMsg = {
      id: userMsgId,
      sender: 'user' as const,
      text: query,
      timestamp: timeStr,
    };

    const updatedMessages = [...chatMessages, newUserMsg];
    setChatMessages(updatedMessages);
    setChatLoading(true);

    const historyPayload = updatedMessages.map(m => ({
      role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.text,
    }));

    try {
      const res = await knowledgeService.testAi(query, historyPayload);

      console.log("===== TEST AI FRONT RESPONSE =====");
      console.log(res);
      console.log("===== END TEST AI FRONT RESPONSE =====");

      const data = res.data || res;

      if (data) {
        const aiMsgId = 'ai-' + Date.now();
        const newAiMsg = {
          id: aiMsgId,
          sender: 'ai' as const,
          text: data.replyText || data.aiResponse || 'متأسفانه پاسخ مناسبی یافت نشد.',
          timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
          knowledgeUsedData: {
            intentDetected: data.intentDetected || 'استعلام عمومی',
            knowledgeUsed: data.knowledgeUsed || [],
            appliedRules: data.appliedRules || [],
            details: data.details,
          },
        };
        setChatMessages(prev => [...prev, newAiMsg]);
      }
    } catch (err) {
      console.error('Goftino Simulator Error:', err);
      const errAiMsg = {
        id: 'err-' + Date.now(),
        sender: 'ai' as const,
        text: 'متأسفانه در دریافت پاسخ از هوش مصنوعی خطایی رخ داد. لطفاً دوباره تلاش فرمايید.',
        timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages(prev => [...prev, errAiMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleResetChat = () => {
    setChatMessages([
      {
        id: 'msg-welcome-1',
        sender: 'ai',
        text: 'سلام! 👋 به پشتیبانی آنلاین بیمه جم خوش آمدید. من دستیار هوشمند بیمه جم هستم. چطور می‌توانم در استعلام قیمت، شرایط اقساط یا صدور آنلاین به شما کمک کنم؟',
        timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setExpandedKnowledgeMap({});
    setExpandedDevDetailsMap({});
  };

  // --- Handlers for Insurance Categories ---

  const handleOpenCategoryModal = (category?: any) => {
    setEditingCategory(category || null);

    if (category) {
      setCategoryForm({
        name: category.name || '',
        slug: category.slug || '',
        description: category.description || '',
        status: category.status || 'ACTIVE',
        sortOrder: category.sortOrder || 0,
        aiKnowledgeArticle: category.aiKnowledgeArticle || '',
        aiRules: category.aiRules || '',
      });
    } else {
      setCategoryForm({
        name: '',
        slug: '',
        description: '',
        status: 'ACTIVE',
        sortOrder: insuranceCategories.length,
        aiKnowledgeArticle: '',
        aiRules: '',
      });
    }

    setShowCategoryModal(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!categoryForm.name.trim()) {
      alert('نام دسته‌بندی را وارد کنید.');
      return;
    }

    try {
      if (editingCategory) {
        await knowledgeService.updateInsuranceCategory(
          editingCategory.id,
          categoryForm
        );
      } else {
        await knowledgeService.createInsuranceCategory(categoryForm);
      }

      setShowCategoryModal(false);
      setEditingCategory(null);

      await loadModule('categories', true);
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.error || 'ذخیره دسته‌بندی انجام نشد.');
    }
  };

  const handleDeleteCategory = async (category: any) => {
    if (category.products?.length > 0) {
      alert('این دسته‌بندی دارای محصول است و قابل حذف نیست.');
      return;
    }

    if (category.subCategories?.length > 0) {
      alert('این دسته‌بندی دارای زیر‌دسته است. ابتدا زیر‌دسته‌ها را حذف کنید.');
      return;
    }

    if (!window.confirm(`آیا از حذف «${category.name}» اطمینان دارید؟`)) {
      return;
    }

    try {
      await knowledgeService.deleteInsuranceCategory(category.id);

      await loadModule('categories', true);
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.error || 'حذف دسته‌بندی انجام نشد.');
    }
  };

  const handleOpenSubCategoryModal = (
    category: any,
    subCategory?: any
  ) => {
    setSelectedCategoryForSub(category);
    setEditingSubCategory(subCategory || null);

    if (subCategory) {
      setSubCategoryForm({
        categoryId: category.id,
        name: subCategory.name || '',
        slug: subCategory.slug || '',
        description: subCategory.description || '',
        status: subCategory.status || 'ACTIVE',
        sortOrder: subCategory.sortOrder || 0,
      });
    } else {
      setSubCategoryForm({
        categoryId: category.id,
        name: '',
        slug: '',
        description: '',
        status: 'ACTIVE',
        sortOrder: category.subCategories?.length || 0,
      });
    }

    setShowSubCategoryModal(true);
  };

  const handleSaveSubCategory = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!subCategoryForm.categoryId || !subCategoryForm.name.trim()) {
      alert('نام زیر‌دسته را وارد کنید.');
      return;
    }

    try {
      if (editingSubCategory) {
        await knowledgeService.updateInsuranceSubCategory(
          editingSubCategory.id,
          subCategoryForm
        );
      } else {
        await knowledgeService.createInsuranceSubCategory(
          subCategoryForm
        );
      }

      setShowSubCategoryModal(false);
      setEditingSubCategory(null);
      setSelectedCategoryForSub(null);

      await loadModule('categories', true);
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.error || 'ذخیره زیر‌دسته انجام نشد.');
    }
  };

  const handleDeleteSubCategory = async (
    category: any,
    subCategory: any
  ) => {
    if (subCategory.products?.length > 0) {
      alert('این زیر‌دسته دارای محصول است و قابل حذف نیست.');
      return;
    }

    if (
      !window.confirm(
        `آیا از حذف «${subCategory.name}» اطمینان دارید؟`
      )
    ) {
      return;
    }

    try {
      await knowledgeService.deleteInsuranceSubCategory(
        subCategory.id
      );

      await loadModule('categories', true);
    } catch (err: any) {
      console.error(err);
      alert(
        err?.response?.data?.error ||
          'حذف زیر‌دسته انجام نشد.'
      );
    }
  };

  return (
    <div className="space-y-6 font-['Vazirmatn',sans-serif]">
      
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              مرکز آموزش و کنترل هوش مصنوعی
              <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
                مرجع یگانه مدیریت AI
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              تنها محل مدیریت دانش بیمه‌ای، قوانین رفتاری و تست زنده پاسخگویی دستیار هوشمند بیمه جم
            </p>
          </div>
        </div>

        <button
          onClick={() => void loadAllModules(true)}
          disabled={loading || Object.values(moduleLoadState).some((state) => state === 'loading')}
          className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${Object.values(moduleLoadState).some((state) => state === 'loading') ? 'animate-spin' : ''}`} />
          بروزرسانی اطلاعات
        </button>
      </div>

      {/* ========================================================= */}
      {/* GOFTINO CHAT SIMULATOR (شبیه‌ساز چت گفتینو بیمه جم) */}
      {/* ========================================================= */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden space-y-0">
        
        {/* Goftino Header */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white p-3.5 px-5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-amber-300 shadow-inner">
                <MessageSquare className="w-5 h-5 text-amber-400" />
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-indigo-900 rounded-full animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  شبیه‌ساز چت گفتینو (Goftino Chat Simulator)
                </h2>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-semibold">
                  آنلاین | حافظه فعال
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                محیط شبیه‌سازی دقیق ویجت گفتینو بیمه جم جهت تست پیوسته مکالمات مشتریان
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetChat}
            className="text-xs font-semibold bg-indigo-950/60 hover:bg-indigo-900 text-indigo-200 hover:text-white px-3 py-1.5 rounded-xl border border-indigo-700/50 transition-all flex items-center gap-1.5 cursor-pointer"
            title="شروع مجدد گفتگو و پاکسازی حافظه فعلی"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>شروع گفت‌وگوی جدید</span>
          </button>
        </div>

        {/* Chat Messages Body */}
        <div className="bg-slate-900/95 p-4 space-y-3 min-h-[280px] max-h-[400px] overflow-y-auto border-b border-slate-800">
          {chatMessages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isKnowledgeExpanded = !!expandedKnowledgeMap[msg.id];
            const isDevExpanded = !!expandedDevDetailsMap[msg.id];

            return (
              <div key={msg.id} className={`flex flex-col ${isUser ? 'items-start' : 'items-end'} space-y-1`}>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 px-1">
                  <span className="font-semibold">{isUser ? 'مشتری (خریدار)' : 'دستیار هوشمند بیمه جم'}</span>
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </div>

                <div
                  className={`max-w-[85%] md:max-w-[78%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-sm ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-none font-medium'
                      : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/80'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {/* Knowledge Used Section (Collapsible - Collapsed by default) */}
                  {!isUser && msg.knowledgeUsedData && (
                    <div className="mt-3 pt-2.5 border-t border-slate-700/60">
                      <button
                        type="button"
                        onClick={() => setExpandedKnowledgeMap(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                        className="text-[11px] font-bold text-indigo-300 hover:text-white bg-indigo-950/80 hover:bg-indigo-900/90 border border-indigo-700/60 px-2.5 py-1 rounded-lg flex items-center justify-between w-full transition-all cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Knowledge Used</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({msg.knowledgeUsedData.knowledgeUsed?.length || 0} منبع)
                          </span>
                        </span>
                        {isKnowledgeExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {/* Collapsed by default - when expanded shows Intent, Knowledge Articles, FAQ, AI Rules */}
                      {isKnowledgeExpanded && (
                        <div className="mt-2.5 p-3 rounded-xl bg-slate-900 border border-slate-700/70 space-y-2 text-xs text-right dir-rtl animate-fade-in">
                          
                          {/* Intent */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 block">نیت (Intent):</span>
                            <p className="text-xs font-bold text-amber-300 bg-slate-950 p-2 rounded-lg border border-slate-800">
                              {msg.knowledgeUsedData.intentDetected}
                            </p>
                          </div>

                          {/* Knowledge Articles */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 block">مقالات و پایگاه دانش (Knowledge Articles):</span>
                            <div className="flex flex-wrap gap-1">
                              {msg.knowledgeUsedData.knowledgeUsed?.length > 0 ? (
                                msg.knowledgeUsedData.knowledgeUsed.map((k, idx) => (
                                  <span key={idx} className="text-[10px] bg-blue-900/40 text-blue-200 border border-blue-700/50 px-2 py-0.5 rounded-md font-semibold">
                                    {k.type}: {k.title}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-500">منبع خاصی فراخوانی نشد.</span>
                              )}
                            </div>
                          </div>

                          {/* FAQ */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 block">پرسش‌های متداول (FAQ):</span>
                            <div className="flex flex-wrap gap-1">
                              {msg.knowledgeUsedData.knowledgeUsed?.filter(k => k.type === 'پرسش متداول').length > 0 ? (
                                msg.knowledgeUsedData.knowledgeUsed.filter(k => k.type === 'پرسش متداول').map((f, idx) => (
                                  <span key={idx} className="text-[10px] bg-amber-900/40 text-amber-200 border border-amber-700/50 px-2 py-0.5 rounded-md font-semibold">
                                    {f.title}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-500">پرسش متناظری ثبت نشده است.</span>
                              )}
                            </div>
                          </div>

                          {/* AI Rules */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 block">قوانین هوش مصنوعی (AI Rules):</span>
                            <div className="flex flex-wrap gap-1">
                              {msg.knowledgeUsedData.appliedRules?.length > 0 ? (
                                msg.knowledgeUsedData.appliedRules.map((r, idx) => (
                                  <span key={idx} className="text-[10px] bg-emerald-900/40 text-emerald-200 border border-emerald-700/50 px-2 py-0.5 rounded-md font-semibold">
                                    {r.title} ({r.enforcement})
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-500">قانون خاصی اعمال نگردید.</span>
                              )}
                            </div>
                          </div>

                          {/* Nested Trigger for Developer Details (Collapsed by default) */}
                          <div className="pt-2 border-t border-slate-800 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setExpandedDevDetailsMap(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                              className="text-[10px] font-bold text-indigo-300 hover:text-white flex items-center gap-1 bg-slate-950 hover:bg-slate-800 px-2 py-1 rounded border border-slate-800 transition-all cursor-pointer"
                            >
                              <Terminal className="w-3 h-3 text-indigo-400" />
                              <span>Developer Details (جزئیات توسعه‌دهنده)</span>
                              {isDevExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>

                          {/* Developer Details Content */}
                          {isDevExpanded && msg.knowledgeUsedData.details && (
                            <div className="mt-2 p-3 bg-slate-950 text-slate-300 rounded-lg text-[10px] font-mono dir-ltr text-left space-y-2 border border-slate-800">
                              <div>
                                <span className="text-amber-400 font-bold block">1. Injected Prompt & Conversation History:</span>
                                <pre className="whitespace-pre-wrap text-slate-300 max-h-24 overflow-y-auto bg-slate-900 p-1.5 rounded">
                                  {msg.knowledgeUsedData.details.prompt}
                                </pre>
                              </div>
                              <div>
                                <span className="text-emerald-400 font-bold block">2. System Directives & Rules:</span>
                                <pre className="whitespace-pre-wrap text-slate-300 max-h-24 overflow-y-auto bg-slate-900 p-1.5 rounded">
                                  {msg.knowledgeUsedData.details.finalPrompt}
                                </pre>
                              </div>
                              <div>
                                <span className="text-blue-400 font-bold block">3. Safety & Policy Validation:</span>
                                <div className="bg-slate-900 p-1.5 rounded text-emerald-300">
                                  {msg.knowledgeUsedData.details.validationResult}
                                </div>
                              </div>
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {chatLoading && (
            <div className="flex flex-col items-end space-y-1 animate-fade-in">
              <div className="text-[10px] text-slate-400 px-1">دستیار بیمه جم در حال نگارش پاسخ...</div>
              <div className="bg-slate-800 border border-slate-700/80 rounded-2xl rounded-tl-none px-4 py-3 text-xs text-slate-300 flex items-center gap-2 shadow-sm">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span className="font-semibold text-[11px]">در حال بررسی دانش و تنظیم پاسخ...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-slate-900 space-y-2">
          {/* Quick Preset Suggestion Chips */}
          <div className="flex items-center gap-1.5 text-[11px] overflow-x-auto pb-1">
            <span className="text-slate-400 font-medium shrink-0">نمونه سوال مشتری:</span>
            {[
              'بیمه شخص ثالث اقساطی دارین؟',
              'بیمه مسئولیت آسانسور به چه مدارکی نیاز داره؟',
              'قیمت بیمه آتش‌سوزی چقدره؟',
              'آیا بدون چک هم میشه بیمه خرید؟'
            ].map((chip, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSendChatMessage(chip)}
                className="bg-indigo-950/70 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/50 px-2.5 py-1 rounded-lg shrink-0 transition-all font-medium text-[11px] cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input & Send Button */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChatMessage();
                }
              }}
              placeholder="پیام خود را بنویسید (مانند مشتری واقعی در ویجت گفتینو)..."
              className="flex-1 bg-slate-950 border border-indigo-500/40 focus:border-indigo-400 text-white placeholder-slate-400 px-4 py-2.5 rounded-xl text-xs focus:outline-none transition-all"
            />

            <button
              type="button"
              onClick={() => handleSendChatMessage()}
              disabled={chatLoading || !chatInput.trim()}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 shrink-0 disabled:cursor-not-allowed cursor-pointer"
            >
              <Send className="w-4 h-4 rotate-180" />
              <span>ارسال</span>
            </button>
          </div>
        </div>

      </div>

      {/* Navigation Modules Bar */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setActiveTab('categories'); setSearchQuery(''); }}
          className={`flex-1 min-w-[150px] py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'categories'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FolderTree className="w-4 h-4" />
          ۱. دسته‌بندی بیمه
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
            activeTab === 'categories'
              ? 'bg-white/20 text-white'
              : 'bg-slate-200 text-slate-700'
          }`}>
            {moduleLoadState.categories === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" aria-label="در حال بارگذاری تعداد دسته‌ها" /> : moduleLoadState.categories === 'ready' ? insuranceCategories.length : '—'}
          </span>
        </button>
        <button
          onClick={() => { setActiveTab('products'); setSearchQuery(''); }}
          className={`flex-1 min-w-[150px] py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'products'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Shield className="w-4 h-4" />
          ۲. محصولات بیمه‌ای
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${activeTab === 'products' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
            {moduleLoadState.products === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" aria-label="در حال بارگذاری تعداد محصولات" /> : moduleLoadState.products === 'ready' ? products.length : '—'}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('faqs'); setSearchQuery(''); }}
          className={`flex-1 min-w-[150px] py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'faqs'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          ۳. پرسش‌های متداول (FAQ)
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${activeTab === 'faqs' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
            {moduleLoadState.faqs === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" aria-label="در حال بارگذاری تعداد پرسش‌ها" /> : moduleLoadState.faqs === 'ready' ? faqs.length : '—'}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('ai-behavior'); setSearchQuery(''); }}
          className={`flex-1 min-w-[150px] py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'ai-behavior'
              ? 'bg-amber-600 text-white shadow-md'
              : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          ۴. قوانین رفتار AI (Behavior)
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${activeTab === 'ai-behavior' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
            {moduleLoadState['ai-behavior'] === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" aria-label="در حال بارگذاری تعداد قوانین" /> : moduleLoadState['ai-behavior'] === 'ready' ? aiBehaviorRules.length : '—'}
          </span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* MODULE 1: INSURANCE CATEGORIES */}
      {/* ========================================================= */}
      {activeTab === 'categories' && (
        <div className="space-y-4">

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                دسته‌بندی و زیر‌دسته‌های بیمه
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                ساختار رشته‌های بیمه را مدیریت کنید و محصولات را در جایگاه مناسب قرار دهید.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleOpenCategoryModal()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all"
            >
              <Plus className="w-4 h-4" />
              افزودن دسته
            </button>
          </div>

          {insuranceCategories.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              <FolderTree className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-600">
                هنوز دسته‌ای ایجاد نشده است.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                اولین دسته بیمه را ایجاد کنید.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {insuranceCategories.map((category) => (
                <div
                  key={category.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
                >
                  <div className="p-4 flex items-center justify-between gap-4 bg-slate-50/70">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                        <Shield className="w-5 h-5" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-800 truncate">
                            {category.name}
                          </h3>

                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                            category.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}>
                            {category.status === 'ACTIVE' ? 'فعال' : 'غیرفعال'}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-400 mt-1">
                          {category.subCategories?.length || 0} زیر‌دسته
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenSubCategoryModal(category)}
                        className="px-3 py-2 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-bold hover:bg-indigo-100"
                      >
                        + زیر‌دسته
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenCategoryModal(category)}
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-200"
                        title="ویرایش دسته"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(category)}
                        disabled={
                          (category.products?.length || 0) > 0 ||
                          (category.subCategories?.length || 0) > 0
                        }
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={
                          (category.products?.length || 0) > 0
                            ? 'این دسته دارای محصول است'
                            : (category.subCategories?.length || 0) > 0
                              ? 'ابتدا زیر‌دسته‌ها را حذف کنید'
                              : 'حذف دسته'
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {category.subCategories?.length > 0 && (
                    <div className="p-3 space-y-2">
                      {category.subCategories.map((sub: any) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
                              <CornerDownLeft className="w-3.5 h-3.5" />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-700 truncate">
                                  {sub.name}
                                </span>

                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                                  sub.status === 'ACTIVE'
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {sub.status === 'ACTIVE' ? 'فعال' : 'غیرفعال'}
                                </span>
                              </div>

                              <span className="text-[10px] text-slate-400">
                                {sub.products?.length || 0} محصول
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenSubCategoryModal(category, sub)}
                              className="p-2 rounded-lg text-slate-500 hover:bg-slate-200"
                              title="ویرایش زیر‌دسته"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteSubCategory(category, sub)}
                              disabled={(sub.products?.length || 0) > 0}
                              className="p-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={
                                (sub.products?.length || 0) > 0
                                  ? 'این زیر‌دسته دارای محصول است'
                                  : 'حذف زیر‌دسته'
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODULE 2: INSURANCE PRODUCTS */}
      {/* ========================================================= */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-slate-500 font-medium">
              محصولات بیمه‌ای و شرایط اختصاصی جهت پاسخ‌دهی هوشمند و استعلام دقیق
            </p>

            <button
              onClick={() => handleOpenProductModal(null, 'info')}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              تعریف محصول بیمه‌ای جدید
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {products.map((product) => {
              const qCount = product.quotationQuestions?.length || 0;
              return (
                <div key={product.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4 hover:border-indigo-300 transition-all">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                        <Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-sm">{product.name}</h3>
                          <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-slate-200">
                            {product.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{product.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenProductModal(product, 'quotation')}
                        className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <ListChecks className="w-3.5 h-3.5 text-indigo-600" />
                        <span>استعلام قیمت ({qCount} سوال)</span>
                      </button>

                      <button
                        onClick={() => handleOpenProductModal(product, 'info')}
                        className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="ویرایش مشخصات محصول"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="حذف محصول"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {/* Coverage */}
                    <div className="bg-emerald-50/60 border border-emerald-200 p-3 rounded-xl space-y-1">
                      <span className="font-bold text-emerald-900 text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        پوشش‌های بیمه‌نامه:
                      </span>
                      <p className="text-emerald-950 text-[11px] leading-relaxed">{product.coverage || 'ثبت نشده'}</p>
                    </div>

                    {/* Conditions */}
                    <div className="bg-indigo-50/60 border border-indigo-200 p-3 rounded-xl space-y-1">
                      <span className="font-bold text-indigo-900 text-[11px] flex items-center gap-1">
                        <Info className="w-3.5 h-3.5 text-indigo-600" />
                        شرایط صدور و خرید:
                      </span>
                      <p className="text-indigo-950 text-[11px] leading-relaxed">{product.purchaseConditions || 'ثبت نشده'}</p>
                    </div>

                    {/* Exclusions */}
                    <div className="bg-rose-50/60 border border-rose-200 p-3 rounded-xl space-y-1">
                      <span className="font-bold text-rose-900 text-[11px] flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        استثنائات بیمه‌نامه:
                      </span>
                      <p className="text-rose-950 text-[11px] leading-relaxed">{product.exclusions || 'ثبت نشده'}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODULE 3: FAQ */}
      {/* ========================================================= */}
      {activeTab === 'faqs' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="جستجو در پرسش‌ها و پاسخ‌های متداول..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-9 pl-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={() => {
                setEditingItem(null);
                resetFaqForm();
                setShowFaqModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              افزودن پرسش و پاسخ جدید
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {faqs
              .filter(f => !searchQuery || f.question.includes(searchQuery) || f.answer.includes(searchQuery))
              .map((faq) => (
                <div key={faq.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3 hover:border-indigo-300 transition-all flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 leading-snug">
                        <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                        {faq.question}
                      </h3>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                      <span className="text-[10px] font-bold text-indigo-700 block">پاسخ ایده آل هوش مصنوعی:</span>
                      <p className="text-xs text-slate-700 leading-relaxed">{faq.answer}</p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2.5 py-0.5 rounded-md">
                      {faq.insuranceType}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingItem(faq);
                          setFaqForm({
                            question: faq.question,
                            answer: faq.answer,
                            insuranceType: faq.insuranceType,
                            keywords: faq.keywords || '',
                            status: faq.status,
                          });
                          setShowFaqModal(true);
                        }}
                        className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteFaq(faq.id)}
                        className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODULE 4: AI BEHAVIOR RULES (قوانین رفتار هوش مصنوعی) */}
      {/* ========================================================= */}
      {activeTab === 'ai-behavior' && (
        <div className="space-y-6">
          {/* Top Banner Card */}
          <div className="bg-gradient-to-r from-amber-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-md border border-amber-500/30 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-amber-400" />
                <h3 className="text-base font-bold text-white">مدیریت پویا و متمرکز رفتار هوش مصنوعی (AI Behavior)</h3>
                <span className="bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                  SINGLE SOURCE OF TRUTH
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                تمامی قوانین فعال به ترتیب اولویت تعیین‌شده توسط شما اعمال می‌شوند. قوانین سیستمی متصل به runtime قابل فعال/غیرفعال‌کردن هستند و قوانین سفارشی را می‌توانید ایجاد، ویرایش، حذف یا جابه‌جا کنید.
              </p>
            </div>

            <button
              onClick={handleOpenCreateBehaviorModal}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن قانون رفتاری جدید</span>
            </button>
          </div>

          {/* Search & Info Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو در عنوان یا متن قوانین رفتار..."
                className="w-full text-xs pr-9 pl-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                فعال: {aiBehaviorRules.filter((r) => r.status === 'ACTIVE').length}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                غیرفعال: {aiBehaviorRules.filter((r) => r.status === 'INACTIVE').length}
              </span>
              <span className="text-slate-300">|</span>
              <span>کل قوانین: {aiBehaviorRules.length}</span>
            </div>
          </div>

          {/* Dynamic Rules List */}
          {aiBehaviorRules.filter((r) =>
            r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.directive.toLowerCase().includes(searchQuery.toLowerCase())
          ).length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">هیچ قانون رفتاری یافت نشد</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                شما می‌توانید قانون رفتاری جدیدی برای کنترل دقیق هوش مصنوعی اضافه کنید.
              </p>
              <button
                onClick={handleOpenCreateBehaviorModal}
                className="px-4 py-2 bg-amber-500 text-slate-950 font-bold text-xs rounded-xl hover:bg-amber-400 inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن اولین قانون رفتار</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {aiBehaviorRules
                .filter((r) =>
                  r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  r.directive.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((rule, idx) => {
                  const isActive = rule.status === 'ACTIVE';
                  const isFullNameHandoffRule = rule.category === FULL_NAME_HANDOFF_RULE_CATEGORY;
                  const isQuotationRoutingRule = rule.category === PURCHASE_LINK_RULE_CATEGORY;
                  const isFirst = idx === 0;
                  const isLast = idx === aiBehaviorRules.length - 1;

                  return (
                    <div
                      key={rule.id}
                      draggable
                      onDragStart={(e) => handleBehaviorDragStart(e, idx)}
                      onDragOver={handleBehaviorDragOver}
                      onDrop={(e) => handleBehaviorDrop(e, idx)}
                      className={`bg-white rounded-2xl border transition-all p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                        isActive
                          ? 'border-slate-200 hover:border-amber-400 shadow-2xs'
                          : 'border-slate-200 bg-slate-50/50 opacity-75'
                      } ${draggedBehaviorIndex === idx ? 'opacity-40 border-dashed border-amber-500' : ''}`}
                    >
                      {/* Drag Handle & Order Badge & Title & Content */}
                      <div className="flex items-start gap-3 flex-1">
                        {/* Drag Handle */}
                        <div
                          title="برای تغییر ترتیب درگ کنید"
                          className="cursor-grab active:cursor-grabbing p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors mt-0.5"
                        >
                          <GripVertical className="w-5 h-5" />
                        </div>

                        {/* Order Number Badge */}
                        <span className="w-7 h-7 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          #{idx + 1}
                        </span>

                        {/* Text Content */}
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-slate-900 text-sm">{rule.title}</h4>
                            {(isFullNameHandoffRule || isQuotationRoutingRule) && (
                              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                متصل به مسیر واقعی گفتینو
                              </span>
                            )}

                            {/* Status Badge */}
                            <button
                              onClick={() => handleToggleBehaviorStatus(rule)}
                              className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                              }`}
                              title="کلیک کنید برای تغییر وضعیت فعال/غیرفعال"
                            >
                              {isActive ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>فعال در AI</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3 h-3 text-slate-500" />
                                  <span>غیرفعال</span>
                                </>
                              )}
                            </button>
                          </div>

                          <p className="text-xs text-slate-600 leading-relaxed font-sans bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                            {isQuotationRoutingRule
                              ? 'متن هدایت فرم همین صفحه، لینک صفحهٔ دیگر، انتظار انتخاب و شروع استعلام چتی از این قانون خوانده می‌شود.'
                              : rule.directive}
                          </p>
                        </div>
                      </div>

                      {/* Controls (Move Up, Move Down, Toggle Switch, Edit, Delete) */}
                      <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center border-t md:border-t-0 pt-2 md:pt-0 w-full md:w-auto justify-end">
                        {/* Up / Down Order Buttons */}
                        <button
                          onClick={() => handleMoveBehaviorRule(idx, 'up')}
                          disabled={isFirst}
                          title="انتقال به یک پله بالاتر"
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMoveBehaviorRule(idx, 'down')}
                          disabled={isLast}
                          title="انتقال به یک پله پایین‌تر"
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>

                        <span className="h-4 w-[1px] bg-slate-200 mx-1"></span>

                        {/* Toggle Status Switch */}
                        <button
                          onClick={() => handleToggleBehaviorStatus(rule)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                          }`}
                        >
                          {isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                        </button>

                        {/* Edit Button */}
                        {!isFullNameHandoffRule && <button
                          onClick={() => handleOpenEditBehaviorModal(rule)}
                          className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                          title="ویرایش قانون"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>}

                        {/* Delete Button */}
                        {!isFullNameHandoffRule && !isQuotationRoutingRule && <button
                          onClick={() => handleDeleteBehaviorRule(rule.id)}
                          className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                          title="حذف قانون"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODALS FOR CREATING & EDITING ITEMS */}
      {/* ========================================================= */}

      {/* 1. Article Modal */}
      {showArticleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                {editingItem ? 'ویرایش مقاله دانش' : 'ایجاد مقاله جدید'}
              </h3>
              <button onClick={() => setShowArticleModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveArticle} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">عنوان مقاله:</label>
                <input
                  type="text"
                  required
                  value={articleForm.title}
                  onChange={(e) => setArticleForm({ ...articleForm, title: e.target.value })}
                  placeholder="مثلاً: راهنمای تخفیف‌های بیمه شخص ثالث"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">دسته‌بندی:</label>
                  <select
                    value={articleForm.category}
                    onChange={(e) => setArticleForm({ ...articleForm, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="خودرو">خودرو</option>
                    <option value="اموال">اموال</option>
                    <option value="مسئولیت">مسئولیت</option>
                    <option value="درمان">درمان</option>
                    <option value="عمومی">عمومی</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">وضعیت انتشار:</label>
                  <select
                    value={articleForm.status}
                    onChange={(e) => setArticleForm({ ...articleForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="PUBLISHED">منتشر شده (Published)</option>
                    <option value="DRAFT">پیش‌نویس (Draft)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">تگ‌ها (جداشده با کاما):</label>
                <input
                  type="text"
                  value={articleForm.tags}
                  onChange={(e) => setArticleForm({ ...articleForm, tags: e.target.value })}
                  placeholder="مثلاً: ثالث, تخفیف, راهنما"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">متن اصلی مقاله:</label>
                <textarea
                  rows={5}
                  required
                  value={articleForm.content}
                  onChange={(e) => setArticleForm({ ...articleForm, content: e.target.value })}
                  placeholder="محتوای آموزشی کامل که AI از آن استفاده خواهد کرد..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
                ></textarea>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowArticleModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  ذخیره مقاله
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Product Modal */}
      {/* CATEGORY MODAL */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">

            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {editingCategory ? 'ویرایش دسته بیمه' : 'افزودن دسته بیمه'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  دسته اصلی محصولات بیمه‌ای را تعریف کنید.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowCategoryModal(false);
                  setEditingCategory(null);
                }}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-5 space-y-4">

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  نام دسته *
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      name: e.target.value,
                    })
                  }
                  placeholder="مثلاً مسئولیت"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Slug
                </label>
                <input
                  type="text"
                  value={categoryForm.slug}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      slug: e.target.value,
                    })
                  }
                  placeholder="responsibility"
                  dir="ltr"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  توضیحات
                </label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      description: e.target.value,
                    })
                  }
                  rows={3}
                  placeholder="توضیح کوتاه درباره این رشته بیمه"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  محتوای دانشی دسته اصلی
                </label>
                <textarea
                  value={categoryForm.aiKnowledgeArticle}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      aiKnowledgeArticle: e.target.value,
                    })
                  }
                  rows={8}
                  placeholder="پوشش‌ها، شرایط، استثناها و نکات معتبر این دسته را بنویسید. تا زمانی که زیرمجموعه مشخص نشده، AI فقط از این محتوا استفاده می‌کند."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm resize-y focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  قوانین AI دسته اصلی
                </label>
                <textarea
                  value={categoryForm.aiRules}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      aiRules: e.target.value,
                    })
                  }
                  rows={6}
                  placeholder="قوانین رفتاری و محدودیت‌های AI برای تمام زیرمجموعه‌های این دسته"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm resize-y focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    وضعیت
                  </label>
                  <select
                    value={categoryForm.status}
                    onChange={(e) =>
                      setCategoryForm({
                        ...categoryForm,
                        status: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="ACTIVE">فعال</option>
                    <option value="INACTIVE">غیرفعال</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    ترتیب نمایش
                  </label>
                  <input
                    type="number"
                    value={categoryForm.sortOrder}
                    onChange={(e) =>
                      setCategoryForm({
                        ...categoryForm,
                        sortOrder: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                >
                  {editingCategory ? 'ذخیره تغییرات' : 'ایجاد دسته'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowCategoryModal(false);
                    setEditingCategory(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200"
                >
                  انصراف
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* SUB CATEGORY MODAL */}
      {showSubCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">

            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {editingSubCategory
                    ? 'ویرایش زیر‌دسته بیمه'
                    : 'افزودن زیر‌دسته بیمه'}
                </h3>

                <p className="text-[11px] text-slate-400 mt-1">
                  دسته والد:{' '}
                  <span className="font-bold text-indigo-600">
                    {selectedCategoryForSub?.name || '---'}
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowSubCategoryModal(false);
                  setEditingSubCategory(null);
                  setSelectedCategoryForSub(null);
                }}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSubCategory} className="p-5 space-y-4">

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  نام زیر‌دسته *
                </label>
                <input
                  type="text"
                  value={subCategoryForm.name}
                  onChange={(e) =>
                    setSubCategoryForm({
                      ...subCategoryForm,
                      name: e.target.value,
                    })
                  }
                  placeholder="مثلاً مسئولیت مدیران ساختمان"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Slug
                </label>
                <input
                  type="text"
                  value={subCategoryForm.slug}
                  onChange={(e) =>
                    setSubCategoryForm({
                      ...subCategoryForm,
                      slug: e.target.value,
                    })
                  }
                  placeholder="building-manager"
                  dir="ltr"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  توضیحات
                </label>
                <textarea
                  value={subCategoryForm.description}
                  onChange={(e) =>
                    setSubCategoryForm({
                      ...subCategoryForm,
                      description: e.target.value,
                    })
                  }
                  rows={3}
                  placeholder="توضیح کوتاه درباره این زیر‌دسته"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    وضعیت
                  </label>
                  <select
                    value={subCategoryForm.status}
                    onChange={(e) =>
                      setSubCategoryForm({
                        ...subCategoryForm,
                        status: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="ACTIVE">فعال</option>
                    <option value="INACTIVE">غیرفعال</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    ترتیب نمایش
                  </label>
                  <input
                    type="number"
                    value={subCategoryForm.sortOrder}
                    onChange={(e) =>
                      setSubCategoryForm({
                        ...subCategoryForm,
                        sortOrder: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                >
                  {editingSubCategory
                    ? 'ذخیره تغییرات'
                    : 'ایجاد زیر‌دسته'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowSubCategoryModal(false);
                    setEditingSubCategory(null);
                    setSelectedCategoryForSub(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200"
                >
                  انصراف
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {showProductModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header & Tabs */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {editingItem ? `مدیریت محصول: ${productForm.name || editingItem.name}` : 'ایجاد محصول بیمه‌ای جدید'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  مدیریت مشخصات محصول و سوالات استعلام قیمت هوشمند از یک مرکز یکپارچه
                </p>
              </div>

              <button onClick={() => setShowProductModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Inner Modal Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setProductModalTab('info')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  productModalTab === 'info'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Shield className="w-4 h-4" />
                مشخصات و دانش محصول
              </button>

              <button
                type="button"
                onClick={() => setProductModalTab('quotation')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  productModalTab === 'quotation'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <ListChecks className="w-4 h-4" />
                <span>پرسش‌های استعلام</span>
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px]">
                  {productQuestions.length} سوال
                </span>
              </button>
            </div>

            {/* Tab 1: Product Info Form */}
            {productModalTab === 'info' && (
              <form onSubmit={handleSaveProduct} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">نام محصول بیمه‌ای:</label>
                    <input
                      type="text"
                      required
                      value={productForm.name}
                      onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                      placeholder="مثلاً: بیمه مسئولیت مدیران ساختمان"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      دسته‌بندی اصلی:
                    </label>
                    <select
                      value={productForm.categoryId}
                      onChange={(e) => {
                        const categoryId = e.target.value;
                        const selectedCategory = insuranceCategories.find(
                          (c) => c.id === categoryId
                        );

                        setProductForm({
                          ...productForm,
                          categoryId,
                          subCategoryId: '',
                          category: selectedCategory?.name || '',
                        });
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                      required
                    >
                      <option value="">انتخاب دسته بیمه</option>
                      {insuranceCategories
                        .filter((c) => c.status === 'ACTIVE')
                        .map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      زیر‌دسته:
                    </label>
                    <select
                      value={productForm.subCategoryId}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          subCategoryId: e.target.value,
                        })
                      }
                      disabled={!productForm.categoryId}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="">
                        {productForm.categoryId
                          ? 'انتخاب زیر‌دسته'
                          : 'ابتدا دسته را انتخاب کنید'}
                      </option>

                      {insuranceCategories
                        .find((c) => c.id === productForm.categoryId)
                        ?.subCategories
                        ?.filter((sub: any) => sub.status === 'ACTIVE')
                        .map((sub: any) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    لینک خرید محصول (اختیاری):
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2">
                    لینک امن http/https که فقط پس از تشخیص قطعی همین محصول برای خرید یا استعلام قیمت پیشنهاد می‌شود.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      dir="ltr"
                      value={productForm.purchaseUrl}
                      onChange={(e) => setProductForm({ ...productForm, purchaseUrl: e.target.value })}
                      placeholder="https://example.com/product"
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 text-left"
                    />
                    {normalizeProductPurchaseUrl(productForm.purchaseUrl) && (
                      <a
                        href={normalizeProductPurchaseUrl(productForm.purchaseUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-xl border border-indigo-200 text-indigo-700 font-bold hover:bg-indigo-50"
                      >
                        باز کردن لینک
                      </a>
                    )}
                  </div>
                  {productForm.purchaseUrl && !isValidOptionalProductPurchaseUrl(productForm.purchaseUrl) && (
                    <p className="text-[11px] text-rose-600 mt-1">آدرس باید معتبر و با http یا https باشد.</p>
                  )}
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    قوانین اختصاصی AI برای این محصول:
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2">
                    قوانین و نکاتی که دستیار هنگام پاسخگویی درباره این محصول باید رعایت کند.
                  </p>
                  <textarea
                    rows={5}
                    value={productForm.aiRules}
                    onChange={(e) => setProductForm({ ...productForm, aiRules: e.target.value })}
                    placeholder="مثلاً: اگر مشتری درباره شرایط صدور سؤال کرد، فقط بر اساس اطلاعات مقاله محصول پاسخ بده. اگر اطلاعات کافی وجود ندارد، حدس نزن."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 resize-y"
                  ></textarea>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    مقاله و دانش تخصصی محصول:
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2">
                    تمام اطلاعات تخصصی این محصول را اینجا وارد کنید. این محتوا منبع اصلی AI برای پاسخگویی درباره این محصول است.
                  </p>
                  <textarea
                    rows={14}
                    value={productForm.aiKnowledgeArticle}
                    onChange={(e) => setProductForm({ ...productForm, aiKnowledgeArticle: e.target.value })}
                    placeholder="اطلاعات کامل محصول را وارد کنید؛ شامل پوشش‌ها، شرایط، استثنائات، مدارک، نحوه صدور، خسارت، نکات مهم و هر اطلاعات دیگری که AI باید درباره این محصول بداند..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 resize-y"
                  ></textarea>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowProductModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                  >
                    ذخیره مشخصات محصول
                  </button>
                </div>
              </form>
            )}

            {/* Tab 2: Quotation Form Tab ("فرم استعلام") */}
            {productModalTab === 'quotation' && (
              <div className="space-y-6 text-xs">
                {/* Notice header */}
                <div className="bg-indigo-50/70 border border-indigo-200 p-3.5 rounded-2xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-indigo-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-indigo-900 text-xs">مدیریت پرسش‌های استعلام قیمت هوشمند</h4>
                      <p className="text-[11px] text-indigo-700 mt-0.5">
                        پرسش‌های تعیین‌شده در این بخش، ترتیبی را مشخص می‌کنند که هوش مصنوعی به طور خودکار از مشتری می‌پرسد.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      console.log('[DEBUG LOG] Step 1: Button Clicked ("افزودن سوال استعلام جدید")');
                      if (!editingItem?.id) {
                        console.log('[DEBUG LOG] Step 1.1: FAILED - editingItem?.id is missing!', editingItem);
                        alert('لطفاً ابتدا مشخصات کلی محصول را ذخیره فرمایید.');
                        return;
                      }
                      console.log('[DEBUG LOG] Step 2: Opening Modal for product ID:', editingItem.id);
                      setEditingQuestion(null);
                      resetQuestionForm();
                      setShowQuestionModal(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    افزودن سوال استعلام جدید
                  </button>
                </div>

                {/* Question List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-indigo-600" />
                      لیست سوالات استعلام فعال در این محصول ({productQuestions.length} سوال):
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      💡 می‌توانید با کشیدن (Drag & Drop) یا دکمه‌های فلش، ترتیب سوالات را تغییر دهید.
                    </span>
                  </div>

                  {productQuestions.length === 0 ? (
                    <div className="bg-slate-50 border border-dashed border-slate-200 p-6 rounded-2xl text-center space-y-2">
                      <HelpCircle className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="font-bold text-slate-700 text-xs">هنوز هیچ سوال استعلام قیمتی برای این محصول ثبت نشده است.</p>
                      <p className="text-[11px] text-slate-500">
                        برای اینکه هوش مصنوعی بتواند فرم استعلام قیمت را از کاربر تکمیل کند، روی دکمه زیر کلیک کنید.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          console.log('[DEBUG LOG] Step 1: Button Clicked ("افزودن اولین سوال استعلام")');
                          if (!editingItem?.id) {
                            console.log('[DEBUG LOG] Step 1.1: FAILED - editingItem?.id is missing!', editingItem);
                            alert('لطفاً ابتدا مشخصات کلی محصول را ذخیره فرمایید.');
                            return;
                          }
                          console.log('[DEBUG LOG] Step 2: Opening Modal for product ID:', editingItem.id);
                          setEditingQuestion(null);
                          resetQuestionForm();
                          setShowQuestionModal(true);
                        }}
                        className="mt-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-xs transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        افزودن اولین سوال استعلام
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                      {productQuestions
                        .sort((a, b) => (a.order || 0) - (b.order || 0))
                        .map((q, idx) => {
                          let optionsArr: string[] = [];
                          if (Array.isArray(q.options)) {
                            optionsArr = q.options;
                          } else if (typeof q.options === 'string' && q.options) {
                            try {
                              const parsed = JSON.parse(q.options);
                              if (Array.isArray(parsed)) optionsArr = parsed;
                              else optionsArr = q.options.split(',').map((s: string) => s.trim()).filter(Boolean);
                            } catch {
                              optionsArr = q.options.split(',').map((s: string) => s.trim()).filter(Boolean);
                            }
                          }

                          return (
                            <div
                              key={q.id || idx}
                              draggable
                              onDragStart={(e) => handleQuestionDragStart(e, idx)}
                              onDragOver={handleQuestionDragOver}
                              onDrop={(e) => handleQuestionDrop(e, idx)}
                              className={`bg-white p-4 rounded-xl border shadow-2xs transition-all space-y-2 ${
                                draggedQuestionIndex === idx ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200 hover:border-indigo-300'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                <div className="flex items-center gap-2">
                                  <div className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 p-1" title="برای تغییر جابه‌جایی بکشید">
                                    <GripVertical className="w-4 h-4" />
                                  </div>

                                  <div className="flex flex-col gap-0.5">
                                    <button
                                      type="button"
                                      disabled={idx === 0}
                                      onClick={() => handleMoveQuestion(idx, 'up')}
                                      className="text-slate-400 hover:text-indigo-600 disabled:opacity-30 p-0.5"
                                      title="انتقال بالا"
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={idx === productQuestions.length - 1}
                                      onClick={() => handleMoveQuestion(idx, 'down')}
                                      className="text-slate-400 hover:text-indigo-600 disabled:opacity-30 p-0.5"
                                      title="انتقال پایین"
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </button>
                                  </div>

                                  <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center justify-center">
                                    #{q.order || idx + 1}
                                  </span>

                                  <h5 className="font-bold text-slate-900 text-xs">{q.title}</h5>
                                  <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                    {q.fieldName}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                    q.required ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {q.required ? 'الزامی' : 'اختیاری'}
                                  </span>

                                  <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-indigo-100">
                                    نوع: {
                                      q.type === 'number' ? 'عدد' :
                                      q.type === 'select' ? 'منوی کشویی' :
                                      q.type === 'radio' ? 'دکمه رادیویی' :
                                      q.type === 'checkbox' ? 'چندانتخابی' :
                                      q.type === 'boolean' ? 'بله/خیر' :
                                      q.type === 'date' ? 'تاریخ' : 'متن'
                                    }
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => openEditQuestionModal(q, idx)}
                                    className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                    title="ویرایش سوال"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteQuestion(q.id)}
                                    className="p-1 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    title="حذف سوال"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="bg-slate-50 p-2.5 rounded-lg text-slate-700 text-[11px] leading-relaxed flex items-start gap-2">
                                <span className="font-bold text-indigo-700 shrink-0">سوال AI:</span>
                                <p className="font-medium">"{q.aiQuestion || q.title}"</p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                                {optionsArr.length > 0 && (
                                  <div className="w-full flex items-center gap-1 flex-wrap bg-indigo-50/50 p-2 rounded-lg border border-indigo-100">
                                    <span className="font-bold text-indigo-900 shrink-0">گزینه‌ها ({optionsArr.length}):</span>
                                    {optionsArr.map((opt, oIdx) => (
                                      <span key={oIdx} className="bg-white text-indigo-800 px-2 py-0.5 rounded-md border border-indigo-200 font-medium">
                                        {opt}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {q.type === 'number' && (q.minVal !== null || q.maxVal !== null) && (
                                  <div className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-mono">
                                    {q.minVal !== null ? `حداقل: ${q.minVal}` : ''} {q.maxVal !== null ? ` | حداکثر: ${q.maxVal}` : ''}
                                  </div>
                                )}

                                {q.type === 'text' && (q.minLength !== null || q.maxLength !== null) && (
                                  <div className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-mono">
                                    {q.minLength !== null ? `حداقل طول: ${q.minLength}` : ''} {q.maxLength !== null ? ` | حداکثر طول: ${q.maxLength}` : ''}
                                  </div>
                                )}

                                {q.placeholder && (
                                  <div><span className="font-bold">راهنما:</span> {q.placeholder}</div>
                                )}
                                {q.helpText && (
                                  <div><span className="font-bold">توضیح:</span> {q.helpText}</div>
                                )}
                                {q.validationRule && (
                                  <div className="text-amber-700"><span className="font-bold">اعتبارسنجی:</span> {q.validationRule}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Live Preview / Simulation Section */}
                <div className="bg-slate-900 text-slate-100 p-5 rounded-2xl space-y-4 border border-slate-800 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <h4 className="font-bold text-white text-xs">شبیه‌ساز و پیش‌نمایش زنده چت استعلام AI</h4>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSimAnswers({});
                        setSimCurrentInput('');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 transition-all"
                    >
                      <RotateCcw className="w-3 h-3 text-amber-400" />
                      شروع مجدد شبیه‌سازی
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    در این بخش می‌توانید فرآیند خودکار استعلام قیمت توسط AI را دقیقاً مطابق با سوالات تعریف‌شده تست کنید.
                    <span className="text-emerald-400 font-bold block mt-0.5">
                      ✓ هوش مصنوعی هرگز سوالاتی که کاربر قبلا پاسخ داده است را دوباره نمی‌پرسد.
                    </span>
                  </p>

                  {/* Simulator Active Area */}
                  {(() => {
                    const sorted = [...productQuestions].sort((a, b) => (a.order || 0) - (b.order || 0));
                    const unanswered = sorted.filter(q => simAnswers[q.fieldName] === undefined || simAnswers[q.fieldName] === '');
                    const currentQ = unanswered[0];

                    return (
                      <div className="space-y-4">
                        {/* Current Question AI Box */}
                        {currentQ ? (
                          <div className="bg-slate-800/90 p-4 rounded-xl border border-indigo-500/30 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-indigo-400 flex items-center gap-1">
                                <Brain className="w-3.5 h-3.5 text-indigo-400" />
                                سوال فعال هوش مصنوعی (#{currentQ.order}):
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">fieldName: {currentQ.fieldName}</span>
                            </div>

                            <p className="text-xs text-white font-bold leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-700">
                              🤖 AI: "{currentQ.aiQuestion || currentQ.title}"
                            </p>

                            {/* Simulated Interactive Input according to Question Type */}
                            <div className="pt-1">
                              {['select', 'radio'].includes(currentQ.type) ? (
                                <div className="space-y-2">
                                  <span className="text-[10px] text-slate-300 font-bold">انتخاب پاسخ از گزینه‌های پیشنهادی:</span>
                                  <div className="flex flex-wrap gap-2">
                                    {(Array.isArray(currentQ.options)
                                      ? currentQ.options
                                      : (currentQ.options || '').split(',')
                                    ).map((opt: string, i: number) => (
                                      <button
                                        key={i}
                                        type="button"
                                        onClick={() => {
                                          setSimAnswers({ ...simAnswers, [currentQ.fieldName]: opt.trim() });
                                        }}
                                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-xs"
                                      >
                                        {opt.trim()}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : currentQ.type === 'checkbox' ? (
                                <div className="space-y-2">
                                  <span className="text-[10px] text-slate-300 font-bold">گزینه‌ها را انتخاب کنید (چندانتخابی):</span>
                                  <div className="flex flex-wrap gap-2">
                                    {(Array.isArray(currentQ.options)
                                      ? currentQ.options
                                      : (currentQ.options || '').split(',')
                                    ).map((opt: string, i: number) => {
                                      const labelStr = opt.trim();
                                      const currentList: string[] = Array.isArray(simAnswers[currentQ.fieldName]) ? simAnswers[currentQ.fieldName] : [];
                                      const isSelected = currentList.includes(labelStr);
                                      return (
                                        <button
                                          key={i}
                                          type="button"
                                          onClick={() => {
                                            const newList = isSelected
                                              ? currentList.filter(s => s !== labelStr)
                                              : [...currentList, labelStr];
                                            setSimAnswers({ ...simAnswers, [currentQ.fieldName]: newList });
                                          }}
                                          className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all border ${
                                            isSelected
                                              ? 'bg-emerald-600 border-emerald-500 text-white'
                                              : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                                          }`}
                                        >
                                          {isSelected ? '✓ ' : ''}{labelStr}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : currentQ.type === 'boolean' ? (
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => setSimAnswers({ ...simAnswers, [currentQ.fieldName]: 'بله' })}
                                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                                  >
                                    بله
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSimAnswers({ ...simAnswers, [currentQ.fieldName]: 'خیر' })}
                                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
                                  >
                                    خیر
                                  </button>
                                </div>
                              ) : currentQ.type === 'file' ? (
                                <button
                                  type="button"
                                  onClick={() => setSimAnswers({ ...simAnswers, [currentQ.fieldName]: 'تصویر_مدارک_ارسال_شد.jpg' })}
                                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2"
                                >
                                  <Upload className="w-4 h-4" />
                                  ارسال تصویر / فایل نمونه
                                </button>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <input
                                    type={currentQ.type === 'number' ? 'number' : currentQ.type === 'date' ? 'date' : 'text'}
                                    value={simCurrentInput}
                                    onChange={(e) => setSimCurrentInput(e.target.value)}
                                    placeholder={currentQ.placeholder || 'پاسخ خود را وارد کنید...'}
                                    min={currentQ.minVal !== null && currentQ.minVal !== undefined ? currentQ.minVal : undefined}
                                    max={currentQ.maxVal !== null && currentQ.maxVal !== undefined ? currentQ.maxVal : undefined}
                                    minLength={currentQ.minLength !== null && currentQ.minLength !== undefined ? currentQ.minLength : undefined}
                                    maxLength={currentQ.maxLength !== null && currentQ.maxLength !== undefined ? currentQ.maxLength : undefined}
                                    className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-400"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!simCurrentInput.trim()) return;
                                      setSimAnswers({ ...simAnswers, [currentQ.fieldName]: simCurrentInput.trim() });
                                      setSimCurrentInput('');
                                    }}
                                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all"
                                  >
                                    ثبت پاسخ
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-emerald-950/50 border border-emerald-500/40 p-4 rounded-xl text-center space-y-2">
                            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                            <h5 className="font-bold text-emerald-200 text-xs">کلیه سوالات استعلام قیمت با موفقیت پاسخ داده شد!</h5>
                            <p className="text-[11px] text-emerald-300">
                              اطلاعات استعلام تکمیل گردید و آماده محاسبه و اعلام قیمت توسط کارشناس می‌باشد.
                            </p>
                          </div>
                        )}

                        {/* Session Answers State Summary */}
                        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                          <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            اطلاعات ذخیره‌شده در این جلسه استعلام (Quotation Session):
                          </span>

                          {Object.keys(simAnswers).length === 0 ? (
                            <p className="text-[11px] text-slate-500 italic">هنوز پاسخی ثبت نشده است.</p>
                          ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              {Object.entries(simAnswers).map(([k, v]) => (
                                <div key={k} className="bg-slate-900 p-2 rounded-lg border border-slate-800 flex items-center justify-between text-[11px]">
                                  <span className="text-slate-400 font-mono">{k}:</span>
                                  <span className="text-emerald-400 font-bold">{String(v)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Question Create/Edit Modal */}
      {showQuestionModal && (() => {
        console.log('[DEBUG LOG] Step 3: Modal Rendered');
        return (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-[70]">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-sm">
                  {editingQuestion ? 'ویرایش سوال استعلام قیمت' : 'افزودن سوال استعلام جدید'}
                </h3>
                <button onClick={() => setShowQuestionModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

            <form onSubmit={handleSaveQuestion} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">عنوان فیلد (Label):</label>
                <input
                  type="text"
                  required
                  value={questionForm.title}
                  onChange={(e) => setQuestionForm({ ...questionForm, title: e.target.value })}
                  placeholder="مثلاً: تعداد طبقات ساختمان"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">سوال متنی هوش مصنوعی (AI Question):</label>
                <textarea
                  rows={2}
                  required
                  value={questionForm.aiQuestion}
                  onChange={(e) => setQuestionForm({ ...questionForm, aiQuestion: e.target.value })}
                  placeholder="مثلاً: جهت محاسبه دقیق نرخ بیمه، بفرمایید ساختمان چند طبقه است؟"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">نام متغیر (Field Key):</label>
                  <input
                    type="text"
                    required
                    value={questionForm.fieldName}
                    onChange={(e) => setQuestionForm({ ...questionForm, fieldName: e.target.value })}
                    placeholder="مثلاً: building_floors"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">نوع فیلد ورودی (Field Type):</label>
                  <select
                    value={questionForm.type}
                    onChange={(e) => setQuestionForm({ ...questionForm, type: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-bold"
                  >
                    <option value="text">متن ساده (Text)</option>
                    <option value="number">عدد (Number)</option>
                    <option value="select">منوی کشویی (Dropdown)</option>
                    <option value="radio">دکمه‌های رادیویی (Radio Buttons)</option>
                    <option value="checkbox">چک‌باکس / چندانتخابی (Checkbox)</option>
                    <option value="boolean">بله / خیر (Yes / No)</option>
                    <option value="date">تاریخ (Date)</option>
                  </select>
                </div>
              </div>

              {/* Options Builder for Dropdown, Radio, Checkbox */}
              {['select', 'radio', 'checkbox'].includes(questionForm.type) && (
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <ListChecks className="w-4 h-4 text-indigo-600" />
                      مدیریت گزینه‌ها (Options Builder):
                    </label>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {questionForm.optionsList.length} گزینه تعریف شده
                    </span>
                  </div>

                  {/* Add New Option Input */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={questionForm.newOptionText}
                      onChange={(e) => setQuestionForm({ ...questionForm, newOptionText: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddOption();
                        }
                      }}
                      placeholder="عنوان گزینه جدید را وارد کنید و Enter بزنید..."
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      افزودن گزینه
                    </button>
                  </div>

                  {/* Option Items List */}
                  {questionForm.optionsList.length === 0 ? (
                    <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200 italic">
                      ⚠️ هنوز هیچ گزینه‌ای اضافه نکرده‌اید. حداقل یک گزینه وارد کنید.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {questionForm.optionsList.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 hover:border-slate-300"
                        >
                          {questionForm.editingOptionIndex === oIdx ? (
                            <div className="flex items-center gap-2 w-full">
                              <input
                                type="text"
                                value={questionForm.editingOptionText}
                                onChange={(e) => setQuestionForm({ ...questionForm, editingOptionText: e.target.value })}
                                className="flex-1 px-2 py-1 border border-indigo-300 rounded-lg text-xs"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (!questionForm.editingOptionText.trim()) return;
                                  const list = [...questionForm.optionsList];
                                  list[oIdx] = questionForm.editingOptionText.trim();
                                  setQuestionForm({
                                    ...questionForm,
                                    optionsList: list,
                                    editingOptionIndex: null,
                                    editingOptionText: '',
                                  });
                                }}
                                className="px-2 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-bold"
                              >
                                ذخیره
                              </button>
                              <button
                                type="button"
                                onClick={() => setQuestionForm({ ...questionForm, editingOptionIndex: null, editingOptionText: '' })}
                                className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg text-[10px]"
                              >
                                انصراف
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center">
                                  {oIdx + 1}
                                </span>
                                <span className="font-medium text-slate-800 text-xs">{opt}</span>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={oIdx === 0}
                                  onClick={() => handleMoveOption(oIdx, 'up')}
                                  className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20"
                                  title="انتقال بالا"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={oIdx === questionForm.optionsList.length - 1}
                                  onClick={() => handleMoveOption(oIdx, 'down')}
                                  className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20"
                                  title="انتقال پایین"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setQuestionForm({
                                    ...questionForm,
                                    editingOptionIndex: oIdx,
                                    editingOptionText: opt,
                                  })}
                                  className="p-1 text-slate-400 hover:text-indigo-600"
                                  title="ویرایش گزینه"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveOption(oIdx)}
                                  className="p-1 text-slate-400 hover:text-rose-600"
                                  title="حذف گزینه"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Number Fields Specific Rules (Min & Max Value) */}
              {questionForm.type === 'number' && (
                <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-200 grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-blue-900 block mb-1">حداقل مقدار عددی (Minimum Value):</label>
                    <input
                      type="number"
                      value={questionForm.minVal}
                      onChange={(e) => setQuestionForm({ ...questionForm, minVal: e.target.value })}
                      placeholder="مثلاً: ۱"
                      className="w-full px-3 py-1.5 rounded-xl border border-blue-200 bg-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-blue-900 block mb-1">حداکثر مقدار عددی (Maximum Value):</label>
                    <input
                      type="number"
                      value={questionForm.maxVal}
                      onChange={(e) => setQuestionForm({ ...questionForm, maxVal: e.target.value })}
                      placeholder="مثلاً: ۱۰۰"
                      className="w-full px-3 py-1.5 rounded-xl border border-blue-200 bg-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Text Fields Specific Rules (Min & Max Length) */}
              {questionForm.type === 'text' && (
                <div className="bg-purple-50/60 p-3 rounded-xl border border-purple-200 grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-purple-900 block mb-1">حداقل تعداد کاراکتر (Min Length):</label>
                    <input
                      type="number"
                      min={0}
                      value={questionForm.minLength}
                      onChange={(e) => setQuestionForm({ ...questionForm, minLength: e.target.value })}
                      placeholder="مثلاً: ۲"
                      className="w-full px-3 py-1.5 rounded-xl border border-purple-200 bg-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-purple-900 block mb-1">حداکثر تعداد کاراکتر (Max Length):</label>
                    <input
                      type="number"
                      min={1}
                      value={questionForm.maxLength}
                      onChange={(e) => setQuestionForm({ ...questionForm, maxLength: e.target.value })}
                      placeholder="مثلاً: ۲۵۰"
                      className="w-full px-3 py-1.5 rounded-xl border border-purple-200 bg-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ترتیب نمایش (Order):</label>
                  <input
                    type="number"
                    min={1}
                    value={questionForm.order}
                    onChange={(e) => setQuestionForm({ ...questionForm, order: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={questionForm.required}
                      onChange={(e) => setQuestionForm({ ...questionForm, required: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded-md focus:ring-indigo-500"
                    />
                    <span>این سوال الزامی است</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">متن راهنما داخل فیلد (Placeholder):</label>
                  <input
                    type="text"
                    value={questionForm.placeholder}
                    onChange={(e) => setQuestionForm({ ...questionForm, placeholder: e.target.value })}
                    placeholder="مثلاً: مثلاً ۵"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">قوانین اعتبارسنجی (Validation):</label>
                  <input
                    type="text"
                    value={questionForm.validationRule}
                    onChange={(e) => setQuestionForm({ ...questionForm, validationRule: e.target.value })}
                    placeholder="مثلاً: عدد بین ۱ تا ۵۰"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">توضیحات تکمیلی (Help Text):</label>
                <input
                  type="text"
                  value={questionForm.helpText}
                  onChange={(e) => setQuestionForm({ ...questionForm, helpText: e.target.value })}
                  placeholder="توضیحات بیشتر برای کاربر یا AI..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowQuestionModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  ذخیره سوال
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {/* 3. FAQ Modal */}
      {showFaqModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                {editingItem ? 'ویرایش سوال متداول' : 'ایجاد سوال متداول جدید'}
              </h3>
              <button onClick={() => setShowFaqModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFaq} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">پرسش یا سوال مشتری (Question):</label>
                <input
                  type="text"
                  required
                  value={faqForm.question}
                  onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
                  placeholder="مثلاً: مدارک لازم برای بیمه مسئولیت آسانسور چیست؟"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">پاسخ ایده آل و استاندارد (Ideal Answer):</label>
                <textarea
                  rows={4}
                  required
                  value={faqForm.answer}
                  onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                  placeholder="پاسخ دقیق، روان و کامل که AI باید دقیقاً استفاده کند..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
                ></textarea>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">دسته‌بندی بیمه‌ای:</label>
                <input
                  type="text"
                  value={faqForm.insuranceType}
                  onChange={(e) => setFaqForm({ ...faqForm, insuranceType: e.target.value })}
                  placeholder="مثلاً: بیمه مسئولیت / بیمه خودرو"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowFaqModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  ذخیره FAQ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}





      {/* 6. AI Behavior Rule Modal */}
      {showBehaviorModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-slate-900 text-base">
                  {editingBehaviorRule ? 'ویرایش قانون رفتار AI' : 'افزودن قانون رفتار AI جدید'}
                </h3>
              </div>
              <button
                onClick={() => setShowBehaviorModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBehaviorRule} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">عنوان قانون:</label>
                <input
                  type="text"
                  required
                  disabled={Boolean(behaviorForm.routingTemplates)}
                  value={behaviorForm.title}
                  onChange={(e) => setBehaviorForm({ ...behaviorForm, title: e.target.value })}
                  placeholder="مثلاً: نحوه سلام و درود، طول پاسخ، سیاست اعلام قیمت..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 font-medium"
                />
              </div>

              {behaviorForm.routingTemplates ? (
                <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3">
                  <p className="text-[11px] leading-relaxed text-indigo-700">
                    متغیرهای مجاز: <code>{'{{productName}}'}</code>، <code>{'{{purchaseUrl}}'}</code> و <code>{'{{currentPageUrl}}'}</code>
                  </p>
                  {([
                    ['samePageResponse', 'متن وقتی کاربر در صفحهٔ همان محصول است'],
                    ['differentPageResponse', 'متن وقتی کاربر در صفحهٔ محصول دیگری است'],
                    ['awaitingChoiceResponse', 'متن انتظار برای انتخاب فرم یا استعلام چتی'],
                    ['chatStartResponse', 'متن کوتاه پیش از سؤال اول استعلام چتی'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="block space-y-1">
                      <span className="font-bold text-slate-700">{label}:</span>
                      <textarea
                        rows={3}
                        required
                        value={behaviorForm.routingTemplates![key]}
                        onChange={(e) => setBehaviorForm({
                          ...behaviorForm,
                          routingTemplates: { ...behaviorForm.routingTemplates!, [key]: e.target.value },
                        })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed font-sans bg-white"
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">متن و دستورالعمل قانون (Directive):</label>
                  <textarea
                    rows={4}
                    required
                    value={behaviorForm.directive}
                    onChange={(e) => setBehaviorForm({ ...behaviorForm, directive: e.target.value })}
                    placeholder="دستورالعمل صریح و دقیقی که هوش مصنوعی قبل از هر پاسخ باید رعایت کند..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 leading-relaxed font-sans"
                  ></textarea>
                </div>
              )}

              <div>
                <label className="font-bold text-slate-700 block mb-1">اولویت اجرا:</label>
                <input
                  type="number"
                  min={0}
                  value={behaviorForm.sortOrder}
                  onChange={(e) => setBehaviorForm({ ...behaviorForm, sortOrder: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">وضعیت فعال‌سازی:</label>
                <select
                  value={behaviorForm.status}
                  onChange={(e) =>
                    setBehaviorForm({ ...behaviorForm, status: e.target.value as 'ACTIVE' | 'INACTIVE' })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 font-medium"
                >
                  <option value="ACTIVE">فعال (ترکیب و تزریق مستقیم به پرامپت هوش مصنوعی)</option>
                  <option value="INACTIVE">غیرفعال (عدم تزریق به پرامپت)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBehaviorModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {editingBehaviorRule ? 'بروزرسانی قانون' : 'ثبت قانون رفتاری'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
