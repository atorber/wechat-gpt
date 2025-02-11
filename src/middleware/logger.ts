import { Context, Next } from 'koa';

export async function loggerMiddleware(ctx: Context, next: Next) {
  const start = Date.now();
  
  // 记录请求开始信息
  console.log(`[${new Date().toISOString()}] ${ctx.method} ${ctx.url} - Request Started`);
  if (Object.keys(ctx.request.body).length > 0) {
    console.log('Request Body:', JSON.stringify(ctx.request.body, null, 2));
  }
  
  try {
    await next();
    
    // 记录请求完成信息
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${ctx.method} ${ctx.url} - ${ctx.status} - ${ms}ms`);
  } catch (error) {
    // 记录错误信息
    const ms = Date.now() - start;
    console.error(`[${new Date().toISOString()}] ${ctx.method} ${ctx.url} - Error: ${error.message} - ${ms}ms`);
    throw error;
  }
} 