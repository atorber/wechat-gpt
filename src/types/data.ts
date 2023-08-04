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
      items: {
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
      items: {
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
      items: {
        endpoint: {
          name: string;
          value: string;
        };
        key: {
          name: string;
          value: string;
        };
        model: {
          name: string;
          value: string;
        };
      };
    };
    wechaty: {
      name: string;
      items: {
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

  enum KeyWords {
    Help = '#帮助',
    BingdText = '发送 #绑定+ChatGPT的key+API地址 绑定GPT配置信息,例：\n\n#绑定+sk-zsL0e6orgRxxxxxx3BlbkFJd2BxgPfl5aB2D7hFgeVA+https://api.openai.com',
    TemperatureText = '发送 #发散度+目标值 设置发散度，发散度取值范围0-1，例：\n\n#发散度+0.8',
    MaxTokenText = '发送 #最大长度+目标值 设置返回消息的最大长度，例：\n\n#最大长度+2048',
    HistoryContextNumText = '发送 #历史上下文数量+目标值 设置请求携带历史消息的数量，建议值1-6，例：\n\n#历史上下文数量+6',
    SystemPromptText = '发送 #系统提示词+提示词内容 设置系统提示词，例：\n\n#系统提示词+你是一个中英文互译助手，将用户输入在中英文之间互译',
    TimeoutText = '发送 #超时时间+目标值 设置请求超时时间，建议值30-90，例：\n\n#超时时间+30',
    ExportFile = '#导出文件',
    ClearHistory = '#清理历史消息'
    // ExportDoc = '#导出文档'
  }

export {
  type WhiteList,
  type ChatData,
  type BaseConfig,
  KeyWords,
}
