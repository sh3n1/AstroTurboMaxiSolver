# Publishing the app

The site is a set of static files. `npm run build` puts them in `www/`:

- `www/` itself: the landing page, plain HTML and CSS from `src/landing/`, for people and
  search engines. It is what the site's address shows.
- `www/app/`: the app, built by Angular with `/app/` as its base address, with its service
  worker, manifest, scripts and the star and object catalogues.

Nothing in the code knows where it will be hosted, and it should stay that way: any static
host that meets the rules below will do, and moving to another one means only changing this
computer's upload command.

## What any host must do

| Rule | Why |
| --- | --- |
| Serve over HTTPS | Browsers only give the camera and motion sensors to secure pages. |
| Serve the landing, `/index.html`, at `/` with a 200 | It is what search engines index and what a shared link shows. |
| Serve `/app/index.html`, with a 200, for any address under `/app/` that has no file, such as `/app/tabs/sky` | The app has its own addresses. Reloading or opening one must load the app, not a "not found" page. |
| Serve `/404.html` with a 404 for any other address that has no file | So search engines don't index addresses that don't exist. |
| Serve `/app/index.html` as itself, without redirecting it to `/app/` | The service worker downloads it to keep the app for offline use. With a redirect it keeps an incomplete app, which fails without a connection. |
| Never cache `app/index.html`, `app/ngsw.json` or `app/ngsw-worker.js` for long (at most 10 minutes) | They name the current version. Kept longer, phones keep running an old version. |
| Serve `app/manifest.webmanifest` as JSON | Browsers read it to offer installing the app. |

Every other file has a fingerprint in its name, or is listed by the service worker with its
own fingerprint, so caching it for long is fine.

The rules need no files in the project. Static hosts meet the first and third with default
settings, and most can meet the second with a rewrite rule for `/app/*`. A host's plain
"single-page application" setting is not enough: it sends every unknown address to the
landing instead. `e2e/serve-www.mjs` shows the rules as a small server.

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
`wrangler.jsonc` sets `assets.directory` to the full path of `www`, `html_handling` to
`none`, so `/app/index.html` isn't redirected, and `not_found_handling` to `none`. A small
routing script beside it, its `main`, answers only the addresses no file matches, by the
rules above: a folder gets its `index.html`, an address under `/app/` gets the app, and
anything else the 404 page.
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
4. With a `url`, after waiting 30 seconds for the host to finish switching versions, the
   hosting checks (`scripts/check-deploy.mjs`), including that none of
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
service worker finds it. An "Update app" button then shows bottom right on the map, and a tap
switches to it.

Installed copies made before the app moved to `/app/` open the landing page instead. Delete
them and install again from the app.
