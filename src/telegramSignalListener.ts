/**
 * Telegram Signal Listener Service
 * Connects to Telegram channels/groups and listens for trading signals
 * Compatible with node-telegram-bot-api v2
 */

import { TelegramConfig, TelegramRawSignal, TelegramChannelStats } from "./telegramTypes";
import { parseSignal } from "./signalParser";
import { Bot, Context } from "node-telegram-bot-api";

type SignalCallback = (signal: TelegramRawSignal) => void;
type StatusCallback = (status: string, data?: any) => void;

interface RateLimiter {
  timestamps: number[];
  maxPerHour: number;
}

class TelegramSignalListener {
  private bot: Bot | null = null;
  private config: TelegramConfig;
  private signalCallbacks: SignalCallback[] = [];
  private statusCallbacks: StatusCallback[] = [];
  private isRunning: boolean = false;
  private rateLimiters: Map<number, RateLimiter> = new Map();
  private channelStats: Map<number, TelegramChannelStats> = new Map();
  private signalCount: number = 0;
  private pollingPromise: Promise<void> | null = null;

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  async start(): Promise<boolean> {
    if (this.isRunning) {
      console.log("[Telegram] Listener is already running.");
      return true;
    }
    if (!this.config.enabled || !this.config.botToken) {
      console.log("[Telegram] Listener is disabled or no bot token provided.");
      return false;
    }
    try {
      this.bot = new Bot(this.config.botToken);
      const botInfo = await this.bot.api.getMe();
      console.log(`[Telegram] Bot connected: @${botInfo.username} (${botInfo.first_name})`);
      this.emitStatus("connected", { username: botInfo.username });
      this.bot.on("message", (ctx: Context) => {
        const message = ctx.message;
        if (message) {
          this.handleMessage(message);
        }
      });
      this.bot.catch((err: unknown) => {
        const error = err as Error;
        console.error(`[Telegram] Error: ${error.message}`);
        this.emitStatus("error", { message: error.message });
      });
      this.pollingPromise = this.bot.startPolling();
      this.isRunning = true;
      console.log(`[Telegram] Listening to ${this.config.monitoredChats.length} chat(s)...`);
      this.emitStatus("listening", { chatCount: this.config.monitoredChats.length });
      return true;
    } catch (err: any) {
      console.error(`[Telegram] Failed to start: ${err.message}`);
      this.emitStatus("failed", { message: err.message });
      return false;
    }
  }

  async stop(): Promise<void> {
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
    }
    this.isRunning = false;
    this.pollingPromise = null;
    console.log("[Telegram] Listener stopped.");
    this.emitStatus("stopped", {});
  }

  private handleMessage(msg: any): void {
    const chatId = msg.chat?.id;
    if (!chatId || !this.config.monitoredChats.includes(chatId)) return;
    if (!msg.text) return;
    if (!this.checkRateLimit(chatId)) {
      console.log(`[Telegram] Rate limit exceeded for chat ${chatId}, skipping.`);
      return;
    }
    const signal = parseSignal(
      msg.text, chatId,
      msg.chat?.title || msg.chat?.username || `Chat-${chatId}`,
      msg.message_id
    );
    if (signal) {
      this.signalCount++;
      console.log(`[Telegram] Signal #${this.signalCount} from ${signal.sourceChatTitle}: ${signal.parsedSymbol} ${signal.parsedDirection}`);
      this.updateChannelStats(chatId, msg.chat?.title || `Chat-${chatId}`);
      this.signalCallbacks.forEach((cb) => cb(signal));
    }
  }

  private checkRateLimit(chatId: number): boolean {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    if (!this.rateLimiters.has(chatId)) {
      this.rateLimiters.set(chatId, { timestamps: [], maxPerHour: this.config.maxSignalsPerHour });
    }
    const limiter = this.rateLimiters.get(chatId)!;
    limiter.timestamps = limiter.timestamps.filter((t) => t > oneHourAgo);
    limiter.timestamps.push(now);
    return limiter.timestamps.length <= limiter.maxPerHour;
  }

  private updateChannelStats(chatId: number, chatTitle: string): void {
    const existing = this.channelStats.get(chatId);
    if (existing) {
      existing.totalSignals++;
      existing.pendingSignals++;
      existing.lastSignalTimestamp = Date.now();
    } else {
      this.channelStats.set(chatId, {
        chatId, chatTitle, totalSignals: 1,
        acceptedSignals: 0, rejectedSignals: 0, pendingSignals: 1,
        lastSignalTimestamp: Date.now(), averageAiConfidence: 0,
      });
    }
  }

  onSignal(callback: SignalCallback): void {
    this.signalCallbacks.push(callback);
  }

  onStatus(callback: StatusCallback): void {
    this.statusCallbacks.push(callback);
  }

  private emitStatus(status: string, data?: any): void {
    this.statusCallbacks.forEach((cb) => cb(status, data));
  }

  getStatus(): { isRunning: boolean; signalCount: number; monitoredChats: number } {
    return {
      isRunning: this.isRunning,
      signalCount: this.signalCount,
      monitoredChats: this.config.monitoredChats.length,
    };
  }

  getChannelStats(): TelegramChannelStats[] {
    return Array.from(this.channelStats.values());
  }

  addMonitoredChat(chatId: number): void {
    if (!this.config.monitoredChats.includes(chatId)) {
      this.config.monitoredChats.push(chatId);
      console.log(`[Telegram] Added chat ${chatId} to monitored list.`);
    }
  }

  removeMonitoredChat(chatId: number): void {
    this.config.monitoredChats = this.config.monitoredChats.filter((id) => id !== chatId);
    console.log(`[Telegram] Removed chat ${chatId} from monitored list.`);
  }

  async sendMessage(chatId: number, text: string): Promise<boolean> {
    if (!this.bot) return false;
    try {
      await this.bot.api.sendMessage({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML"
      });
      return true;
    } catch (err: any) {
      console.error(`[Telegram] Failed to send message: ${err.message}`);
      return false;
    }
  }

  getBot(): Bot | null {
    return this.bot;
  }
}

export { TelegramSignalListener };
export default TelegramSignalListener;