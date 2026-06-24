/**
 * Market Research PROCESS — synthesize the raw bundle into a MindCache
 * sector-research note (markdown). Run: npm run market:process
 *
 * Reads raw-dumps/market-research/bundle.json and writes:
 *   connector_data/market-research/market-research-YYYY-MM-DD.md  (dated)
 *   connector_data/market-research/market-research-latest.md      (rolling)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, loadPluginConfig, getResolvedPaths } from '../../config/config';
import { writeIfChanged } from '../../shared/write-if-changed';
import { initPluginLog } from '../../shared/plugin-logger';
import { MarketResearchPluginConfig, mergeWithDefaults } from './config';
import { buildDashboard, collectFlags } from './dashboard';
import { ResearchBundle } from './types';

async function main() {
    initPluginLog('market-research');
    console.log('📈 Market Research PROCESS — synthesizing sector dashboard\n');

    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const cfg = mergeWithDefaults((await loadPluginConfig<MarketResearchPluginConfig>('market-research')) || undefined);

    const rawDir = path.join(paths.rawDumps, 'market-research');
    const outputDir = path.join(paths.connectorData, 'market-research');
    await fs.mkdir(outputDir, { recursive: true });

    const bundlePath = path.join(rawDir, 'bundle.json');
    let bundle: ResearchBundle;
    try {
        bundle = JSON.parse(await fs.readFile(bundlePath, 'utf-8')) as ResearchBundle;
    } catch {
        console.log('⚠️ No bundle.json found. Run `npm run market:get` first.');
        process.exit(0);
    }

    const flags = collectFlags(bundle, cfg.flagKeywords);
    const mindcache = buildDashboard(bundle, cfg.flagKeywords);
    const markdown = mindcache.toMarkdown();

    const date = bundle.fetchedAt.split('T')[0];
    const datedPath = path.join(outputDir, `market-research-${date}.md`);
    const latestPath = path.join(outputDir, 'market-research-latest.md');

    const w1 = await writeIfChanged(datedPath, markdown);
    const w2 = await writeIfChanged(latestPath, markdown);

    console.log(`🚩 Flagged for review: ${flags.length} (${flags.filter((f) => f.severity === 'high').length} high)`);
    console.log(`   ${w1 ? '✅ wrote' : '⏭️  unchanged'} ${path.basename(datedPath)}`);
    console.log(`   ${w2 ? '✅ wrote' : '⏭️  unchanged'} ${path.basename(latestPath)}`);
    console.log(`\n✨ Done. Output in ${outputDir}`);
}

main().catch((e) => {
    console.error('❌ market-research process failed:', e);
    process.exit(1);
});
