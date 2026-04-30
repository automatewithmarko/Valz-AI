// Idempotent Stripe catalog creator. Talks ONLY to Stripe — DB writes are
// handled separately via the Supabase MCP. Reads plan metadata from
// Supabase via REST is also avoided; instead we hardcode the plan list
// here (it's tiny and rarely changes).
//
// Output: prints the resolved {plan, productId, priceId, topupProductId,
// webhookId, webhookSecret} as JSON for downstream consumption.
//
// Idempotent: re-running matches existing Stripe resources via metadata
// (`valz_plan`, `valz_credit_topup`, `valz_webhook`) and won't duplicate.
//
// Usage:  node scripts/stripe-setup.mjs

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

async function loadEnv() {
  const text = await readFile(resolve(ROOT, ".env.local"), "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const STRIPE_API = "https://api.stripe.com/v1";

async function stripe(method, path, body) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2024-12-18.acacia",
    },
    body: body ? new URLSearchParams(flatten(body)).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${method} ${path} ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v == null) continue;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === "object" && item !== null) {
          Object.assign(out, flatten(item, `${key}[${i}]`));
        } else {
          out[`${key}[${i}]`] = String(item);
        }
      });
    } else if (typeof v === "object") {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

// Hardcoded mirror of public.plans. Update both sides if pricing changes.
const PLANS = [
  { name: "starter", display_name: "Back Pocket", price_cents: 1499, monthly_credits: 1500 },
  { name: "growth", display_name: "In Hand", price_cents: 2499, monthly_credits: 2500 },
  { name: "pro", display_name: "On Speed Dial", price_cents: 3500, monthly_credits: 3500 },
];

(async () => {
  await loadEnv();
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY missing");
  const isLive = process.env.STRIPE_SECRET_KEY.includes("_live_");
  console.log(`Mode: ${isLive ? "LIVE" : "TEST"}`);

  const result = { plans: [], topup: null, webhook: null };

  // ── Subscription products + prices ────────────────────────────────
  const allActiveProducts = await stripe("GET", "/products?limit=100&active=true");

  for (const plan of PLANS) {
    let product = allActiveProducts.data.find((p) => p.metadata?.valz_plan === plan.name);
    if (!product) {
      product = await stripe("POST", "/products", {
        name: `Valzacchi.ai — ${plan.display_name}`,
        description: `${plan.monthly_credits.toLocaleString()} AI credits per month`,
        metadata: { valz_plan: plan.name },
      });
      console.log(`✓ created product ${plan.name}: ${product.id}`);
    } else {
      console.log(`· product ${plan.name} already exists: ${product.id}`);
    }

    const existingPrices = await stripe(
      "GET",
      `/prices?product=${product.id}&limit=100&active=true`
    );
    let price = existingPrices.data.find(
      (p) =>
        p.unit_amount === plan.price_cents &&
        p.currency === "usd" &&
        p.recurring?.interval === "month" &&
        p.metadata?.valz_plan === plan.name
    );
    if (!price) {
      price = await stripe("POST", "/prices", {
        product: product.id,
        unit_amount: plan.price_cents,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { valz_plan: plan.name },
      });
      console.log(`✓ created price ${plan.name}: ${price.id} (${plan.price_cents}¢/mo)`);
    } else {
      console.log(`· price ${plan.name} already exists: ${price.id}`);
    }

    result.plans.push({ name: plan.name, productId: product.id, priceId: price.id });
  }

  // ── Credit top-up product ─────────────────────────────────────────
  let topup = allActiveProducts.data.find((p) => p.metadata?.valz_credit_topup === "true");
  if (!topup) {
    topup = await stripe("POST", "/products", {
      name: "Valzacchi.ai — Credit Top-up",
      description: "On-demand AI credit purchase ($0.10 per credit)",
      metadata: { valz_credit_topup: "true" },
    });
    console.log(`✓ created top-up product: ${topup.id}`);
  } else {
    console.log(`· top-up product already exists: ${topup.id}`);
  }
  result.topup = { productId: topup.id };

  // ── Webhook ───────────────────────────────────────────────────────
  // Stripe's live mode rejects URLs that aren't publicly reachable, so we
  // only attempt webhook creation when NEXT_PUBLIC_APP_URL points at a
  // real https:// host. Otherwise we bail out with a clear instruction.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const webhookUrl = appUrl ? `${appUrl}/api/stripe/webhook` : null;
  const isPubliclyReachable = !!webhookUrl && /^https:\/\//.test(webhookUrl);

  if (!isPubliclyReachable) {
    console.log(
      `\n⚠️  Skipping webhook creation — NEXT_PUBLIC_APP_URL (${appUrl || "unset"}) is not a public https URL.`
    );
    console.log(
      `   After deploying, set NEXT_PUBLIC_APP_URL to your live domain and re-run this script,`
    );
    console.log(
      `   or create the endpoint manually in the Stripe Dashboard at:`
    );
    console.log(`     URL: <production_url>/api/stripe/webhook`);
    console.log(
      `     Events: checkout.session.completed, customer.subscription.created,`
    );
    console.log(
      `             customer.subscription.updated, customer.subscription.deleted,`
    );
    console.log(
      `             invoice.payment_succeeded, invoice.payment_failed`
    );
    console.log(`   Then paste the signing secret into STRIPE_WEBHOOK_SECRET in .env.local.`);
  } else {
    const events = [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_succeeded",
      "invoice.payment_failed",
    ];
    const endpoints = await stripe("GET", "/webhook_endpoints?limit=100");
    let endpoint = endpoints.data.find((e) => e.metadata?.valz_webhook === "primary");
    if (!endpoint) {
      endpoint = await stripe("POST", "/webhook_endpoints", {
        url: webhookUrl,
        enabled_events: events,
        description: "Valzacchi.ai primary webhook",
        metadata: { valz_webhook: "primary" },
      });
      console.log(`\n✓ created webhook ${endpoint.id} → ${webhookUrl}`);
      console.log(`  ⚠️  STRIPE_WEBHOOK_SECRET (paste into .env.local):`);
      console.log(`  ${endpoint.secret}`);
      result.webhook = { id: endpoint.id, url: endpoint.url, secret: endpoint.secret };
    } else {
      if (endpoint.url !== webhookUrl) {
        await stripe("POST", `/webhook_endpoints/${endpoint.id}`, {
          url: webhookUrl,
          enabled_events: events,
        });
        console.log(`\n✓ updated webhook URL to ${webhookUrl}`);
      } else {
        console.log(`\n· webhook already exists at ${endpoint.url}`);
      }
      result.webhook = { id: endpoint.id, url: endpoint.url };
    }
  }

  // ── Summary JSON ──────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("RESULT (use these IDs to update public.plans via supabase MCP):");
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
