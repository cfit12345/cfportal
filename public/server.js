// =====================================================
// Combat Fitness — Customer Portal Backend API
// Deploy on Railway, Render, or Vercel
// =====================================================

const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

const app = express();

// =====================================================
// CONFIGURATION — UPDATE THESE VALUES
// =====================================================
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_live_XXXXXXXXXXXX');

const PRICE_IDS = {
  base: process.env.PRICE_BASE || 'price_XXXXXXXXXXXXXXXXX', // Combat Fitness BASE $19/mo
  one:  process.env.PRICE_ONE  || 'price_XXXXXXXXXXXXXXXXX', // Combat Fitness ONE  $49/mo
  pro:  process.env.PRICE_PRO  || 'price_XXXXXXXXXXXXXXXXX', // Combat Fitness PRO  $99/mo
};

// Reverse lookup: price_id → plan name
const PRICE_TO_PLAN = {};
Object.entries(PRICE_IDS).forEach(([plan, priceId]) => {
  PRICE_TO_PLAN[priceId] = plan;
});

// The URL customers return to after managing payment methods
const PORTAL_RETURN_URL = process.env.PORTAL_RETURN_URL || 'https://combatfitness.co/account';

// =====================================================
// MIDDLEWARE
// =====================================================
app.use(cors());
app.use(express.json());

// =====================================================
// GET /api/subscription
// Returns the customer's current plan info
// Query params: customer_id=cus_XXXX
// =====================================================
app.get('/api/subscription', async (req, res) => {
  try {
    const { customer_id } = req.query;
    if (!customer_id) {
      return res.status(400).json({ success: false, error: 'customer_id is required' });
    }

    // Fetch customer details
    const customer = await stripe.customers.retrieve(customer_id);

    // Fetch active subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customer_id,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return res.status(404).json({ success: false, error: 'No active subscription found' });
    }

    const subscription = subscriptions.data[0];
    const priceId = subscription.items.data[0].price.id;
    const currentPlan = PRICE_TO_PLAN[priceId] || 'unknown';

    res.json({
      success: true,
      customer_id: customer_id,
      email: customer.email,
      subscription_id: subscription.id,
      current_plan: currentPlan,
      current_price_id: priceId,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
    });
  } catch (err) {
    console.error('Error fetching subscription:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// POST /api/switch-plan
// Switches the customer's subscription to a new price
// Body: { customer_id, subscription_id, new_price_id, proration_behavior }
// =====================================================
app.post('/api/switch-plan', async (req, res) => {
  try {
    const { customer_id, subscription_id, new_price_id, proration_behavior } = req.body;

    if (!subscription_id || !new_price_id) {
      return res.status(400).json({ success: false, error: 'subscription_id and new_price_id are required' });
    }

    // Fetch the current subscription
    const subscription = await stripe.subscriptions.retrieve(subscription_id);

    // Verify this subscription belongs to the customer
    if (subscription.customer !== customer_id) {
      return res.status(403).json({ success: false, error: 'Subscription does not belong to this customer' });
    }

    const currentItemId = subscription.items.data[0].id;

    // Determine proration behavior:
    //   - Upgrades: 'always_invoice' (charge immediately)
    //   - Downgrades: 'create_prorations' (apply at next billing)
    const behavior = proration_behavior || 'create_prorations';

    // Update the subscription to the new price
    const updatedSubscription = await stripe.subscriptions.update(subscription_id, {
      items: [{
        id: currentItemId,
        price: new_price_id,
      }],
      proration_behavior: behavior,
    });

    const newPlan = PRICE_TO_PLAN[new_price_id] || 'unknown';

    res.json({
      success: true,
      subscription_id: updatedSubscription.id,
      new_plan: newPlan,
      new_price_id: new_price_id,
      status: updatedSubscription.status,
    });
  } catch (err) {
    console.error('Error switching plan:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// POST /api/portal-session
// Creates a Stripe portal session (payment method management only)
// Body: { customer_id }
// =====================================================
app.post('/api/portal-session', async (req, res) => {
  try {
    const { customer_id } = req.body;
    if (!customer_id) {
      return res.status(400).json({ success: false, error: 'customer_id is required' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer_id,
      return_url: PORTAL_RETURN_URL,
    });

    res.json({
      success: true,
      url: session.url,
    });
  } catch (err) {
    console.error('Error creating portal session:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// Health check
// =====================================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =====================================================
// START SERVER
// =====================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Combat Fitness Portal API running on port ${PORT}`);
});
