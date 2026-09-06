import { Router } from 'express';
import {
  getKnowledgeDashboard,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getQuotationQuestions,
  createQuotationQuestion,
  updateQuotationQuestion,
  deleteQuotationQuestion,
  reorderQuotationQuestions,
  simulateQuotationResponse,
  getFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  getResponseTemplates,
  createResponseTemplate,
  getKnowledgeGaps,
  updateKnowledgeGapStatus,
  searchKnowledge,
  getUrlMaps,
  createUrlMap,
  updateUrlMap,
  deleteUrlMap,
  testResolveUrl,
  getArticles,
  createArticle,
  updateArticle,
  deleteArticle,
  getAiBehavior,
  createAiBehavior,
  updateAiBehavior,
  deleteAiBehavior,
  reorderAiBehavior,
  testAiResponse,
  getInsuranceCategories,
  createInsuranceCategory,
  updateInsuranceCategory,
  deleteInsuranceCategory,
  createInsuranceSubCategory,
  updateInsuranceSubCategory,
  deleteInsuranceSubCategory,
} from '../controllers/knowledgeController';

const router = Router();

// Knowledge Dashboard Overview
router.get('/dashboard', getKnowledgeDashboard);

// 1. Knowledge Articles
router.get('/articles', getArticles);
router.post('/articles', createArticle);
router.put('/articles/:id', updateArticle);
router.delete('/articles/:id', deleteArticle);

// 2. Insurance Categories & Sub-Categories
router.get('/categories', getInsuranceCategories);
router.post('/categories', createInsuranceCategory);
router.put('/categories/:id', updateInsuranceCategory);
router.delete('/categories/:id', deleteInsuranceCategory);

router.post('/sub-categories', createInsuranceSubCategory);
router.put('/sub-categories/:id', updateInsuranceSubCategory);
router.delete('/sub-categories/:id', deleteInsuranceSubCategory);

// 3. Insurance Products
router.get('/products', getProducts);
router.post('/products', createProduct);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);

// 3. FAQ Management
router.get('/faqs', getFaqs);
router.post('/faqs', createFaq);
router.put('/faqs/:id', updateFaq);
router.delete('/faqs/:id', deleteFaq);

// 4. AI Behavior Rules (Single Source of Truth)
router.get('/ai-behavior', getAiBehavior);
router.post('/ai-behavior', createAiBehavior);
router.put('/ai-behavior/reorder', reorderAiBehavior);
router.put('/ai-behavior/:id', updateAiBehavior);
router.delete('/ai-behavior/:id', deleteAiBehavior);

// 6. Live AI Test
router.post('/test-ai', testAiResponse);

// Quotation Form Engine Questions
router.get('/questions', getQuotationQuestions);
router.post('/questions', createQuotationQuestion);
router.put('/questions-reorder', reorderQuotationQuestions);
router.put('/questions/:id', updateQuotationQuestion);
router.delete('/questions/:id', deleteQuotationQuestion);
router.post('/quotation-response/simulate', simulateQuotationResponse);

// AI Response Templates
router.get('/templates', getResponseTemplates);
router.post('/templates', createResponseTemplate);

// Knowledge Gap Analysis
router.get('/gaps', getKnowledgeGaps);
router.put('/gaps/:id', updateKnowledgeGapStatus);

// Global Knowledge Search
router.get('/search', searchKnowledge);

// Product URL Intelligence Mapping
router.get('/url-maps', getUrlMaps);
router.post('/url-maps', createUrlMap);
router.put('/url-maps/:id', updateUrlMap);
router.delete('/url-maps/:id', deleteUrlMap);
router.post('/url-maps/resolve', testResolveUrl);

export default router;
