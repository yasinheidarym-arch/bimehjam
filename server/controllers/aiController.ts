import { Request, Response } from 'express';
import prisma from '../db/client';
import { getActiveSystemPrompt } from '../services/aiConversationService';
import { runAiPipelineForMessage } from '../services/aiPipelineService';

/**
 * Controller endpoint: POST /api/ai/process-message
 * Triggers AI processing for a specific conversation and message.
 */
export async function processMessageController(req: Request, res: Response) {
  try {
    const { conversationId, messageId } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: 'conversationId is required in request body',
      });
    }

    // Use the same mode/policy gates, turn serialization and quotation state
    // machine as Goftino. The legacy free-form answer extractor must not write
    // a second, conflicting state through this endpoint.
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return res.status(404).json({ success: false, error: 'Conversation not found' });
    const message = await prisma.message.findFirst({
      where: { conversationId, senderType: 'CUSTOMER', ...(messageId ? { id: messageId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    if (!message) return res.status(400).json({ success: false, error: 'Customer message not found' });
    await runAiPipelineForMessage({ conversationId, customerId: conversation.customerId, messageId: message.id, userMessageContent: message.content });
    const reply = await prisma.message.findFirst({ where: { conversationId, senderType: 'AI', metadata: { contains: `"sourceMessageId":${JSON.stringify(message.id)}` } }, orderBy: { createdAt: 'desc' } });
    const result = { success: true, conversationId, aiMessageId: reply?.id || null, aiResponse: reply ? { answer: reply.content } : null };

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('❌ Error in processMessageController:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process AI message',
      details: error.message,
    });
  }
}

/**
 * Controller endpoint: GET /api/ai/prompts
 * Returns all system prompt versions.
 */
export async function getPromptsController(req: Request, res: Response) {
  try {
    const prompts = await prisma.aiPrompt.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const activePromptContent = await getActiveSystemPrompt();

    return res.status(200).json({
      success: true,
      activePromptContent,
      prompts,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Controller endpoint: POST /api/ai/prompts
 * Creates a new system prompt or updates the active version.
 */
export async function createPromptController(req: Request, res: Response) {
  try {
    const { name, content, version, active } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    if (active) {
      // Deactivate all existing prompts
      await prisma.aiPrompt.updateMany({
        data: { active: false },
      });
    }

    const newPrompt = await prisma.aiPrompt.create({
      data: {
        name: name || 'دستورالعمل سیستم بیمه جم',
        content,
        version: version || '1.0',
        active: active !== undefined ? active : true,
      },
    });

    return res.status(201).json({
      success: true,
      prompt: newPrompt,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
