# Privacy page

The privacy page is public at [Pairleaf privacy](https://pairleaf-privacy.swoony-bean-3091.chatgpt.site/), hosted through OpenAI Sites. `deployment.json` records its Site identity and published version. The generated static page is in `dist/`. `PRIVACY.md` is the policy source; `publication.json` holds the canonical URL. Contact details remain in `PRIVACY.md`. No credentials belong in that file.

From the repository root:

```sh
node scripts/build-privacy-page.mjs
node scripts/build-privacy-page.mjs --check
python -m http.server 5183 --bind 127.0.0.1 --directory site/dist
```

Preview at `http://127.0.0.1:5183`. The source page embeds its CSS and SVG mark, with no application scripts, forms, analytics, or external assets. The hosting infrastructure adds a Cloudflare abuse-protection script; the policy discloses separate host request processing. Its generated CSP does not allow scripts. Compare policy text and styling when verifying deployment, because the edge-added script makes the response differ from the source bytes.

For an update, keep the configured HTTPS `privacyUrl` in `publication.json` and update `PRIVACY.md`. Then run:

```sh
node scripts/build-privacy-page.mjs --release
node scripts/build-privacy-page.mjs --check --release
```

The release check rejects missing settings and placeholder URLs. It validates format and generated content; verify the hosted page and contact separately in a signed-out browser. Publish only the generated `site/dist/index.html` through the existing Site source checkout, preserving the project ID in `deployment.json`. Do not create another Site for an update. The hosting checkout contains only that static page and `.openai/hosting.json`; it has its own source history, separate from the extension repository. Site publishing commits that page source to the hosting provider, not to Pairleaf’s GitHub repository.

The same generated `index.html` is bundled as the extension’s offline privacy page. Hosting and extension builds are separate: publishing a policy does not submit the extension. No deployment is triggered by the build commands above. Recheck signed-out HTTPS access and the policy text after publishing.
