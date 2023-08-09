# 使用官方Node.js 18镜像（包含基于Alpine Linux的节点环境）
FROM node:18.17.0-alpine

# 创建工作目录
WORKDIR /usr/src/app

# 复制 package.json 和 package-lock.json 到工作目录
COPY package*.json ./

# 使用 npm ci 安装生产依赖
RUN npm ci --only=production

# 复制当前目录下的所有文件到工作目录
COPY . .

# 启动应用
CMD ["npm", "run", "start"]