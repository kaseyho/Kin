let input = '';
for await (const chunk of process.stdin) input += chunk;

let report;
try {
  report = JSON.parse(input);
} catch {
  process.stderr.write('Expected valid npm audit JSON on standard input.\n');
  process.exitCode = 2;
}

if (report) {
  const counts = report.metadata?.vulnerabilities;
  if (!hasNumericCounts(counts)) {
    process.stderr.write('Expected valid npm audit JSON with vulnerability counts.\n');
    process.exitCode = 2;
  } else {
    process.stdout.write(
      `Production dependencies: ${counts.moderate} moderate, ${counts.high} high, ${counts.critical} critical.\n`,
    );
    if (counts.high + counts.critical > 0) {
      const noun = counts.high + counts.critical === 1 ? 'advisory' : 'advisories';
      process.stderr.write(
        `Found ${counts.high + counts.critical} severe production dependency ${noun}.\n`,
      );
      process.exitCode = 1;
    }
  }
}

function hasNumericCounts(value) {
  return value
    && Number.isInteger(value.moderate)
    && Number.isInteger(value.high)
    && Number.isInteger(value.critical);
}
