import type { AssistantContext, AssistantIntent, AssistantReply } from '@/lib/assistant/assistantTypes';

export interface AssistantModelAdapter {
  classifyIntent(input: { message: string; context: AssistantContext }): Promise<AssistantIntent>;
  generateReply(input: { message: string; context: AssistantContext; intent: AssistantIntent }): Promise<AssistantReply>;
}
