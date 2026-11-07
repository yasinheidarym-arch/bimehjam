import { Request, Response } from 'express';
import prisma from '../db/client';
import { processGoftinoWebhook } from '../services/goftinoService';

let testSessionState = {
  status: 'IDLE' as 'IDLE' | 'WAITING_REAL_WEBHOOK' | 'SUCCESS' | 'EXPIRED',
  startedAt: 0,
  realWebhookDetails: null as null | {
    date: string;
    time: string;
    requestIp: string;
    senderName: string;
    messageId: string;
    chatId: string;
    userId: string;
    content: string;
    event: string;
  },
};

export async function handleGoftinoWebhook(req: Request, res: Response) {
  if (process.env.NODE_ENV === 'production' && !process.env.GOFTINO_API_KEY) {
    return res.status(503).json({ status: 'integration_disabled' });
  }
  const requestTimestamp = new Date().toISOString();
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown';

  let responseStatusCode = 200;
  let responseResponseBody: any = null;

  try {
    const payload = req.body || {};
    
    // 1. Unconditional detailed log to stdout/console (IP, Headers, Raw Body, Timestamp)
    console.log('==================================================');
    console.log(`[${requestTimestamp}] 📥 INCOMING GOFTINO WEBHOOK REQUEST`);
    console.log(`Request IP: ${clientIp}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Raw Body Payload:', JSON.stringify(payload, null, 2));
    console.log('==================================================');

    // 2. Handle connection test verification for REAL incoming webhooks (filtering out mock)
    const data = payload.data || {};
    const rawChatId = String(data.chat_id || payload.chat_id || data.client?.id || data.user_id || '');
    const isMock = rawChatId.startsWith('chat_e2e_') || rawChatId.startsWith('chat_mock_');

    if ((testSessionState.status === 'WAITING_REAL_WEBHOOK' || payload.event === 'test') && !isMock) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('fa-IR');
      const timeStr = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const realChatId = rawChatId || 'نامشخص';
      const realUserId = String(data.user_id || payload.user_id || data.sender?.id || realChatId);
      const realMsgId = String(data.message_id || data.message?.id || payload.message_id || `msg_${Date.now()}`);
      const senderName = String(data.sender?.name || data.client?.name || payload.client_name || 'کاربر گفتینو');
      const content = String(data.content || payload.content || data.message?.content || '');
      const event = String(payload.event || 'new_message');

      testSessionState.status = 'SUCCESS';
      testSessionState.realWebhookDetails = {
        date: dateStr,
        time: timeStr,
        requestIp: clientIp,
        senderName,
        messageId: realMsgId,
        chatId: realChatId,
        userId: realUserId,
        content,
        event,
      };
      console.log(`✅ [Real Webhook Verified] IP: ${clientIp}, chat_id: ${realChatId}, user_id: ${realUserId}, message_id: ${realMsgId}`);
    }

    // 3. Delegate processing to Service Layer for incoming messages
    responseResponseBody = await processGoftinoWebhook(payload);
    responseStatusCode = 200;

    // 4. Unconditionally save WebhookLog entry to database with request and response info
    const logId = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await prisma.webhookLog.create({
      data: {
        id: logId,
        event: payload.event || (payload.type ? payload.type : 'incoming_message'),
        payload: JSON.stringify({
          timestamp: requestTimestamp,
          requestIp: clientIp,
          headers: req.headers,
          body: payload,
          responseStatus: responseStatusCode,
          responseBody: responseResponseBody,
        }),
        status: 'RECEIVED',
      },
    }).catch((err) => console.warn('Failed writing webhook log:', err));

    console.log(`📤 [Webhook Response] Status: ${responseStatusCode}, Body:`, JSON.stringify(responseResponseBody));

    return res.status(responseStatusCode).json(responseResponseBody);
  } catch (error: any) {
    console.error('❌ Error processing Goftino webhook:', error);
    responseStatusCode = 200;
    responseResponseBody = { status: 'received', warning: error.message };

    const logId = `wh_err_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await prisma.webhookLog.create({
      data: {
        id: logId,
        event: 'error',
        payload: JSON.stringify({
          timestamp: requestTimestamp,
          requestIp: clientIp,
          headers: req.headers,
          body: req.body || {},
          responseStatus: responseStatusCode,
          responseBody: responseResponseBody,
          error: error.message,
        }),
        status: 'FAILED',
      },
    }).catch((err) => console.warn('Failed writing webhook log:', err));

    return res.status(responseStatusCode).json(responseResponseBody);
  }
}

export async function startWebhookTest(req: Request, res: Response) {
  testSessionState = {
    status: 'WAITING_REAL_WEBHOOK',
    startedAt: Date.now(),
    realWebhookDetails: null,
  };
  return res.json({
    success: true,
    status: 'WAITING_REAL_WEBHOOK',
    message: 'Backend is now listening for the first real incoming Goftino webhook.',
  });
}

export async function getWebhookTestStatus(req: Request, res: Response) {
  if (testSessionState.status === 'WAITING_REAL_WEBHOOK' && Date.now() - testSessionState.startedAt > 120000) {
    testSessionState.status = 'EXPIRED';
  }
  return res.json({
    status: testSessionState.status,
    active: testSessionState.status === 'WAITING_REAL_WEBHOOK',
    testDetails: testSessionState.realWebhookDetails,
  });
}

export async function triggerE2ETest(req: Request, res: Response) {
  return startWebhookTest(req, res);
}

export async function getWebhookLogs(req: Request, res: Response) {
  try {
    // Get last 50 webhook logs, filtering out artificial e2e mocks if any exist
    const logs = await prisma.webhookLog.findMany({
      where: {
        NOT: {
          payload: { contains: 'chat_e2e_' },
        },
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    const recentMessages = await prisma.message.findMany({
      where: {
        NOT: {
          conversation: { goftinoChatId: { startsWith: 'chat_e2e_' } },
        },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        conversation: {
          include: {
            customer: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      count: logs.length,
      webhookLogs: logs,
      messageLogs: recentMessages,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}


