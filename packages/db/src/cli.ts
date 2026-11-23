import { migrate } from './migrate';
import { createPool } from './pool';

async function main() {
  const cmd = process.argv[2];
  if (cmd !== 'migrate') {
    console.error('uso: node dist/cli.js migrate');
    process.exit(2);
  }
  const db = createPool('migrator');
  try {
    await migrate(db);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
