import { handle } from '@astrojs/cloudflare/handler';
import { pruneOldData } from './engine/retention';

// The Worker's own entrypoint, so it can run the daily clean-up as well as serve the site.
export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
  // Once a day (see `triggers` in wrangler.jsonc): keep the 30-day promise on the home page.
  scheduled: async (_controller, env) => {
    await pruneOldData(env.DB);
  },
} satisfies ExportedHandler<Env>;
