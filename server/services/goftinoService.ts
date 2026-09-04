import prisma from '../db/client';
import { runAiPipelineForMessage, createAiLog } from './aiPipelineService';
import { getEffectiveAiMode } from './settingService';
import { getGoftinoUserData, getGoftinoVisitedPages } from './goftinoUserService';
import { resolveGoftinoAiPolicy } from './goftinoAiPolicyService';
import { findGoftinoCatalogTopic } from './goftinoTopicCatalog';
import { shouldExecuteAi } from '../../shared/aiSchedule';

export interface GoftinoWebhookPayload {
  event?: string;
  chat_id?: string;
  user_id?: string;
  message_id?: string;
  content?: string;
  text?: string;
  sender?: any;
  data?: {
    chat_id?: string;
    user_id?: string;
    message_id?: string;
    content?: string;
    type?: string;
    date?: string;
      fields?: {
        label: string;
        value: unknown;
        option_id?: string;
        optionId?: string;
        value_id?: string;
        valueId?: string;
      }[];
    sender?: {
      from?: string; // "user" | "operator"
      name?: string;
      id?: string;
    };
    action_by?: string;
    to_operator?: string;
    rate?: string;
    client?: {
      id?: string;
      name?: string;
      phone?: string;
      city?: string;
    };
    message?: {
      id?: string;
      text?: string;
      content?: string;
      sender?: string;
    };
  };
  [key: string]: any;
}


type GoftinoTopicSelection = { id: string | null; title: string | null };

/** Never derives authorization from a translated/display title. */
export function extractGoftinoTopicSelection(payload: GoftinoWebhookPayload): GoftinoTopicSelection {
  const data = payload.data as Record<string, unknown> | undefined;
  const fields = payload.data?.fields || [];
  const topLevel = payload as Record<string, unknown>;
  const stableId = [
    data?.department_id, data?.departmentId, data?.topic_id, data?.topicId,
    topLevel.department_id, topLevel.departmentId, topLevel.topic_id, topLevel.topicId,
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0) || null;
  const topicField = fields.find((field) => field.label === 'انتخاب موضوع');
  const fieldValue = topicField?.value;
  const selectedValue = typeof fieldValue === 'object' && fieldValue !== null ? fieldValue as Record<string, unknown> : null;
  const fieldStableId = [
    topicField?.option_id, topicField?.optionId, topicField?.value_id, topicField?.valueId,
    selectedValue?.id, selectedValue?.topic_id, selectedValue?.topicId, selectedValue?.department_id, selectedValue?.departmentId,
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0) || null;
  const title = typeof fieldValue === 'string'
    ? fieldValue
    : [selectedValue?.title, selectedValue?.name, data?.topic_title, data?.topicTitle, data?.department_title, data?.departmentTitle]
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0) || null;
  return { id: stableId || fieldStableId, title };
}

function parseCustomerMetadata(value?: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function processGoftinoWebhook(payload: GoftinoWebhookPayload) {
  const eventName = payload?.event || 'new_message';

  console.log(`📥 [Goftino Webhook] Processing event: "${eventName}"`);

  // 1. Store raw WebhookLog entry to DB
  let logId = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  try {
    const log = await prisma.webhookLog.create({
      data: {
        id: logId,
        event: eventName,
        payload: JSON.stringify(payload),
        status: 'RECEIVED',
      },
    });
    logId = log.id;
  } catch (err) {
    console.warn('⚠️ Failed to store WebhookLog:', err);
  }

  // Handle test ping
  if (eventName === 'ping' || eventName === 'test') {
    return { success: true, status: 'pong', message: 'Goftino webhook connection verified successfully' };
  }

  const data = payload?.data || {};

  // Extract fields strictly according to official Goftino Webhook spec
  const chatId = data.chat_id || payload.chat_id || data.client?.id || data.user_id || `chat_${Date.now()}`;
  const userId = data.user_id || payload.user_id || data.sender?.id || chatId;
  const messageId = data.message_id || data.message?.id || payload.message_id;
  const content = data.content || data.message?.text || data.message?.content || payload.content || payload.text || '';
  const senderRaw = data.sender?.from || (typeof data.sender === 'string' ? data.sender : null) || payload.sender || 'user';
  const senderName = data.sender?.name || data.client?.name || 'کاربر گفتینو';

  // Goftino may send button/field events without a real customer message.
  // These events must never be sent to the AI Brain Layer.
  const hasRealCustomerContent =
    typeof content === 'string' && content.trim().length > 0;

  const isNonMessageEvent =
    eventName === 'click_button' || !hasRealCustomerContent;

  const rawSelectedTopic = extractGoftinoTopicSelection(payload);
  const catalogTopic = findGoftinoCatalogTopic(rawSelectedTopic.id, rawSelectedTopic.title);
  const selectedTopic = {
    id: catalogTopic?.id || rawSelectedTopic.id,
    title: catalogTopic?.title || rawSelectedTopic.title,
  };

  // Handle Event: close_chat
  if (eventName === 'close_chat') {
    const conversation = await prisma.conversation.findFirst({
      where: { goftinoChatId: String(chatId) },
    });
    if (conversation) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'RESOLVED' },
      });
      await createAiLog({
        conversationId: conversation.id,
        customerId: conversation.customerId,
        step: 'Goftino Close Chat',
        status: 'INFO',
        details: `گفتگو با chat_id=${chatId} توسط گفتینو بسته شد.`,
      });
    }
    return { success: true, status: 'chat_closed', chatId: String(chatId) };
  }

  // Handle Event: transfer_chat
  if (eventName === 'transfer_chat') {
    const conversation = await prisma.conversation.findFirst({
      where: { goftinoChatId: String(chatId) },
    });
    if (conversation) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'OPERATOR_ACTIVE' },
      });
      await createAiLog({
        conversationId: conversation.id,
        customerId: conversation.customerId,
        step: 'Goftino Transfer Chat',
        status: 'INFO',
        details: `گفتگو به اپراتور انسانی (ID: ${data.to_operator || 'نامشخص'}) منتقل گردید. پاسخ خودمختار AI متوقف شد.`,
      });
    }
    return { success: true, status: 'chat_transferred', chatId: String(chatId) };
  }

  // Handle Event: click_button
  if (eventName === 'click_button') {
    console.log(`🔘 Button clicked event received for chat_id ${chatId}: "${content}"`);
  }

  // 2. Prevent duplicate messages using message_id
  if (messageId) {
    const existingMessage = await prisma.message.findFirst({
      where: { messageId: String(messageId) },
    });

    if (existingMessage) {
      console.log(`⚠️ Duplicate message skipped (message_id: ${messageId})`);
      return { success: true, status: 'duplicate_skipped', messageId: String(messageId) };
    }
  }

  // 3. Extract form fields directly from Goftino webhook
  const formPhone =
    data.fields?.find(
      (field) => field.label === 'شماره موبایل'
    )?.value || null;

  console.log('📱 Form Phone:', formPhone || 'none');
  console.log('🏷️ Goftino Topic ID:', selectedTopic.id || 'none');
  const selectedPolicy = await resolveGoftinoAiPolicy(selectedTopic.id);
  const selectedCategoryId = selectedPolicy.kind === 'ALLOW'
    ? selectedPolicy.policy.insuranceCategoryId
    : null;

  // 4. Create or update Customer (isolated by userId / chatId)
  let customer = await prisma.customer.findFirst({
    where: {
      OR: [
        { goftinoUserId: String(userId) },
        { goftinoChatId: String(chatId) },
      ],
    },
  });

  if (customer) {
      const previousMetadata = parseCustomerMetadata(customer.metadata);
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          lastActivity: new Date(),
          goftinoChatId: String(chatId),
          ...(formPhone && !customer.phone ? { phone: String(formPhone) } : {}),
          ...(selectedTopic.title || selectedTopic.id
            ? {
                interestedInsuranceTypes: JSON.stringify([selectedTopic.title || selectedTopic.id]),
                metadata: JSON.stringify({
                  ...previousMetadata,
                  goftinoCategoryId: selectedCategoryId,
                  goftinoTopicId: selectedTopic.id,
                  goftinoTopicTitle: selectedTopic.title,
                }),
              }
            : {}),
          ...(senderName && customer.name === 'مشتری گفتینو' ? { name: senderName } : {}),
        },
      });
    } else {
      const goftinoUser = await getGoftinoUserData(String(chatId));
      const visitedPages = await getGoftinoVisitedPages(String(userId));

      console.log('🔎 Goftino User ID:', userId);
      console.log('🔎 Visited Pages:', JSON.stringify(visitedPages));

      try {
        customer = await prisma.customer.create({
          data: {
            goftinoUserId: String(userId),
            goftinoChatId: String(chatId),
            name: goftinoUser?.name || senderName,
            phone: formPhone || goftinoUser?.phone || null,
            email: goftinoUser?.email || null,
            city: goftinoUser?.location || 'نامشخص',
            source: 'گفتینو',
            leadScore: 50,
            leadStatus: 'Cold',
            assignedOperator: null,
            interestedInsuranceTypes: selectedTopic.title || selectedTopic.id
              ? JSON.stringify([selectedTopic.title || selectedTopic.id])
              : "[]",
            websiteActivity: JSON.stringify(visitedPages),
            metadata: JSON.stringify({
              browser: goftinoUser?.browser || null,
              os: goftinoUser?.os || null,
              ip: goftinoUser?.ip || null,
              lastUrl: goftinoUser?.last_url || null,
              pageView: goftinoUser?.page_view || null,
              goftinoCategoryId: selectedCategoryId,
              goftinoTopicId: selectedTopic.id,
              goftinoTopicTitle: selectedTopic.title,
            }),
            lastActivity: new Date(),
          },
        });
      } catch (error: any) {
        if (error?.code === 'P2002') {
          console.warn(
            `⚠️ Customer already exists for goftinoUserId=${String(userId)}. Re-fetching existing customer.`
          );

          customer = await prisma.customer.findFirst({
            where: {
              OR: [
                { goftinoUserId: String(userId) },
                { goftinoChatId: String(chatId) },
              ],
            },
          });

          if (!customer) {
            throw error;
          }

          customer = await prisma.customer.update({
            where: { id: customer.id },
            data: {
              lastActivity: new Date(),
              goftinoChatId: String(chatId),
              ...(formPhone && !customer.phone
                ? { phone: String(formPhone) }
                : {}),
              ...(selectedTopic.title || selectedTopic.id
                ? {
                    interestedInsuranceTypes: JSON.stringify([selectedTopic.title || selectedTopic.id]),
                    metadata: JSON.stringify({
                      ...parseCustomerMetadata(customer.metadata),
                      goftinoCategoryId: selectedCategoryId,
                      goftinoTopicId: selectedTopic.id,
                      goftinoTopicTitle: selectedTopic.title,
                    }),
                  }
                : {}),
            },
          });
        } else {
          throw error;
        }
      }
    }

  // ---------------------------------------------------------
  // Ignore Goftino UI/button/empty events for AI conversation.
  // They may contain fields such as selected insurance topic,
  // but they are NOT customer messages.
  // ---------------------------------------------------------
  if (isNonMessageEvent) {
    console.log(
      `⏭️ Non-message Goftino event ignored by AI: event=${eventName}, chatId=${chatId}, content="${content}"`
    );

    await createAiLog({
      customerId: customer.id,
      step: 'Non Message Event',
      status: 'INFO',
      details: `رویداد ${eventName} دریافت شد اما پیام واقعی مشتری نبود؛ از ارسال به Brain Layer جلوگیری شد. topicId=${selectedTopic.id || 'none'}`,
    });

    return {
      success: true,
      status: 'non_message_event_ignored',
      event: eventName,
      chatId: String(chatId),
      customerId: customer.id,
      selectedTopicId: selectedTopic.id,
    };
  }

  // 4. Create or update Conversation strictly bound to goftinoChatId
  let conversation = await prisma.conversation.findFirst({
    where: { goftinoChatId: String(chatId) },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        goftinoChatId: String(chatId),
        customerId: customer.id,
        status: 'NEW',
        lastMessage: content.trim(),
        lastMessageAt: new Date(),
        unreadCount: 1,
      },
    });
  } else {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessage: content.trim() || conversation.lastMessage,
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },

      },
    });
  }

  // Normalize sender type
  const isOperator = senderRaw === 'operator' || senderRaw === 'agent';
  const senderTypeEnum = isOperator ? 'OPERATOR' : 'CUSTOMER';
  const senderNormalized = isOperator ? 'operator' : 'customer';

  // 5. Save message into Message table
  const finalMessageId = messageId ? String(messageId) : `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  const savedMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      sender: senderNormalized,
      senderType: senderTypeEnum,
      content: content.trim(),
      messageId: finalMessageId,
      channel: 'goftino',
      messageType: 'TEXT',
    },
  });

  console.log(`✅ Message stored (ID: ${savedMessage.id}, ChatID: ${chatId}, MessageID: ${finalMessageId}, Sender: ${senderNormalized})`);

  // Step 1 Logging: Webhook Received
  await createAiLog({
    conversationId: conversation.id,
    customerId: customer.id,
    messageId: savedMessage.id,
    step: 'Webhook Received',
    status: 'SUCCESS',
    details: `[Webhook Received] chat_id: ${chatId}, user_id: ${userId}, message_id: ${finalMessageId}, sender.from: ${senderRaw}, content: "${content}"`,
  });

  // If message came from Human Operator inside Goftino:
  if (isOperator) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: 'OPERATOR_ACTIVE' },
    });
    await createAiLog({
      conversationId: conversation.id,
      customerId: customer.id,
      messageId: savedMessage.id,
      step: 'Human Operator Message',
      status: 'INFO',
      details: `پیام از طرف اپراتور انسانی گفتینو ارسال گردید. وضعیت گفتگو به OPERATOR_ACTIVE تغییر یافت.`,
    });
    return {
      success: true,
      status: 'operator_message_saved',
      chatId: String(chatId),
      messageId: finalMessageId,
    };
  }

  // Check AI status mode (OFF, TEST_MODE, ACTIVE)
  const currentAiMode = await getEffectiveAiMode();

  // Trigger AI pipeline only if sender is CUSTOMER, AI is not OFF, and human operator is NOT active
  if (!shouldExecuteAi(currentAiMode)) {
    await createAiLog({
      conversationId: conversation.id,
      customerId: customer.id,
      messageId: savedMessage.id,
      step: 'AI Mode Check',
      status: 'INFO',
      details: 'وضعیت هوش مصنوعی در حالت "خاموش" قرار دارد. پیام مشتری دریافت شد اما هیچ پایپ‌لاین هوش مصنوعی اجرا نخواهد شد.',
    });
  } else if (conversation.status === 'OPERATOR_ACTIVE' || conversation.status === 'WAITING_OPERATOR') {
    await createAiLog({
      conversationId: conversation.id,
      customerId: customer.id,
      messageId: savedMessage.id,
      step: 'Human Handoff Check',
      status: 'WARNING',
      details: `گفتگو در حالت اپراتور انسانی (${conversation.status}) قرار دارد. پاسخ هوش مصنوعی متوقف گردید.`,
    });
  } else {
    runAiPipelineForMessage({
      conversationId: conversation.id,
      customerId: customer.id,
      messageId: savedMessage.id,
      userMessageContent: content.trim(),
      aiCategory: selectedPolicy.kind === 'ALLOW' ? selectedPolicy.policy.insuranceCategoryId : 'OTHER',
      effectiveAiMode: currentAiMode,
    }).catch((err) => {
      console.error('❌ Error executing AI pipeline:', err);
    });
  }

  return {
    success: true,
    status: 'received',
    messageId: finalMessageId,
    chatId: String(chatId),
    customerId: customer.id,
    conversationId: conversation.id,
  };
}

