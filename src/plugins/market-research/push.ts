/**
 * Market Research PUSH — sync the synthesized dashboard to GitHub.
 * Run: npm run market:push
 *
 * Rebuilds the MindCache from raw-dumps/market-research/bundle.json (single
 * source of truth) and syncs to:
 *   {githubPath}/market-research-YYYY-MM-DD.md  (dated history)
 *   {githubPath}/market-research-latest.md      (rolling latest)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { loadConfig, loadPluginConfig, getResolvedPaths, loadGitHubConfig, getTodayString } from '../../config/config';
import { initPluginLog } from '../../shared/plugin-logger';
import { MarketResearchPluginConfig, mergeWithDefaults } from './config';
import { buildDashboard, collectFlags } from './dashboard';
import { ResearchBundle } from './types';

async function main() {
    initPluginLog('market-research');
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const cfg = mergeWithDefaults((await loadPluginConfig<MarketResearchPluginConfig>('market-research')) || undefined);

    console.log('📤 Market Research PUSH — syncing to GitHub');
    console.log(`📅 ${getTodayString()}`);

    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    const githubPath = cfg.githubPath || 'market-research';
    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}/${githubPath}`);

    const rawDir = path.join(paths.rawDumps, 'market-research');
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
    const date = bundle.fetchedAt.split('T')[0];

    const gitStore = new GitStore({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        tokenProvider: async () => githubConfig.token,
    });

    const message = `Market research ${bundle.sector} ${date}: ${flags.length} flagged (${flags.filter((f) => f.severity === 'high').length} high)`;
    const targets = [`${githubPath}/market-research-${date}.md`, `${githubPath}/market-research-latest.md`];

    for (const filePath of targets) {
        try {
            const sync = new MindCacheSync(gitStore, mindcache, { filePath, instanceName: 'Market Research' });
            const result = await sync.save({ message });
            if (result.sha === '') {
                console.log(`   ⏭️  Skipped ${filePath} (no changes)`);
            } else {
                console.log(`   ✅ Synced ${filePath}`);
            }
        } catch (error: any) {
            console.error(`   ❌ Failed ${filePath}: ${error.message}`);
        }
    }

    console.log('✨ Done!');
}

main().catch((e) => {
    console.error('❌ market-research push failed:', e);
    process.exit(1);
});
