# 指定基础镜像为ubuntu18
FROM ubuntu:18.04

# 更新软件源并安装curl
RUN apt-get update && apt-get install -y curl

# 安装nodejs16
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
RUN apt-get install -y nodejs

# 安装software-properties-common
RUN apt-get install -y software-properties-common

# 安装ffmpeg
RUN add-apt-repository ppa:mc3man/trusty-media 
RUN apt-get update 
RUN apt-get install ffmpeg

# 创建工作目录
WORKDIR /usr/src/app

# 复制当前目录下的所有文件到工作目录
COPY . .

# 安装依赖
RUN npm install wx-voice --save
RUN npm install wx-voice -g
RUN npm install

# 暴露端口3000
EXPOSE 3000

# 编译wx-voice
ENTRYPOINT ["wx-voice", "compile"]

# 启动应用
CMD ["npm", "run", "start"]
