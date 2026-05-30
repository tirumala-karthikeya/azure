// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  prefetch: { defaultStrategy: 'hover' },
  integrations: [
    starlight({
      title: 'Docs',
      description: 'Internal documentation hub.',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/' },
      ],
      customCss: ['./src/styles/custom.css'],
      components: {
        Head: './src/components/Head.astro',
      },
      sidebar: [
        {
          label: 'Jellyfish Cleanup',
          collapsed: false,
          items: [
            { label: 'Overview', slug: 'jellyfish-cleanup' },
          ],
        },
        {
          label: 'Jellyfish Backfill Commits',
          collapsed: false,
          items: [
            { label: 'Overview', slug: 'jellyfish-backfill-commits' },
          ],
        },
        {
          label: 'Azure Multi-Agent Foundry',
          collapsed: false,
          items: [
            { label: 'Overview', slug: 'azure-multi-agent' },
            { label: 'Prerequisites & setup', slug: 'azure-multi-agent/01-prerequisites' },
            { label: 'Azure permissions & MI', slug: 'azure-multi-agent/02-permissions-identity' },
            { label: 'MCP tools', slug: 'azure-multi-agent/03-mcp-tools' },
            { label: 'Jira (Composio) setup', slug: 'azure-multi-agent/04-jira-composio' },
            { label: 'Agents & system prompts', slug: 'azure-multi-agent/05-agents' },
            { label: 'Workflow (AzureEndToEnd)', slug: 'azure-multi-agent/06-workflow' },
            { label: 'Prod vs non-prod handling', slug: 'azure-multi-agent/07-prod-vs-nonprod' },
            { label: 'Publishing to Teams', slug: 'azure-multi-agent/08-publishing' },
            { label: 'Testing & troubleshooting', slug: 'azure-multi-agent/09-testing-troubleshooting' },
            { label: 'Evaluations', slug: 'azure-multi-agent/10-evaluations' },
          ],
        },
        {
          label: 'GitHub Actions Handbook',
          collapsed: true,
          items: [
            {
              label: 'Getting started',
              collapsed: true,
              items: [
                { label: 'What it actually is',  slug: 'handbook/01-what-github-actions-actually-is' },
                { label: 'Six words that matter', slug: 'handbook/02-the-six-words-that-matter' },
                { label: 'A quick YAML primer',  slug: 'handbook/03-a-quick-yaml-primer' },
                { label: 'Your first workflow',  slug: 'handbook/04-your-first-workflow-and-what-you-ll-see-after' },
              ],
            },
            {
              label: 'Core concepts',
              collapsed: true,
              items: [
                { label: 'Reading a real workflow', slug: 'handbook/05-reading-a-real-workflow-file' },
                { label: 'Triggers',                slug: 'handbook/06-triggers-when-things-run' },
                { label: 'Jobs and steps',          slug: 'handbook/07-jobs-and-steps-the-shape-of-everything' },
                { label: 'Marketplace actions',     slug: 'handbook/08-using-other-people-s-actions' },
                { label: 'Secrets and env vars',    slug: 'handbook/09-secrets-and-environment-variables' },
                { label: 'Permissions & contexts',  slug: 'handbook/10-permissions-contexts-and-the-built-in-variables-you-ll-actually-use' },
              ],
            },
            {
              label: 'Recipes & patterns',
              collapsed: true,
              items: [
                { label: 'Recipes',           slug: 'handbook/11-recipes-you-ll-probably-copy' },
                { label: 'Pipeline patterns', slug: 'handbook/12-real-world-pipeline-patterns' },
              ],
            },
            {
              label: 'Operations',
              collapsed: true,
              items: [
                { label: 'Reusing workflows', slug: 'handbook/13-when-you-start-repeating-yourself' },
                { label: 'Debugging',         slug: 'handbook/14-debugging-and-running-workflows-on-your-laptop' },
                { label: 'Security scanning', slug: 'handbook/15-security-scanning-the-stuff-you-shouldn-t-skip' },
                { label: 'Billing & cost',    slug: 'handbook/16-billing-minutes-and-how-not-to-burn-through-them' },
              ],
            },
            {
              label: 'Reference',
              collapsed: true,
              items: [
                { label: 'End-to-end flow', slug: 'handbook/17-from-push-to-production-the-end-to-end-flow' },
                { label: 'vs Azure DevOps', slug: 'handbook/18-github-actions-vs-azure-devops-pipelines' },
                { label: 'Abbreviations',   slug: 'handbook/19-abbreviations-defined' },
              ],
            },
          ],
        },
      ],
      lastUpdated: true,
      pagination: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 4 },
    }),
  ],
});
