const axios = require('axios');
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = process.env.TMDB_API_KEY; // 从Vercel环境变量获取

// 缓存配置（10分钟有效期，最多1000条）
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;
const MAX_CACHE_SIZE = 1000;

// 缓存清理函数
const cleanCache = () => {
  const now = Date.now();
  for (const [key, { expiry }] of cache.entries()) {
    if (now > expiry) cache.delete(key);
  }
  if (cache.size > MAX_CACHE_SIZE) {
    Array.from(cache.keys())
      .slice(0, cache.size - MAX_CACHE_SIZE)
      .forEach(k => cache.delete(k));
  }
};

// 每5分钟清理一次缓存
setInterval(cleanCache, 5 * 60 * 1000);

module.exports = async (req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理OPTIONS预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 提取请求路径（移除可能的/api前缀和查询参数）
    const path = req.url
      .replace(/^\/api/, '')
      .split('?')[0]
      .replace(/^\/tmdb/, ''); // 兼容旧路径

    // 验证路径格式
    if (!path.match(/^\/(movie|tv|person|search)\//)) {
      return res.status(400).json({ error: 'Invalid TMDB API path' });
    }

    // 构建缓存键（仅路径）
    const cacheKey = path;

    // 检查缓存
    if (cache.has(cacheKey)) {
      const { data, expiry } = cache.get(cacheKey);
      if (Date.now() < expiry) {
        console.log(`[Cache Hit] ${path}`);
        return res.status(200).json(data);
      }
      cache.delete(cacheKey);
    }

    // 构建TMDB请求URL（自动添加API密钥）
    const tmdbUrl = `${TMDB_BASE_URL}${path}?api_key=${TMDB_API_KEY}`;
    console.log(`[Proxying] ${tmdbUrl}`);

    // 发起请求
    const { data, status } = await axios.get(tmdbUrl, {
      timeout: 5000,
      validateStatus: () => true // 不抛出HTTP错误
    });

    // 仅缓存成功响应
    if (status === 200) {
      cache.set(cacheKey, {
        data,
        expiry: Date.now() + CACHE_TTL
      });
    }

    // 返回响应
    return res.status(status).json(data);
  } catch (error) {
    console.error('[Proxy Error]', error.message);
    return res.status(500).json({
      error: 'TMDB Proxy Error',
      details: error.message
    });
  }
};
