/**
 * Signing hook: the single place code signing plugs into the pipeline.
 *
 *   node scripts/sign.mjs <file...>
 *
 * If WIRD_SIGN_CMD is unset (the default for local/unsigned builds) it prints
 * a skip message per file and exits 0. If set, it runs the command once per
 * file through the shell with the file path appended as a quoted last
 * argument, and fails on any non-zero exit. SignPath, AzureSignTool or
 * signtool with a certificate plug in by setting WIRD_SIGN_CMD in the
 * workflow (e.g. to a wrapper script); see RELEASING.md for the documented
 * recipe.
 */
import { spawnSync } from 'node:child_process';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/sign.mjs <file...>');
  process.exit(1);
}

const cmd = process.env.WIRD_SIGN_CMD;
if (!cmd || !cmd.trim()) {
  for (const f of files) console.log(`Signing skipped (unsigned build): ${f}`);
  process.exit(0);
}

for (const f of files) {
  console.log(`Signing ${f}`);
  const quoted = `"${f.replace(/"/g, '\\"')}"`;
  const res = spawnSync(`${cmd} ${quoted}`, { shell: true, stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`WIRD_SIGN_CMD failed for ${f} (exit ${res.status})`);
    process.exit(1);
  }
}
