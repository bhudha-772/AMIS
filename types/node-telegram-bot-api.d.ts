declare module "node-telegram-bot-api" {
  namespace TelegramBot {
    interface Options {
      polling?: boolean | object;
      webHook?: boolean | object;
      onlyFirstMatch?: boolean;
      request?: object;
      baseApiUrl?: string;
      filepath?: boolean;
    }

    interface Message {
      message_id: number;
      from?: User;
      date: number;
      chat: Chat;
      text?: string;
      caption?: string;
      reply_to_message?: Message;
      entities?: MessageEntity[];
    }

    interface User {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    }

    interface Chat {
      id: number;
      type: "private" | "group" | "supergroup" | "channel";
      title?: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    }

    interface MessageEntity {
      type: string;
      offset: number;
      length: number;
      url?: string;
      user?: User;
    }

    interface CallbackQuery {
      id: string;
      from: User;
      message?: Message;
      inline_message_id?: string;
      chat_instance: string;
      data?: string;
      game_short_name?: string;
    }

    interface BotInfo {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    }
  }

  class TelegramBot {
    constructor(token: string, options?: TelegramBot.Options);
    getMe(): Promise<TelegramBot.BotInfo>;
    sendMessage(chatId: number | string, text: string, options?: any): Promise<TelegramBot.Message>;
    on(event: string, callback: (...args: any[]) => void): void;
    on(event: "message", callback: (message: TelegramBot.Message) => void): void;
    on(event: "polling_error", callback: (error: Error) => void): void;
    on(event: "callback_query", callback: (query: TelegramBot.CallbackQuery) => void): void;
    stopPolling(): Promise<boolean>;
    startPolling(): Promise<boolean>;
    getChat(chatId: number | string): Promise<TelegramBot.Chat>;
    getChatMember(chatId: number | string, userId: number): Promise<any>;
  }

  export = TelegramBot;
}
