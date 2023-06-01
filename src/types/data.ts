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
      name: string;
      value: {
        roomid: {
          name: string;
          value: string;
        };
        wxid: {
          name: string;
          value: string;
        };
      };
    };
    baiduvop: {
      name: string;
      value: {
        ak: {
          name: string;
          value: string;
        };
        sk: {
          name: string;
          value: string;
        };
      };
    };
    openai: {
      name: string;
      value: {
        endpoint: {
          name: string;
          value: string;
        };
        key: {
          name: string;
          value: string;
        };
      };
    };
    wechaty: {
      name: string;
      value: {
        puppet: {
          name: string;
          value: string;
        };
        token: {
          name: string;
          value: string;
        };
      };
    };
  };

export {
  type WhiteList,
  type ChatData,
  type BaseConfig,
}
