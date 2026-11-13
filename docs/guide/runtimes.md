# Browser, native and SSR

Browser Fetch supplies `Origin`; the SDK never writes that forbidden header. Native and SSR callers must configure the exact HTTPS origin registered for the app. Do not forward untrusted caller-supplied IP headers as authority.

Use a client per application runtime with its own async store. Native secure storage adapters must support an atomic mutate/compare-current operation. Three independent get/set/remove methods do not provide safe session coordination.

V1 SSR supports anonymous content only. Create a request-scoped client without user credentials and render text content. A shared authenticated singleton can leak a user's session between requests and is outside this contract. Authenticated cookies and server handoff require a separate integration design.

SSR/NAT requests share the configured egress IP and app request budgets; the SDK cannot assert each visitor's original IP. Bound server rendering requests and handle rate limits explicitly.

Resolve expiring media in browser hydration when it is displayed. Do not bake signed URLs into cached or static HTML: their lifetime is shorter than the page's potential cache lifetime.
