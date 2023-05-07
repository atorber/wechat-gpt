# WechatGPT

WechatGPT是一个使用微信充当ChatGPT对话窗口的工具，支持通过关键字指令设置key及接口调用参数，目前已支持openai、api2d接入。

## 启动项目

1.安装依赖及启动

```
npm i
npm start
```

2.扫描二维码登录微信

3.使用任意微信（可以是当前登录机器人的微信向自己发送消息）发送 #帮助

4.发送如下格式给机器人，完成ChatGPT配置

```
#绑定+sk-zsL0e6orgRxxxxxx3BlbkFJd2BxgPfl5aB2D7hFgeVA+https://api.openai.com 
```

> 已支持api2d，不用梯子可以使用的openai接口 https://api2d.com

## 效果展示

- 指令说明

<img src="./docs/4.jpeg" width="50%" height="50%" />

- 绑定ChatGPT

<img src="./docs/2.jpeg" width="50%" height="50%" />

- 对话聊天

<img src="./docs/3.jpeg" width="50%" height="50%" />

- 设定参数

<img src="./docs/5.jpeg" width="50%" height="50%" />
