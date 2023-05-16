# 使用官方Node.js 16镜像（包含了基于Alpine的最小化节点环境）
FROM node:16-alpine

# 安装软件源更新和curl功能
RUN apk update && apk add --no-cache curl

# 安装必要的构建工具和库以及软件包，用于使用ffmpeg功能
RUN apk add --no-cache --update --upgrade --virtual .build-deps \
    build-base \
    python3 \
    ffmpeg

# 创建工作目录
WORKDIR /usr/src/app

# 复制当前目录下的所有文件到工作目录
COPY . .

# 安装依赖
RUN npm install

# 设置默认运行模式 
ENTRYPOINT ["wx-voice", "compile"]

# 启动应用
CMD ["npm", "run", "start"]
