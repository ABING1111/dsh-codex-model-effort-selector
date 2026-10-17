/**
 * Host-side half of the plugin.
 *
 * The real work lives in `client.js`, which the host injects into the browser
 * bundle at startup. This module exists so the package becomes a row on the
 * cordis tree — without a host entry the `dsh.client` bundle is never scanned
 * into the startup graph.
 *
 * Deliberately empty: registering no hooks, no events and no services keeps the
 * plugin fail-open and trivially uninstallable.
 */
export function apply() {}
