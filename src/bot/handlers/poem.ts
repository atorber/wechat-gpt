// 生成海报
import { FileBox } from 'file-box'
import {
    PoemPalette,
  } from './poem-palette.js'

const createPoster = async (pp: PoemPalette, textPoem: any, disc: string) => {
    console.info('textPoem:', JSON.stringify(textPoem, null, 2))
  
    const fileBoxs: FileBox[] = []
    const title = textPoem['诗题']
    const content = textPoem['诗词']
    // const disc = textPoem['画面描述'];
  
    // 生成图片
    const imageUrl = await pp.createImage(textPoem, disc)
    console.info('imageUrl:', imageUrl)
  
    // const imageUrl = 'https://filesystem.site/cdn/20240501/gkmSV1Vm1u8C9qEfB6utodMNnbCzr1.png'
    if (imageUrl) {
      // const imageUrl = 'https://cdn.gptbest.vip/mj/attachments/1232309211187380249/1233725967327825930/zik999_an_old_pine_tree_with_gnarled_branches_vibrant_green_on__5219f839-457e-466e-be64-c8febbb8d41d.png?ex=662e2458&is=662cd2d8&hm=e5d2448343781f375b601b2f59f1bdb844a1b993dc9b805662e4cffe33fbe45a&'
      // 下载图片
      const path = await pp.downloadImage(imageUrl, './public/images')
      // const path = await downloadImage('https://filesystem.site/cdn/20240423/mElg1SliaPWbVusYjbgtsRH0e1o05u.png', './public/images');
  
      // const path = './public/images/Ia9SOHm12lsR33wM3BKmIjM58qq5bf.png';
      // const path = './public/images/mElg1SliaPWbVusYjbgtsRH0e1o05u.png';
      // const path = './public/images/20240427105557.png';
      console.info('path:', path)
  
      // 分割图片
      const images = await pp.sliceImage(path, './public/images/')
      console.info('images:', images)
  
      // 生成带文字的海报，并发送
      images.map(async (imagePath) => {
        const newImagePath = await pp.drawPosterWithText(imagePath, title, content, './public/draws')
        const fileBox = FileBox.fromFile(newImagePath)
        fileBoxs.push(fileBox)
      })
      return fileBoxs
    } else {
      console.error('图片生成失败：imageUrl is empty')
      return []
    }
  }

export {
    createPoster
}