# 使用官方Node.js 16镜像（包含基于Ubuntu的节点环境）
FROM node:16

# 安装需要的软件
RUN apt-get update && \
    apt-get install -y curl software-properties-common && \
    apt-get install -y ffmpeg

# 创建工作目录
WORKDIR /usr/src/app

# 复制当前目录下的所有文件到工作目录
COPY . .

# 安装依赖
RUN npm install
RUN npm install wx-voice -g

# 启动应用
CMD ["sh", "-c", "wx-voice compile && npm run start"]
