import { spawnSync } from 'node:child_process';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.capture || options.quiet ? 'pipe' : 'inherit',
  });
  if (options.capture) return result;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.quiet) {
      process.stdout.write(result.stdout ?? '');
      process.stderr.write(result.stderr ?? '');
    }
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status ?? 'unknown'}.`);
  }
  return result;
}

const docker = run('docker', ['info'], { capture: true });
if (docker.error || docker.status !== 0) {
  process.stderr.write(
    'Supabase database verification requires a running Docker engine. Start Docker Desktop, then rerun npm run test:database.\n',
  );
  process.exit(1);
}

const cli = run('supabase', ['--version'], { capture: true });
if (cli.error || cli.status !== 0) {
  process.stderr.write(
    'Supabase database verification requires the Supabase CLI on PATH. See docs/runbooks/development.md.\n',
  );
  process.exit(1);
}

const existing = run('supabase', ['status'], { capture: true });
const wasRunning = existing.status === 0;
let startedHere = false;

try {
  if (!wasRunning) {
    run('supabase', ['start'], { quiet: true });
    startedHere = true;
  }
  run('supabase', [
    'db',
    'reset',
    '--version',
    '202609170002',
    '--sql-paths',
    'upgrade-tests/message_notification_delivery_seed.sql',
  ]);
  run('supabase', ['migration', 'up', '--local']);
  run('supabase', [
    'test',
    'db',
    'supabase/upgrade-tests/message_notification_delivery_upgrade.sql',
  ]);
  run('supabase', ['db', 'reset']);
  run('supabase', ['test', 'db']);
} finally {
  if (startedHere && process.env.KIN_SKIP_SUPABASE_STOP !== '1') {
    run('supabase', ['stop', '--no-backup']);
  }
}
