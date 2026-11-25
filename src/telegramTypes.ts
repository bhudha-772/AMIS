/**
 * Telegram Signal Listener - Type Definitions
 * Defines the structure for raw and validated Telegram trading signals
 */

/** Represents a raw signal parsed from a Telegram message */
export interface TelegramRawSignal {
  id: string;
  sourceChatId: number;
  sourceChatTitle: string;
  sourceMessageId: number;
  rawText: string;
  timestamp: number;
  parsedSymbol: string | null;
  parsedDirection: "BUY" | "SELL" | null;
  parsedEntryPrice: number | null;
  parsedTakeProfits: number[];
  parsedStopLoss: number | null;
  parsedLeverage: number | null;
  parseConfidence: number; // 0-100 how confident the parser is
}

/** A Telegram signal that has been validated by the AI */
export interface TelegramValidatedSignal extends TelegramRawSignal {
  aiValidated: boolean;
  aiConfidence: number;
  aiAnalysis: string;
  aiRecommendedAction: "ACCEPT" | "REJECT" | "REVIEW";
  aiEnhancedEntry: number | null;
  aiEnhancedTP: number | null;
  aiEnhancedSL: number | null;
  marketPriceAtValidation: number | null;
  validationTimestamp: number;
  userDecision: "PENDING" | "ACCEPTED" | "REJECTED";
}

/** Configuration for the Telegram Signal Listener */
export interface TelegramConfig {
  botToken: string;
  enabled: boolean;
  monitoredChats: number[];
  adminChatId: number | null;
  requireAiValidation: boolean;
  autoAcceptThreshold: number; // AI confidence threshold for auto-accept
  maxSignalsPerHour: number;
}

/** Statistics for a monitored Telegram channel */
export interface TelegramChannelStats {
  chatId: number;
  chatTitle: string;
  totalSignals: number;
  acceptedSignals: number;
  rejectedSignals: number;
  pendingSignals: number;
  lastSignalTimestamp: number | null;
  averageAiConfidence: number;
}
