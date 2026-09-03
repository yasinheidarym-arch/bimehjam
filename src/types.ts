export type InsuranceType = 'third_party' | 'hull' | 'health' | 'fire' | 'life' | 'travel';

export interface InsurancePolicyInfo {
  id: InsuranceType;
  title: string;
  shortDesc: string;
  iconName: string;
  basePriceFormatted: string;
  highlights: string[];
}

export interface GoftinoClientInfo {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  ip?: string;
  city?: string;
  page?: string;
  browser?: string;
}

export interface GoftinoMessageInfo {
  id: string;
  text: string;
  type?: 'text' | 'file' | 'image';
  sender: 'client' | 'operator' | 'bot';
  created_at: number;
}

// Goftino Webhook Event Types matching official Goftino API documentation
export type GoftinoEventType = 'new_message' | 'close_chat' | 'transfer_chat' | 'rating' | 'click_button' | 'test';

export interface GoftinoSender {
  from: 'operator' | 'user';
  id: string;
  name?: string;
}

export interface GoftinoMessage {
  message_id?: string;
  sender?: GoftinoSender;
  date?: string;
  content?: string;
  type?: 'text' | 'voice' | 'file' | 'start_form' | 'delay_from' | 'offline_form' | 'question_answer';
  is_seen?: boolean;
  reply_to?: string;
  fields?: Array<{ label: string; value: string }>;
}

export interface GoftinoWebhookPayload {
  event: GoftinoEventType;
  data: {
    chat_id?: string;
    user_id?: string;
    sender?: GoftinoSender;
    date?: string;
    content?: string;
    type?: string;
    message_id?: string;
    current_owner?: string[];
    action_by?: string;
    to_operator?: string;
    rate?: string;
    client?: GoftinoClientInfo;
    message?: GoftinoMessageInfo;
  };
  secret?: string;
}

export interface GoftinoOperatorInfo {
  operator_id: string;
  name: string;
  email: string;
  avatar?: string;
  is_online: boolean;
}

export interface GoftinoUserData {
  user_id: string;
  chat_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  description?: string;
  tags?: string[];
  metadata?: Array<{ key: string; value: string }>;
  ip?: string;
  location?: string;
  browser?: string;
  os?: string;
  is_banned?: boolean;
  last_url?: string;
  last_visit?: string;
  first_visit?: string;
  page_view?: string;
}

// AI Customer Behavior Analysis
export type SentimentType = 'مثبت (علاقمند)' | 'مردد (نیاز به مشاوره)' | 'بی‌علاقه / ناراضی' | 'سوال تکنیکی / خنثی';

export type CustomerIntentType = 
  | 'استعلام قیمت (Price Inquiry)'
  | 'تصمیم خرید قطعی (High Buying Intent)'
  | 'مقایسه بیمه‌ها (Comparison)'
  | 'پیگیری خسارت / شکایت (Claim/Issue)'
  | 'سوال عام (General Q&A)';

export interface CustomerAnalysis {
  sentiment: SentimentType;
  leadScore: number; // 0 to 100
  customerIntent: CustomerIntentType;
  extractedNeeds: {
    insuranceType?: string;
    vehicleOrPropertyDetails?: string;
    budgetOrDiscountMentioned?: string;
    urgencyLevel?: 'بالا' | 'متوسط' | 'پایین';
  };
  recommendedAction: string;
  keyInsights: string[];
}

export interface GoftinoLogEntry {
  id: string;
  timestamp: string;
  client: GoftinoClientInfo;
  incomingMessage: string;
  aiResponse: string;
  analysis: CustomerAnalysis;
  responseTimeMs: number;
  status: 'پاسخ داده شد توسط AI' | 'انتقال به اپراتور' | 'ارسال نشده';
  manualNote?: string;
}

export interface AiBehaviorRule {
  id: string;
  title: string;
  directive: string;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
  category?: string;
  enforcementLevel?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface KnowledgeBaseData {
  companyName: string;
  consultantPhone: string;
  systemPrompt: string;
  aiBehaviorRules?: AiBehaviorRule[];
  thirdPartyTariffs: {
    basePrides: number;
    basePeugeot: number;
    baseSuv: number;
    maxCoverageFinancial: number;
    maxCoverageLife: number;
  };
  hullInsuranceNotes: string;
  healthInsuranceNotes: string;
  fireInsuranceNotes: string;
  frequentlyAskedQuestions: Array<{
    question: string;
    answer: string;
    category: string;
  }>;
}

export interface QuoteCalculationRequest {
  insuranceType: InsuranceType;
  vehicleType?: 'pride' | 'peugeot' | 'suv' | 'motorcycle' | 'truck';
  buildYear?: number;
  noClaimYears?: number;
  desiredFinancialCoverageMillion?: number;
  buildingAreaSqm?: number;
  buildingValuePerSqmMillion?: number;
  familyMembersCount?: number;
  age?: number;
}

export interface QuoteCalculationResult {
  insuranceType: InsuranceType;
  estimatedPriceRials: number;
  estimatedPriceTomanFormatted: string;
  discountAppliedPercentage: number;
  finalPriceTomanFormatted: string;
  breakdown: Array<{ label: string; amountToman: string }>;
  aiAdvisorTip: string;
}

export type AiMode = 'OFF' | 'TEST_MODE' | 'ACTIVE';

export interface AiModeInfo {
  mode: AiMode;
  label: string;
  description: string;
}
