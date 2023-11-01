# 使用官方Node.js 18镜像（包含基于Ubuntu的节点环境）
FROM node:18.17.0-alpine

# 创建工作目录
WORKDIR /usr/src/app

# 复制当前目录下的所有文件到工作目录
COPY . .

RUN npm install

# 启动应用
CMD ["npm", "run", "start"]
