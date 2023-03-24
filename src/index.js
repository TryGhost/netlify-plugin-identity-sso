const fs = require('fs').promises
const path = require('path')
const toml = require('@iarna/toml')

/**
 @typedef {{
  from: string,
  to: string,
  conditions?: {
    Role?: string[],
  },
  status?: number,
  force?: boolean,
}} NetlifyRedirect
*/

/**
@typedef {{
   build: {
     publish: string,
     functions?: string,
   },
   redirects: NetlifyRedirect[],
 }} NetlifyConfig
*/


/**
 * @param {{ config: NetlifyConfig, functionsDir: string, publishDir: string }} params
 */
async function generateSSO({ config /* &mut */ }) {
  const redirects = config.redirects || []
  /** @type {NetlifyRedirect[]} */
  const gatedRedirects = redirects.map((redirect) => ({
    ...redirect,
    conditions: {
      Role: ['ghost'],
    },
  }))

  /** @type {NetlifyRedirect[]} */
  const additionalRedirects = [
    // Serve content when logged in
    {
      from: '/*',
      to: '/:splat',
      conditions: {
        Role: ['ghost'],
      },
      // will be set to 200 when there is content
      // since we don't set `force`
      status: 404,
    },
    // Serve login page on root
    {
      from: '/',
      to: '/_sso-login',
      status: 401,
      force: true,
    },
    // Redirect to login page otherwise
    {
      from: '/*',
      to: '/_sso-login',
      status: 401, // Using 401 response instead of 302, will redirect in browser
      force: true,
    },
  ]

  return { ...config, redirects: [...gatedRedirects, ...additionalRedirects] }
}

module.exports = {
  // The plugin main logic uses `on...` event handlers that are triggered on
  // each new Netlify Build.
  // Anything can be done inside those event handlers.
  // Information about the current build are passed as arguments. The build
  // configuration file and some core utilities are also available.
  async onBuild({
    // Whole configuration file. For example, content of `netlify.toml`
    netlifyConfig,
    // Build constants
    constants: { PUBLISH_DIR },
  }) {
    const newConfig = await generateSSO({
      config: netlifyConfig
    })

    console.log('Writing updated config to publish dir...')
    const config_out = toml.stringify(newConfig)
    await fs.writeFile(path.join(PUBLISH_DIR, 'netlify.toml'), config_out)
  },
}
