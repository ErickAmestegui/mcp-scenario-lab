#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runScenario, markdownReport } from './runner.js';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log('Usage: mcp-scenario-lab scenario.json [--endpoint URL] [--out reports/run] [--timeout-ms 10000] [--allow-remote]\nExit: 0 pass; 1 failed scenario; 2 invalid input. Reports: PREFIX.json and PREFIX.md.');
} else {
  try {
    const file = args.shift();
    const options = {};
    let output = 'reports/run';
    while (args.length) {
      const flag = args.shift();
      if (flag === '--allow-remote') options.allowRemote = true;
      else if (['--endpoint', '--out', '--timeout-ms'].includes(flag)) {
        const value = args.shift();
        if (!value || value.startsWith('--')) throw new Error('Option requires value');
        if (flag === '--endpoint') options.endpoint = value;
        else if (flag === '--out') output = value;
        else options.timeoutMs = Number(value);
      } else throw new Error('Unknown option');
    }
    const scenario = JSON.parse(await readFile(file, 'utf8'));
    const report = await runScenario(scenario, options);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(`${output}.json`, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(`${output}.md`, markdownReport(report));
    console.log(`${report.passed ? 'PASS' : 'FAIL'}: ${report.steps.filter(step => step.passed).length}/${scenario.steps.length} steps. Reports: ${output}.json and ${output}.md`);
    process.exitCode = report.passed ? 0 : 1;
  } catch {
    console.error('Invalid scenario, options, endpoint or report destination. Run --help and check the README.');
    process.exitCode = 2;
  }
}
