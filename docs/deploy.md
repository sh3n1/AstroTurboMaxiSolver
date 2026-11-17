# Publishing the app

The app is a set of static files. `npm run build` puts them in `www/`: HTML, scripts,
styles, icons and the star and object catalogues. Nothing in the code knows where it will be
hosted, and it should stay that way: any static host that meets the rules below will do, and
moving to another one means only changing this computer's upload command.

## What any host must do

| Rule | Why |
| --- | --- |
| Serve over HTTPS | Browsers only give the camera and motion sensors to secure pages. |
| Serve `index.html` for any address inside the app, such as `/tabs/sky` | The app has its own addresses. Reloading or opening one must load the app, not a "not found" page. |
| Serve `/index.html` as itself, without redirecting it to `/` | The service worker downloads it to keep the app for offline use. With a redirect it keeps an incomplete app, which fails without a connection. |
| Never cache `index.html`, `ngsw.json` or `ngsw-worker.js` for long (at most 10 minutes) | They name the current version. Kept longer, phones keep running an old version. |
| Serve `manifest.webmanifest` as JSON | Browsers read it to offer installing the app. |

Every other file has a fingerprint in its name, or is listed by the service worker with its
own fingerprint, so caching it for long is fine.

The rules need no files in the project. Static hosts usually meet them with default settings,
or with a setting in their dashboard: a "single-page application" option for the second rule,
for example.

What belongs to the host, such as the domain, HTTPS certificates, or keeping the site private
to a few people, is set up in the host's dashboard, not in the project.

## Publishing a version

Once only: create `deploy.local.json` in the project's folder. Git ignores it, so the host,
its account and the address stay on this computer.

```json
{
  "command": "the host's command to upload the folder in DEPLOY_DIR",
  "url": "https://the published address"
}
```

`command` runs from the project's folder, and gets the folder to upload, `www`, as the
`DEPLOY_DIR` environment variable. Examples, each needing the host's own login first:

| Host | Command |
| --- | --- |
| Cloudflare Workers | `npx wrangler deploy --config <a wrangler.jsonc kept outside the project>` |
| Netlify | `npx netlify-cli deploy --prod --dir=www` |
| A server of your own | `scp -r www/* user@server:/var/www/app/` |

Keep any host's own configuration outside the project too. For Cloudflare, its
`wrangler.jsonc` sets `assets.directory` to the full path of `www`, and
`not_found_handling` to `single-page-application`, so addresses inside the app load it,
and `html_handling` to `none`, so `/index.html` isn't redirected to `/`.
Never run a host's tool in a way that lets it pick the folder or write files into the project:
on 2026-11-17, `wrangler pages project create` wrote a config pointing at `src/` and
published the source code, until it was taken down. The checks below now look for that.

Then, for each version:

```
npm run deploy
```

It runs, in order, stopping at the first failure:

1. Lint and unit tests, so a broken version is never published.
2. The build, which also writes `assets/build-info.json`: the version, the git commit, and
   when it was built.
3. The upload command.
4. With a `url`, the hosting checks (`scripts/check-deploy.mjs`), including that none of
   the project's own files, such as its source code, can be read there. Then the PWA end-to-end
   tests against the published copy: it loads, installs its service worker, and works
   offline. A site kept private behind a login can't be checked this way: leave `url` out.

The checks can also run on their own, against any address:

```
npm run deploy:check -- https://the published address
```

## Which version a phone has

Settings, under Testing tools, shows the version, the commit and when it was built, such as
`0.0.1 · 8cb2a58 · 17 Nov, 21:40`. A `+` after the commit means it was built with changes not
yet committed. Under the dev server it says "Development".

A phone gets a new version the next time it opens the app after it was published, as the
service worker finds it, and runs it once the app is reloaded.
