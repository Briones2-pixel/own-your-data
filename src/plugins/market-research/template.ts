/**
 * Market Research plugin template — config UI section.
 */

import { BasePluginConfig, PluginRenderData } from '../types';
import { MarketResearchPluginConfig, DEFAULT_CONFIG, mergeWithDefaults } from './config';
import { Issuer } from './types';

export function renderTemplate(
    config: BasePluginConfig & Record<string, unknown>,
    data: PluginRenderData
): string {
    const cfg = mergeWithDefaults(config as unknown as Partial<MarketResearchPluginConfig>);
    const enabled = cfg.enabled ?? DEFAULT_CONFIG.enabled;
    const publicCount = cfg.issuers.filter((i) => i.ticker).length;

    const statusClass = !enabled ? 'disconnected' : cfg.issuers.length > 0 ? 'connected' : 'pending';
    const statusText = !enabled
        ? '⏸ Disabled'
        : cfg.issuers.length > 0
        ? `✅ ${cfg.issuers.length} issuer(s), ${publicCount} public`
        : '⚠️ Add issuers';

    const issuerRows = cfg.issuers
        .map(
            (i: Issuer) => `
            <tr>
                <td style="padding:0.4rem;">${i.name}</td>
                <td style="padding:0.4rem; color:#58a6ff;">${i.ticker || '<span style="color:#8b949e;">private</span>'}</td>
                <td style="padding:0.4rem; color:#8b949e; font-size:0.85em;">${i.note || ''}</td>
            </tr>`
        )
        .join('');

    return `
<details${data.justSaved ? ' open' : ''}>
    <summary>
        <span class="icon">📈</span>
        Market Research (FEC)
        <span class="status ${statusClass}">${statusText}</span>
    </summary>
    <div class="section-content">
        <p class="help" style="margin-bottom: 1rem; color: #7ee787;">
            🎉 <strong>No API key required!</strong> Uses Stooq (quotes), SEC EDGAR (filings) and Google News (RSS).
        </p>

        <form action="/plugin/market-research" method="POST">
            <div style="margin-bottom: 1rem; padding: 0.75rem; background: #0a0a0a; border: 1px solid #333; border-radius: 4px;">
                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                    <input type="checkbox" name="enabled" ${enabled ? 'checked' : ''} />
                    Enable plugin
                </label>
            </div>

            <div>
                <label for="mr-sector">Sector label</label>
                <input type="text" id="mr-sector" name="sector" value="${cfg.sector}" placeholder="Family Entertainment Centers" />
            </div>

            <h4 style="margin:1rem 0 0.5rem; color:#aaa;">🏢 Tracked Issuers</h4>
            <div style="background:#0d1117; border:1px solid #30363d; border-radius:6px; overflow:hidden; margin-bottom:0.5rem;">
                <table style="width:100%; border-collapse:collapse; text-align:left;">
                    <thead><tr style="border-bottom:1px solid #30363d; color:#8b949e;">
                        <th style="padding:0.4rem;">Issuer</th><th style="padding:0.4rem;">Ticker</th><th style="padding:0.4rem;">Note</th>
                    </tr></thead>
                    <tbody>${issuerRows}</tbody>
                </table>
            </div>
            <label for="mr-issuers">Issuers (JSON: <code>[{ "name", "ticker?", "cik?", "aliases?", "note?" }]</code>)</label>
            <textarea id="mr-issuers" name="issuers" rows="8" style="width:100%; font-family:monospace; font-size:0.8rem;">${JSON.stringify(cfg.issuers, null, 2)}</textarea>

            <div>
                <label for="mr-sector-queries">Sector news queries (one per line)</label>
                <textarea id="mr-sector-queries" name="sectorQueries" rows="4" style="width:100%; font-family:monospace; font-size:0.8rem;">${cfg.sectorQueries.join('\n')}</textarea>
            </div>

            <div>
                <label for="mr-flag-keywords">Extra flag keywords (comma-separated)</label>
                <input type="text" id="mr-flag-keywords" name="flagKeywords" value="${cfg.flagKeywords.join(', ')}" placeholder="lease default, traffic decline" />
                <p class="help">Merged with built-in rules (M&amp;A, financing, distress, guidance, analyst actions, openings).</p>
            </div>

            <div style="display:flex; gap:1rem;">
                <div style="flex:1;">
                    <label for="mr-news-per">News per query</label>
                    <input type="text" id="mr-news-per" name="newsPerQuery" value="${cfg.newsPerQuery}" />
                </div>
                <div style="flex:1;">
                    <label for="mr-history">History days</label>
                    <input type="text" id="mr-history" name="historyDays" value="${cfg.historyDays}" />
                </div>
            </div>

            <div>
                <label for="mr-sec-ua">SEC EDGAR contact (User-Agent)</label>
                <input type="text" id="mr-sec-ua" name="secUserAgent" value="${cfg.secUserAgent}" placeholder="Your Name your@email.com" />
                <p class="help">SEC asks for a contact string on automated requests.</p>
            </div>

            <div>
                <label for="mr-github-path">GitHub Output Path</label>
                <input type="text" id="mr-github-path" name="githubPath" value="${cfg.githubPath}" placeholder="market-research" />
            </div>

            <button type="submit">💾 Save Market Research Config</button>
        </form>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />
        <p style="color: #8b949e; font-size: 0.85rem;">
            <strong>Commands:</strong><br>
            <code>npm run market:get</code> - Collect quotes, filings, news<br>
            <code>npm run market:process</code> - Synthesize sector dashboard<br>
            <code>npm run market:push</code> - Sync to GitHub<br>
            <strong>Broker research:</strong> drop .txt/.md files into <code>raw-dumps/market-research/research/</code>
        </p>
        <button type="button" class="btn small-btn secondary" onclick="viewPluginLogs('market-research')" style="margin-top: 0.5rem;">📋 View Logs</button>
    </div>
</details>
`;
}

export function parseFormData(body: Record<string, string>): MarketResearchPluginConfig {
    let issuers = DEFAULT_CONFIG.issuers;
    if (body.issuers) {
        try {
            const parsed = JSON.parse(body.issuers);
            if (Array.isArray(parsed)) issuers = parsed;
        } catch {
            // keep defaults if the JSON is malformed
        }
    }

    const sectorQueries = body.sectorQueries
        ? body.sectorQueries.split('\n').map((s) => s.trim()).filter(Boolean)
        : DEFAULT_CONFIG.sectorQueries;

    const flagKeywords = body.flagKeywords
        ? body.flagKeywords.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

    return {
        enabled: body.enabled === 'on',
        sector: body.sector?.trim() || DEFAULT_CONFIG.sector,
        issuers,
        sectorQueries,
        flagKeywords,
        newsPerQuery: parseInt(body.newsPerQuery) || DEFAULT_CONFIG.newsPerQuery,
        historyDays: parseInt(body.historyDays) || DEFAULT_CONFIG.historyDays,
        secUserAgent: body.secUserAgent?.trim() || DEFAULT_CONFIG.secUserAgent,
        githubPath: body.githubPath?.trim() || DEFAULT_CONFIG.githubPath,
    };
}

export function getDefaultConfig(): MarketResearchPluginConfig {
    return { ...DEFAULT_CONFIG };
}
