const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3101';
const isProd = process.env.NODE_ENV === 'production';

// O Next injeta scripts inline na hidratação; sem 'unsafe-eval' em produção (o modo dev usa eval para recarregar).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Sem o selo do Next no canto da tela em desenvolvimento.
  devIndicators: false,
  // Imagem Docker enxuta: o build gera .next/standalone com só o que o servidor precisa.
  // Na Vercel o próprio build da plataforma cuida da saída: standalone ali só atrapalharia.
  output: process.env.VERCEL ? undefined : 'standalone',
  // A Busca com IA leva de 30 a 120 s com a chave gratuita do Gemini; o limite padrão do proxy de rewrites é 30 s e cortaria a resposta.
  experimental: { proxyTimeout: 150_000 },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // O navegador fala só com o Next: /api/* vai para a API (docs/08). Sem CORS e sem expor a URL interna.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/v1/:path*` }];
  },
};

export default nextConfig;
