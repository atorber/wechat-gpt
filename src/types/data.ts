type WhiteList = {
    lastSave: string;
    lastUpdate: string;
    whiteList: {
        [key: string]: {
            endpoint: string;
            historyContextNum: number;
            key: string;
            maxTokenNum: number;
            systemPrompt: string;
            temperature: number;
            timeout: number;
            userPrompt: string;
            quota?: number;
        };
    };
};

type ConversationHistory = {
    content: string;
    role: 'user' | 'assistant' | 'system';
};

type ChatData = {
    [key: string]: {
        historyContext: ConversationHistory[];
        time: string[];
    };
};

type BaseConfig = {
    admin: {
      roomid: string;
      wxid: string;
    },
    baiduvop: {
      ak: string;
      sk: string;
    },
    openai: {
      endpoint: string;
      key: string;
    },
    wechaty: {
      puppet: string;
      token: string;
    },
  };

export {
  type WhiteList,
  type ChatData,
  type BaseConfig,
}
