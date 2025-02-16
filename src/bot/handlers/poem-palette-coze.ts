/* eslint-disable camelcase */
/* eslint-disable sort-keys */
import * as fs from 'fs'
import { FileBox } from 'file-box'
import path from 'path'
import { CanvasRenderingContext2D, createCanvas, loadImage } from 'canvas'
import { CozeBot, uuid, ChatV2Req } from './coze.js'

export class PoemPalette {

  cozeToken: string
  botId: string
  cozeEndpoint: string = 'https://api.coze.cn/open_api/v2/chat'
  bot: CozeBot
  constructor (
    cozeToken: string,
    botId: string,
    cozeEndpoint?: string,
  ) {
    this.cozeToken = cozeToken
    this.botId = botId
    this.cozeEndpoint = cozeEndpoint || this.cozeEndpoint
    this.bot = new CozeBot({
      api_key: this.cozeToken,
      endpoint: this.cozeEndpoint,
      bot_id: this.botId,
    })
  }

  async chat (user: string, query: string, conversation_id?:string): Promise<{type:'text';content:string}|{type:'image';content:string[]}> {
    const data:ChatV2Req = {
      conversation_id: conversation_id || uuid(),
      user,
      query,
      history_count: 10,
      stream: false,
    }
    const res = await this.bot.chat(data)
    // console.info('res:', JSON.stringify(res.data))
    const cards = res.extractCards()
    if (cards.length > 0) {
      return {
        type: 'image',
        content: [ cards[0]?.response_for_model.url, cards[0]?.response_for_model.image_url ],
      }
    } else {
      const answers = res.extractAnswer()
      const follow_ups = res.filterAnswer({ type: 'follow_up' })
      const follow_up_text = follow_ups.map((item) => '//' + item.content).join('\n')
      return {
        type: 'text',
        content: `${answers[0]?.content}\n\n你可以继续说：\n${follow_up_text}`,
      }
    }
  };

  async downloadImage (url: string, outputPath: string) {
    const fileBox = FileBox.fromUrl(url)
    const fileName = path.join(outputPath, fileBox.name)
    // console.info('fileName:', fileName);
    await fileBox.toFile(fileName, true)
    return fileName
  }

  // 绘制带倒角的矩形边框的函数，用于给最终的图片添加统一的圆角
  drawRoundedRect (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.arcTo(x + width, y, x + width, y + height, radius)
    ctx.arcTo(x + width, y + height, x, y + height, radius)
    ctx.arcTo(x, y + height, x, y, radius)
    ctx.arcTo(x, y, x + width, y, radius)
    ctx.closePath()
    ctx.fill()
  }

  // 主要功能的函数
  async drawPosterWithText (imagePath: string, title: string, text: string, outputPath: any) {
    const image = await loadImage(imagePath)
    // 如果title中包含《》则去掉
    title = title.replace(/《|》/g, '')
    // 字体与留白的设置，以及外边框的大小
    const padding = 0
    const borderSize = 5 // 外边框的大小
    const borderRadius = 0 // 图片和外边框的倒角的设置
    const borderColor = '#F8F8FF' // 边框颜色：蓝灰色
    const titleFont = 'bold 60px sans-serif'
    const titlePaddingBottom = 80 // 标题下方留白
    const textFont = '28px sans-serif'
    const textPaddingBottom = 40 // 正文下方留白
    const textLineHeight = 45 // 文本行高

    // 将文本按行分割
    const lines = text.split('\n')
    const totalTextHeight = lines.length * textLineHeight

    // 计算画布宽度和高度
    const canvasWidth = image.width + padding * 2 + borderSize * 2
    const canvasHeight = padding + 60 + titlePaddingBottom + totalTextHeight + textPaddingBottom + image.height + padding + borderSize * 2

    // 创建画布
    const canvas = createCanvas(canvasWidth, canvasHeight)
    const ctx = canvas.getContext('2d')

    // 绘制蓝灰色的边框背景
    ctx.fillStyle = borderColor
    this.drawRoundedRect(ctx, 0, 0, canvasWidth, canvasHeight, borderRadius)

    // 绘制白色的主体背景
    ctx.fillStyle = 'white'
    this.drawRoundedRect(ctx, borderSize, borderSize, canvasWidth - borderSize * 2, canvasHeight - borderSize * 2, borderRadius)

    // 继续进行绘制工作
    const offsetX = borderSize + padding
    let offsetY = borderSize + padding + 20

    // 绘制标题
    ctx.fillStyle = 'black'
    ctx.font = titleFont
    ctx.textAlign = 'center'
    ctx.fillText(title, canvas.width / 2, offsetY + 60)

    offsetY += 60 + titlePaddingBottom

    // 绘制正文
    ctx.font = textFont
    lines.forEach((line: string, index: number) => {
      ctx.fillText(line, canvas.width / 2, offsetY + (index * textLineHeight))
    })

    offsetY += totalTextHeight + textPaddingBottom

    // 绘制图片
    ctx.drawImage(image, offsetX, offsetY, image.width, image.height)

    // 输出为PNG文件
    const buffer = canvas.toBuffer('image/png')
    const fileName = path.basename(imagePath, path.extname(imagePath))
    const outputFileName = `${outputPath}/${title}-${fileName}-framed-poster.png`
    fs.writeFileSync(outputFileName, buffer)
    return outputFileName
  }

}
