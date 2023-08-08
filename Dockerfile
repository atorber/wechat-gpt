# 阶段一：构建阶段
FROM node:18.17.0 AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build && \
    # 清理不必要的文件
    rm -rf node_modules

# 阶段二：最终运行时镜像
FROM node:18.17.0
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/dist ./dist
RUN apt-get update && \
    apt-get install -y curl software-properties-common ffmpeg && \
    npm install wx-voice -g
CMD ["sh", "-c", "wx-voice compile && npm run start"]