import { defineConfig } from 'vitepress';
export default defineConfig({
    base: '/zynosuite-sdk/',
    title: 'ZynoSuite SDK',
    description: 'TypeScript client for explicitly public content, CRM authentication and app-owned CMS data.',
    cleanUrls: true,
    themeConfig: {
        socialLinks: [{ icon: 'github', link: 'https://github.com/zyno-io/zynosuite-sdk' }],
        nav: [
            { text: 'Guide', link: '/guide/quickstart' },
            { text: 'API', link: '/api/' }
        ],
        sidebar: [
            {
                text: 'Start',
                items: [
                    { text: 'Overview', link: '/' },
                    { text: 'Quickstart', link: '/guide/quickstart' },
                    { text: 'App setup', link: '/guide/app-setup' }
                ]
            },
            {
                text: 'Contracts',
                items: [
                    { text: 'Content audiences', link: '/guide/content' },
                    { text: 'Typed schemas', link: '/guide/schemas' },
                    { text: 'Owned writes and sync', link: '/guide/owned' }
                ]
            },
            {
                text: 'Runtime',
                items: [
                    { text: 'Sessions and logout', link: '/guide/sessions' },
                    { text: 'Native and SSR', link: '/guide/runtimes' },
                    { text: 'Media', link: '/guide/media' },
                    { text: 'Errors', link: '/guide/errors' }
                ]
            },
            { text: 'Reference', items: [{ text: 'API exports', link: '/api/' }] }
        ],
        search: { provider: 'local' }
    }
});
