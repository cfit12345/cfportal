// =====================================================
// Combat Fitness — ChurnShield Portal API
// Your own Churnkey-style retention + portal app
//
// Deploy to Railway (free): https://railway.app
// =====================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const Stripe = require('stripe');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =====================================================
// CONFIGURATION (set via environment variables)
// =====================================================
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = {
  base: {
    price_id: process.env.PRICE_BASE,      // e.g. price_ABC123
    display_name: 'Combat Fitness BASE',
    price_label: '$19/mo',
    amount: 1900,
  },
  one: {
    price_id: process.env.PRICE_ONE,        // e.g. price_DEF456
    display_name: 'Combat Fitness ONE',
    price_label: '$49/mo',
    amount: 4900,
  },
  pro: {
    price_id: process.env.PRICE_PRO,        // e.g. price_GHI789
    display_name: 'Combat Fitness PRO',
    price_label: '$99/mo',
    amount: 9900,
  },
};

// Discount offer config
const DISCOUNT = {
  percent: parseInt(process.env.DISCOUNT_PERCENT || '30'),
  duration_months: parseInt(process.env.DISCOUNT_MONTHS || '3'),
};

// Portal return URL
const PORTAL_RETURN_URL = process.env.PORTAL_RETURN_URL || 'https://combatfitness.co/account';

// Build reverse lookup: price_id → plan key
const PRICE_TO_PLAN = {};
Object.entries(PLANS).forEach(([key, val]) => {
  if (val.price_id) PRICE_TO_PLAN[val.price_id] = key;
});

// =====================================================
// GET /api/config
// Returns plan + discount info to the frontend
// =====================================================
app.get('/api/config', (req, res) => {
  // Send plan info (without secret price IDs)
  const plans = {};
  Object.entries(PLANS).forEach(([key, val]) => {
    plans[key] = {
      display_name: val.display_name,
      price_label: val.price_label,
    };
  });

  res.json({
    success: true,
    plans,
    discount: DISCOUNT,
  });
});

// =====================================================
// GET /api/subscription?customer_id=cus_XXX
// Returns the customer's current plan info
// =====================================================
app.get('/api/subscription', async (req, res) => {
  try {
    const { customer_id } = req.query;
    if (!customer_id) {
      return res.status(400).json({ success: false, error: 'customer_id is required' });
    }

    const customer = await stripe.customers.retrieve(customer_id);

    const subscriptions = await stripe.subscriptions.list({
      customer: customer_id,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return res.status(404).json({ success: false, error: 'No active subscription found.' });
    }

    const sub = subscriptions.data[0];
    const priceId = sub.items.data[0].price.id;
    const currentPlan = PRICE_TO_PLAN[priceId] || 'unknown';

    res.json({
      success: true,
      customer_id,
      email: customer.email,
      subscription_id: sub.id,
      current_plan: currentPlan,
      current_period_end: sub.current_period_end,
    });
  } catch (err) {
    console.error('[GET /api/subscription]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// POST /api/switch-plan
// Switches to a different plan (upgrade or downgrade)
// =====================================================
app.post('/api/switch-plan', async (req, res) => {
  try {
    const { customer_id, subscription_id, new_plan, is_upgrade } = req.body;
    if (!subscription_id || !new_plan || !PLANS[new_plan]) {
      return res.status(400).json({ success: false, error: 'Invalid request.' });
    }

    const sub = await stripe.subscriptions.retrieve(subscription_id);
    if (sub.customer !== customer_id) {
      return res.status(403).json({ success: false, error: 'Subscription mismatch.' });
    }

    const itemId = sub.items.data[0].id;
    const newPriceId = PLANS[new_plan].price_id;

    const updated = await stripe.subscriptions.update(subscription_id, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: is_upgrade ? 'always_invoice' : 'create_prorations',
    });

    res.json({
      success: true,
      new_plan,
      status: updated.status,
    });
  } catch (err) {
    console.error('[POST /api/switch-plan]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// POST /api/apply-discount
// Creates a coupon and applies it to the subscription
// =====================================================
app.post('/api/apply-discount', async (req, res) => {
  try {
    const { customer_id, subscription_id } = req.body;
    if (!subscription_id) {
      return res.status(400).json({ success: false, error: 'subscription_id is required.' });
    }

    const sub = await stripe.subscriptions.retrieve(subscription_id);
    if (sub.customer !== customer_id) {
      return res.status(403).json({ success: false, error: 'Subscription mismatch.' });
    }

    // Create a coupon for this retention offer
    const coupon = await stripe.coupons.create({
      percent_off: DISCOUNT.percent,
      duration: 'repeating',
      duration_in_months: DISCOUNT.duration_months,
      name: `Retention Offer — ${DISCOUNT.percent}% off for ${DISCOUNT.duration_months}mo`,
    });

    // Apply coupon to the subscription
    await stripe.subscriptions.update(subscription_id, {
      coupon: coupon.id,
    });

    res.json({ success: true, coupon_id: coupon.id });
  } catch (err) {
    console.error('[POST /api/apply-discount]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// POST /api/pause-subscription
// Pauses billing by setting cancel_at_period_end + metadata
// Note: True Stripe "pause" requires flexible billing mode.
// This approach cancels at period end as a "soft pause"
// and stores a flag so you can resume later.
// =====================================================
app.post('/api/pause-subscription', async (req, res) => {
  try {
    const { customer_id, subscription_id } = req.body;
    if (!subscription_id) {
      return res.status(400).json({ success: false, error: 'subscription_id is required.' });
    }

    const sub = await stripe.subscriptions.retrieve(subscription_id);
    if (sub.customer !== customer_id) {
      return res.status(403).json({ success: false, error: 'Subscription mismatch.' });
    }

    // "Pause" by pausing payment collection
    // Customer won't be billed but subscription stays active
    const updated = await stripe.subscriptions.update(subscription_id, {
      pause_collection: {
        behavior: 'void',   // Don't invoice during pause
      },
      metadata: {
        paused: 'true',
        paused_at: new Date().toISOString(),
        pause_reason: 'customer_requested',
      },
    });

    res.json({ success: true, status: updated.status });
  } catch (err) {
    console.error('[POST /api/pause-subscription]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// POST /api/cancel-subscription
// Cancels the subscription at end of billing period
// =====================================================
app.post('/api/cancel-subscription', async (req, res) => {
  try {
    const { customer_id, subscription_id, reason } = req.body;
    if (!subscription_id) {
      return res.status(400).json({ success: false, error: 'subscription_id is required.' });
    }

    const sub = await stripe.subscriptions.retrieve(subscription_id);
    if (sub.customer !== customer_id) {
      return res.status(403).json({ success: false, error: 'Subscription mismatch.' });
    }

    // Cancel at period end (they keep access until billing cycle ends)
    const updated = await stripe.subscriptions.update(subscription_id, {
      cancel_at_period_end: true,
      metadata: {
        cancel_reason: reason || 'not_specified',
        cancel_requested_at: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      cancel_at_period_end: updated.cancel_at_period_end,
      current_period_end: updated.current_period_end,
    });
  } catch (err) {
    console.error('[POST /api/cancel-subscription]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// POST /api/portal-session
// Opens Stripe's built-in portal for payment methods
// =====================================================
app.post('/api/portal-session', async (req, res) => {
  try {
    const { customer_id } = req.body;
    if (!customer_id) {
      return res.status(400).json({ success: false, error: 'customer_id is required.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer_id,
      return_url: PORTAL_RETURN_URL,
    });

    res.json({ success: true, url: session.url });
  } catch (err) {
    console.error('[POST /api/portal-session]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// Catch-all: serve the frontend for any other route
// =====================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =====================================================
// START
// =====================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ChurnShield Portal running on port ${PORT}`);
  console.log(`Plans configured: ${Object.keys(PLANS).filter(k => PLANS[k].price_id).join(', ') || 'NONE — set PRICE_BASE, PRICE_ONE, PRICE_PRO env vars'}`);
});
