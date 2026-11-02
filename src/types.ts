export type ChatType = "direct" | "group";
export type JobStatus = "queued" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled";

export interface IncomingMessage {
  accountId: string;
  chatType: ChatType;
  peerId: string;
  senderId: string;
  messageId: string;
  contextToken?: string;
  text: string;
  receivedAt?: string;
}

export interface ConversationRecord {
  id: string;
  chatId: string;
  title: string;
  workspaceId: string;
  workspacePath: string;
  piSessionId: string;
  piSessionDir: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface JobRecord {
  id: string;
  conversationId: string;
  description: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}
