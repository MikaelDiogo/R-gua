import 'reflect-metadata';
import { createApp } from './app';
import { MonitorsService } from './monitors/monitors.service';
import { DB } from './platform/db.module';
import { productionProblems } from './platform/production-checks';

// Falha numa tarefa solta não pode derrubar a API: registra e segue. Exceção não capturada deixa o processo
// em estado incerto: registra e sai, e o orquestrador (Docker/Render) sobe de novo.
process.on('unhandledRejection', (e) =>
  console.error('[api] promessa rejeitada sem tratamento:', e),
);
process.on('uncaughtException', (e) => {
  console.error('[api] exceção não capturada, reiniciando:', e);
  process.exit(1);
});

async function bootstrap() {
  const app = await createApp();
  app.enableShutdownHooks(); // SIGTERM: termina as requisições em curso e fecha o banco
  const problems = await productionProblems(app.get(DB));
  if (problems.length > 0) {
    console.error(`Configuração insegura para produção:\n - ${problems.join('\n - ')}`);
    await app.close();
    process.exit(1);
  }
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3101);
  // Local: só a própria máquina. No Docker o compose define API_HOST=0.0.0.0 (a rede interna não é publicada).
  await app.listen(port, process.env.API_HOST ?? '127.0.0.1');
  // Monitores rodam sozinhos a cada 10 min (desligue com MONITOR_SCHEDULER=0).
  if (process.env.MONITOR_SCHEDULER !== '0') app.get(MonitorsService).startScheduler();
}

void bootstrap();
