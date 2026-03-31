// =====================================================
// Combat Fitness — ChurnShield Portal API
// Your own Churnkey-style retention + portal app
// Single file deployment with inlined HTML
//
// Deploy to Railway (free): https://railway.app
// =====================================================

const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

const app = express();
app.use(cors());
app.use(express.json());

// =====================================================
// CONFIGURATION (set via environment variables)
// =====================================================
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Plans are matched by PRODUCT ID (not price ID)
// This way it works regardless of which price (monthly, annual, etc.) the customer is on
// When switching plans, the app looks up the product's default_price from Stripe automatically
const PLANS = {
  base: {
    product_id: process.env.PRODUCT_BASE || 'prod_UFFcYjAjhRzrbG',
    default_price_id: process.env.PRICE_BASE || 'price_1TGl7WArcQhG1OgIH36d3WLn',
    display_name: 'Combat Fitness BASE',
    price_label: '$19/mo',
    amount: 1900,
  },
  one: {
    product_id: process.env.PRODUCT_ONE || 'prod_SDk8basy5YeQGQ',
    default_price_id: process.env.PRICE_ONE || 'price_1SXswCArcQhG1OgIsaNOm3Mt',
    display_name: 'Combat Fitness ONE',
    price_label: '$49/mo',
    amount: 4900,
  },
  pro: {
    product_id: process.env.PRODUCT_PRO || 'prod_TUslVxmWKHI7py',
    default_price_id: process.env.PRICE_PRO || 'price_1SXupiArcQhG1OgIJ8Wi2CMP',
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

// Build reverse lookup: product_id → plan key
function findPlanByProduct(productId) {
  for (const [key, val] of Object.entries(PLANS)) {
    if (val.product_id === productId) return key;
  }
  return 'unknown';
}

// =====================================================
// HTML Content (inlined from public/index.html)
// =====================================================
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manage Your Subscription — Combat Fitness</title>
  <style>
    :root {
      --brand: #1a1a2e;
      --brand-light: #16213e;
      --accent: #f59e0b;
      --accent-hover: #d97706;
      --green: #10b981;
      --green-bg: #ecfdf5;
      --red: #ef4444;
      --gray-50: #f9fafb;
      --gray-100: #f3f4f6;
      --gray-200: #e5e7eb;
      --gray-300: #d1d5db;
      --gray-400: #9ca3af;
      --gray-500: #6b7280;
      --gray-700: #374151;
      --gray-900: #111827;
      --radius: 14px;
      --radius-sm: 10px;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--gray-50);
      color: var(--gray-900);
      min-height: 100vh;
    }

    /* ===== LAYOUT ===== */
    .page-wrapper {
      max-width: 920px;
      margin: 0 auto;
      padding: 40px 24px 60px;
    }

    .page-header {
      text-align: center;
      margin-bottom: 36px;
    }

    .page-header .logo {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--brand);
      margin-bottom: 12px;
    }

    .page-header h1 {
      font-size: 28px;
      font-weight: 700;
      color: var(--gray-900);
      margin-bottom: 6px;
    }

    .page-header p {
      font-size: 15px;
      color: var(--gray-500);
    }

    /* ===== CURRENT PLAN BANNER ===== */
    .current-banner {
      background: linear-gradient(135deg, var(--brand) 0%, var(--brand-light) 100%);
      border-radius: var(--radius);
      padding: 28px 32px;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 28px;
    }

    .current-banner .label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: rgba(255,255,255,0.55);
      margin-bottom: 6px;
    }

    .current-banner .plan-name {
      font-size: 26px;
      font-weight: 700;
    }

    .current-banner .plan-price {
      font-size: 14px;
      color: rgba(255,255,255,0.65);
      margin-top: 2px;
    }

    .status-badge {
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 100px;
      padding: 8px 20px;
      font-size: 13px;
      font-weight: 600;
      color: #4ade80;
    }

    /* ===== PLAN CARDS ===== */
    .plans-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 18px;
      margin-bottom: 28px;
    }

    @media (max-width: 700px) {
      .plans-grid { grid-template-columns: 1fr; }
    }

    .plan-card {
      background: #fff;
      border: 2px solid var(--gray-200);
      border-radius: var(--radius);
      padding: 26px 22px;
      text-align: center;
      position: relative;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .plan-card:hover {
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    }

    .plan-card.is-current {
      border-color: var(--brand);
      background: #fafaff;
    }

    .plan-card .tag {
      position: absolute;
      top: -11px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      padding: 4px 14px;
      border-radius: 100px;
      white-space: nowrap;
    }

    .tag-current { background: var(--brand); color: #fff; }
    .tag-popular { background: linear-gradient(135deg, var(--accent), var(--accent-hover)); color: #fff; }

    .plan-card h3 { font-size: 18px; font-weight: 700; margin-top: 4px; }

    .plan-card .price {
      font-size: 34px;
      font-weight: 800;
      margin: 10px 0 2px;
    }

    .plan-card .price span { font-size: 14px; font-weight: 400; color: var(--gray-500); }
    .plan-card .desc { font-size: 13px; color: var(--gray-500); margin-bottom: 18px; line-height: 1.5; }

    .plan-card ul {
      list-style: none;
      text-align: left;
      margin-bottom: 22px;
    }

    .plan-card ul li {
      font-size: 13.5px;
      color: var(--gray-700);
      padding: 5px 0 5px 22px;
      position: relative;
    }

    .plan-card ul li::before {
      content: '\\2713';
      position: absolute;
      left: 0;
      color: var(--green);
      font-weight: 700;
    }

    /* ===== BUTTONS ===== */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 12px 20px;
      border-radius: var(--radius-sm);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
      text-decoration: none;
    }

    .btn-upgrade { background: linear-gradient(135deg, var(--accent), var(--accent-hover)); color: #fff; }
    .btn-upgrade:hover { filter: brightness(1.08); transform: translateY(-1px); }

    .btn-downgrade { background: var(--gray-100); color: var(--gray-700); border: 1px solid var(--gray-300); }
    .btn-downgrade:hover { background: var(--gray-200); }

    .btn-current { background: var(--green-bg); color: var(--green); border: 1px solid #bbf7d0; cursor: default; }

    .btn-primary { background: var(--brand); color: #fff; }
    .btn-primary:hover { background: var(--brand-light); }

    .btn-outline { background: #fff; color: var(--gray-700); border: 1px solid var(--gray-300); }
    .btn-outline:hover { background: var(--gray-100); }

    .btn-danger { background: #fef2f2; color: var(--red); border: 1px solid #fecaca; }
    .btn-danger:hover { background: #fee2e2; }

    .btn-accent { background: linear-gradient(135deg, var(--accent), var(--accent-hover)); color: #fff; }
    .btn-accent:hover { filter: brightness(1.08); }

    .btn-green { background: var(--green); color: #fff; }
    .btn-green:hover { background: #059669; }

    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; filter: none !important; }

    /* ===== FOOTER LINKS ===== */
    .portal-links {
      display: flex;
      justify-content: center;
      gap: 32px;
      margin-bottom: 12px;
    }

    .portal-links a {
      font-size: 14px;
      color: #6366f1;
      text-decoration: none;
      font-weight: 500;
    }

    .portal-links a:hover { text-decoration: underline; }

    .cancel-row {
      text-align: center;
      padding-top: 16px;
      border-top: 1px solid var(--gray-200);
      margin-top: 8px;
    }

    .cancel-link {
      font-size: 13.5px;
      color: var(--gray-400);
      text-decoration: none;
      cursor: pointer;
      background: none;
      border: none;
      font-family: inherit;
    }

    .cancel-link:hover { color: var(--red); text-decoration: underline; }

    /* ===== MODAL OVERLAY ===== */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 500;
      align-items: center;
      justify-content: center;
      padding: 24px;
      animation: fadeIn 0.2s;
    }

    .modal-overlay.active { display: flex; }

    .modal {
      background: #fff;
      border-radius: 18px;
      width: 100%;
      max-width: 520px;
      overflow: hidden;
      box-shadow: 0 24px 64px rgba(0,0,0,0.2);
      animation: slideUp 0.25s ease-out;
    }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

    .modal-header {
      padding: 28px 28px 0;
      text-align: center;
    }

    .modal-header .emoji { font-size: 40px; margin-bottom: 12px; }
    .modal-header h2 { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
    .modal-header p { font-size: 14.5px; color: var(--gray-500); line-height: 1.5; }

    .modal-body { padding: 24px 28px; }
    .modal-footer { padding: 0 28px 28px; display: flex; flex-direction: column; gap: 10px; }

    /* Reason buttons */
    .reason-list { display: flex; flex-direction: column; gap: 8px; }

    .reason-btn {
      display: block;
      width: 100%;
      padding: 14px 18px;
      background: #fff;
      border: 1.5px solid var(--gray-200);
      border-radius: var(--radius-sm);
      font-size: 14.5px;
      color: var(--gray-700);
      text-align: left;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      font-family: inherit;
    }

    .reason-btn:hover { border-color: var(--brand); background: #fafaff; }

    /* Offer card */
    .offer-card {
      background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
      border: 2px solid #fcd34d;
      border-radius: var(--radius);
      padding: 24px;
      text-align: center;
      margin-bottom: 8px;
    }

    .offer-card .offer-badge {
      display: inline-block;
      background: var(--accent);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      padding: 4px 12px;
      border-radius: 100px;
      margin-bottom: 12px;
    }

    .offer-card h3 { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
    .offer-card p { font-size: 14px; color: var(--gray-700); line-height: 1.5; }

    /* ===== LOADING ===== */
    .loading-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(255,255,255,0.88);
      z-index: 600;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 16px;
    }

    .loading-overlay.active { display: flex; }

    .spinner {
      width: 36px;
      height: 36px;
      border: 4px solid var(--gray-200);
      border-top-color: var(--brand);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .loading-overlay p { font-size: 15px; font-weight: 600; color: var(--gray-900); }

    /* ===== TOAST ===== */
    .toast {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      padding: 14px 28px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      z-index: 700;
      transition: transform 0.3s;
      box-shadow: 0 8px 28px rgba(0,0,0,0.18);
      color: #fff;
    }

    .toast.show { transform: translateX(-50%) translateY(0); }
    .toast.success { background: var(--green); }
    .toast.error { background: var(--red); }

    /* ===== STEP HIDDEN ===== */
    .step { display: none; }
    .step.active { display: block; }

    /* ===== CONFIRM CANCEL ===== */
    .final-warning {
      background: #fef2f2;
      border: 1.5px solid #fecaca;
      border-radius: var(--radius-sm);
      padding: 18px;
      margin-bottom: 8px;
    }

    .final-warning p { font-size: 14px; color: #991b1b; line-height: 1.5; }

    /* ===== SUCCESS SCREEN ===== */
    .success-check {
      width: 60px;
      height: 60px;
      background: var(--green-bg);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-size: 28px;
    }
  </style>
</head>
<body>

  <!-- Loading -->
  <div class="loading-overlay" id="loader">
    <div class="spinner"></div>
    <p id="loaderText">Loading your subscription...</p>
  </div>

  <!-- Toast -->
  <div class="toast" id="toast"></div>

  <!-- ===== MAIN PORTAL ===== -->
  <div class="page-wrapper" id="portal">
    <div class="page-header">
      <div class="logo">Combat Fitness</div>
      <h1>Manage Your Subscription</h1>
      <p>Switch plans, update billing, or manage your account.</p>
    </div>

    <!-- Current Plan Banner -->
    <div class="current-banner">
      <div>
        <div class="label">Current Plan</div>
        <div class="plan-name" id="bannerName">—</div>
        <div class="plan-price" id="bannerPrice"></div>
      </div>
      <div class="status-badge" id="bannerStatus">Active</div>
    </div>

    <!-- Plan Cards -->
    <div class="plans-grid" id="plansGrid">
      <div class="plan-card" id="card-base" data-plan="base">
        <div class="tag tag-current" id="tag-base" style="display:none">Your Plan</div>
        <h3>BASE</h3>
        <div class="price">$19<span>/mo</span></div>
        <p class="desc">The fundamentals to get started.</p>
        <ul>
          <li>Base workout library</li>
          <li>Weekly training plan</li>
          <li>Community access</li>
        </ul>
        <button class="btn" id="btn-base" onclick="handlePlanClick('base')"></button>
      </div>

      <div class="plan-card" id="card-one" data-plan="one">
        <div class="tag tag-current" id="tag-one" style="display:none">Your Plan</div>
        <h3>ONE</h3>
        <div class="price">$49<span>/mo</span></div>
        <p class="desc">Level up your training.</p>
        <ul>
          <li>Everything in BASE</li>
          <li>Personalized programming</li>
          <li>Nutrition guidance</li>
          <li>Monthly check-ins</li>
        </ul>
        <button class="btn" id="btn-one" onclick="handlePlanClick('one')"></button>
      </div>

      <div class="plan-card" id="card-pro" data-plan="pro">
        <div class="tag tag-popular" id="tag-pro-pop" style="display:none">Most Popular</div>
        <div class="tag tag-current" id="tag-pro" style="display:none">Your Plan</div>
        <h3>PRO</h3>
        <div class="price">$99<span>/mo</span></div>
        <p class="desc">The full Combat Fitness experience.</p>
        <ul>
          <li>Everything in ONE</li>
          <li>1-on-1 coaching calls</li>
          <li>Priority support</li>
          <li>Exclusive content &amp; events</li>
        </ul>
        <button class="btn" id="btn-pro" onclick="handlePlanClick('pro')"></button>
      </div>
    </div>

    <!-- Links -->
    <div class="portal-links">
      <a href="#" onclick="openPaymentPortal(); return false;">Update payment method</a>
      <a href="#" onclick="openPaymentPortal(); return false;">Billing history</a>
    </div>

    <div class="cancel-row">
      <button class="cancel-link" onclick="openCancelFlow()">I'd like to cancel my subscription</button>
    </div>
  </div>

  <!-- ===== CANCEL / RETENTION MODAL ===== -->
  <div class="modal-overlay" id="modalOverlay">
    <div class="modal">

      <!-- STEP 1 : Why are you canceling? -->
      <div class="step active" id="step-reason">
        <div class="modal-header">
          <div class="emoji">😔</div>
          <h2>We're sorry to see you go</h2>
          <p>Before you cancel, could you tell us why? It helps us get better.</p>
        </div>
        <div class="modal-body">
          <div class="reason-list">
            <button class="reason-btn" onclick="selectReason('too_expensive')">It's too expensive</button>
            <button class="reason-btn" onclick="selectReason('not_using')">I'm not using it enough</button>
            <button class="reason-btn" onclick="selectReason('missing_features')">It's missing features I need</button>
            <button class="reason-btn" onclick="selectReason('switching')">I'm switching to something else</button>
            <button class="reason-btn" onclick="selectReason('other')">Other reason</button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeModal()">Never mind, go back</button>
        </div>
      </div>

      <!-- STEP 2 : Retention Offer -->
      <div class="step" id="step-offer">
        <div class="modal-header">
          <div class="emoji" id="offerEmoji">🎁</div>
          <h2 id="offerTitle">We've got something for you</h2>
          <p id="offerSubtitle">How about this instead?</p>
        </div>
        <div class="modal-body">
          <div class="offer-card">
            <div class="offer-badge" id="offerBadge">Special Offer</div>
            <h3 id="offerHeadline">—</h3>
            <p id="offerDescription">—</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-accent" id="acceptOfferBtn" onclick="acceptOffer()">Accept This Offer</button>
          <button class="btn btn-outline" onclick="declineOffer()">No thanks, continue canceling</button>
        </div>
      </div>

      <!-- STEP 3 : Pause Offer (fallback) -->
      <div class="step" id="step-pause">
        <div class="modal-header">
          <div class="emoji">⏸️</div>
          <h2>How about a pause instead?</h2>
          <p>Take a break and come back when you're ready. Your data and progress stay safe.</p>
        </div>
        <div class="modal-body">
          <div class="offer-card" style="background: linear-gradient(135deg, #eff6ff, #dbeafe); border-color: #93c5fd;">
            <div class="offer-badge" style="background: #3b82f6;">Pause Option</div>
            <h3>Pause for 1 month</h3>
            <p>We'll pause your billing and keep everything saved. Resume anytime with one click.</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-green" onclick="acceptPause()">Pause My Subscription</button>
          <button class="btn btn-outline" onclick="goToFinalConfirm()">No thanks, I want to cancel</button>
        </div>
      </div>

      <!-- STEP 4 : Final Confirmation -->
      <div class="step" id="step-confirm">
        <div class="modal-header">
          <div class="emoji">⚠️</div>
          <h2>Confirm Cancellation</h2>
          <p>This will cancel your subscription at the end of your current billing period.</p>
        </div>
        <div class="modal-body">
          <div class="final-warning">
            <p>You'll lose access to all <strong id="confirmPlanName">—</strong> features on <strong id="confirmDate">—</strong>. This action can't be undone from here.</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-danger" onclick="confirmCancel()">Yes, Cancel My Subscription</button>
          <button class="btn btn-primary" onclick="closeModal()">Keep My Subscription</button>
        </div>
      </div>

      <!-- STEP 5 : Cancelled -->
      <div class="step" id="step-cancelled">
        <div class="modal-header">
          <div class="success-check">👋</div>
          <h2>Your subscription has been canceled</h2>
          <p>You'll still have access until the end of your current billing period. We hope to see you back someday.</p>
        </div>
        <div class="modal-body"></div>
        <div class="modal-footer">
          <button class="btn btn-primary" onclick="closeModal(); location.reload();">Close</button>
        </div>
      </div>

      <!-- STEP : Offer Accepted (success) -->
      <div class="step" id="step-saved">
        <div class="modal-header">
          <div class="success-check">🎉</div>
          <h2 id="savedTitle">You're all set!</h2>
          <p id="savedMessage">Your changes have been applied.</p>
        </div>
        <div class="modal-body"></div>
        <div class="modal-footer">
          <button class="btn btn-primary" onclick="closeModal(); location.reload();">Close</button>
        </div>
      </div>

    </div>
  </div>

<script>
/* =========================================================
   CONFIG — the server provides plan info at /api/config
   ========================================================= */
let CONFIG = {};
let state = {
  customerId: null,
  subscriptionId: null,
  currentPlan: null,
  email: '',
  periodEnd: null,
  cancelReason: null,
};

const PLAN_ORDER = ['base', 'one', 'pro'];

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  state.customerId = params.get('customer_id');

  if (!state.customerId) {
    showToast('No customer ID found. Please access this page from your account link.', 'error');
    return;
  }

  try {
    showLoader('Loading your subscription...');

    // Fetch config (plans, discount info)
    const cfgRes = await api('/api/config');
    CONFIG = cfgRes;

    // Fetch subscription
    const sub = await api(\`/api/subscription?customer_id=\${state.customerId}\`);
    state.subscriptionId = sub.subscription_id;
    state.currentPlan = sub.current_plan;
    state.email = sub.email || '';
    state.periodEnd = sub.current_period_end;

    renderPortal();
    hideLoader();
  } catch (err) {
    hideLoader();
    showToast(err.message || 'Could not load your subscription.', 'error');
  }
});

/* =========================================================
   RENDER
   ========================================================= */
function renderPortal() {
  const plan = CONFIG.plans[state.currentPlan];
  document.getElementById('bannerName').textContent = plan.display_name;
  document.getElementById('bannerPrice').textContent = plan.price_label;

  const curIdx = PLAN_ORDER.indexOf(state.currentPlan);

  PLAN_ORDER.forEach((key, idx) => {
    const card = document.getElementById(\`card-\${key}\`);
    const btn = document.getElementById(\`btn-\${key}\`);
    const tagCurrent = document.getElementById(\`tag-\${key}\`);
    const tagPop = document.getElementById(\`tag-\${key}-pop\`);

    card.classList.remove('is-current');
    if (tagCurrent) tagCurrent.style.display = 'none';
    if (tagPop) tagPop.style.display = 'none';

    if (key === state.currentPlan) {
      card.classList.add('is-current');
      tagCurrent.style.display = '';
      btn.className = 'btn btn-current';
      btn.textContent = 'Current Plan';
      btn.disabled = true;
    } else if (idx > curIdx) {
      if (key === 'pro' && state.currentPlan !== 'pro') {
        tagPop.style.display = '';
      }
      btn.className = 'btn btn-upgrade';
      btn.textContent = \`Upgrade to \${CONFIG.plans[key].display_name}\`;
      btn.disabled = false;
    } else {
      btn.className = 'btn btn-downgrade';
      btn.textContent = \`Downgrade to \${CONFIG.plans[key].display_name}\`;
      btn.disabled = false;
    }
  });
}

/* =========================================================
   PLAN SWITCH
   ========================================================= */
async function handlePlanClick(newPlan) {
  if (newPlan === state.currentPlan) return;

  const isUpgrade = PLAN_ORDER.indexOf(newPlan) > PLAN_ORDER.indexOf(state.currentPlan);
  const planLabel = CONFIG.plans[newPlan].display_name;
  const msg = isUpgrade
    ? \`Upgrade to \${planLabel} (\${CONFIG.plans[newPlan].price_label})?\n\nYou'll be charged the prorated difference now.\`
    : \`Downgrade to \${planLabel} (\${CONFIG.plans[newPlan].price_label})?\n\nThe change takes effect at your next billing date.\`;

  if (!confirm(msg)) return;

  try {
    showLoader(\`Switching to \${planLabel}...\`);
    await api('/api/switch-plan', {
      method: 'POST',
      body: {
        customer_id: state.customerId,
        subscription_id: state.subscriptionId,
        new_plan: newPlan,
        is_upgrade: isUpgrade,
      },
    });
    state.currentPlan = newPlan;
    renderPortal();
    hideLoader();
    showToast(\`You're now on \${planLabel}!\`, 'success');
  } catch (err) {
    hideLoader();
    showToast(err.message || 'Something went wrong.', 'error');
  }
}

/* =========================================================
   PAYMENT PORTAL
   ========================================================= */
async function openPaymentPortal() {
  try {
    showLoader('Opening billing portal...');
    const data = await api('/api/portal-session', {
      method: 'POST',
      body: { customer_id: state.customerId },
    });
    hideLoader();
    window.location.href = data.url;
  } catch (err) {
    hideLoader();
    showToast('Could not open billing portal.', 'error');
  }
}

/* =========================================================
   CANCEL / RETENTION FLOW
   ========================================================= */
function openCancelFlow() {
  state.cancelReason = null;
  showStep('step-reason');
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  // Reset all steps
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.querySelector('#step-reason').classList.add('active');
}

function showStep(id) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* Step 1 → Step 2 : Pick reason, show targeted offer */
function selectReason(reason) {
  state.cancelReason = reason;

  const offers = CONFIG.retention_offers || {};
  let offer;

  if (reason === 'too_expensive') {
    // Show discount OR downgrade depending on plan
    if (state.currentPlan !== 'base') {
      // Offer downgrade first
      const downgradeTo = PLAN_ORDER[PLAN_ORDER.indexOf(state.currentPlan) - 1];
      offer = {
        emoji: '💰',
        title: 'How about a lower plan?',
        subtitle: 'Save money without losing everything.',
        badge: 'Save Money',
        headline: \`Switch to \${CONFIG.plans[downgradeTo].display_name} — \${CONFIG.plans[downgradeTo].price_label}\`,
        description: \`Keep your access at a lower price. You can always upgrade again later.\`,
        action: 'downgrade',
        action_plan: downgradeTo,
      };
    } else {
      offer = buildDiscountOffer();
    }
  } else if (reason === 'not_using') {
    // Show pause
    showStep('step-pause');
    return;
  } else {
    offer = buildDiscountOffer();
  }

  // Populate offer step
  document.getElementById('offerEmoji').textContent = offer.emoji;
  document.getElementById('offerTitle').textContent = offer.title;
  document.getElementById('offerSubtitle').textContent = offer.subtitle;
  document.getElementById('offerBadge').textContent = offer.badge;
  document.getElementById('offerHeadline').textContent = offer.headline;
  document.getElementById('offerDescription').textContent = offer.description;

  // Store offer action
  state.currentOffer = offer;
  showStep('step-offer');
}

function buildDiscountOffer() {
  const d = CONFIG.discount || { percent: 30, duration_months: 3 };
  return {
    emoji: '🎁',
    title: 'We\'ve got something special for you',
    subtitle: 'How about a discount to stick around?',
    badge: 'Exclusive Offer',
    headline: \`\${d.percent}% off for \${d.duration_months} month\${d.duration_months > 1 ? 's' : ''}\`,
    description: \`Stay on your current plan and save \${d.percent}% on your next \${d.duration_months} payment\${d.duration_months > 1 ? 's' : ''}. No strings attached.\`,
    action: 'discount',
  };
}

/* Step 2 : Accept offer */
async function acceptOffer() {
  const offer = state.currentOffer;
  try {
    if (offer.action === 'downgrade') {
      showLoader(\`Switching to \${CONFIG.plans[offer.action_plan].display_name}...\`);
      await api('/api/switch-plan', {
        method: 'POST',
        body: {
          customer_id: state.customerId,
          subscription_id: state.subscriptionId,
          new_plan: offer.action_plan,
          is_upgrade: false,
        },
      });
      state.currentPlan = offer.action_plan;
      hideLoader();
      document.getElementById('savedTitle').textContent = 'Plan updated!';
      document.getElementById('savedMessage').textContent = \`You've been switched to \${CONFIG.plans[offer.action_plan].display_name}. Glad to keep you on board!\`;
    } else if (offer.action === 'discount') {
      showLoader('Applying your discount...');
      await api('/api/apply-discount', {
        method: 'POST',
        body: {
          customer_id: state.customerId,
          subscription_id: state.subscriptionId,
        },
      });
      hideLoader();
      document.getElementById('savedTitle').textContent = 'Discount applied!';
      document.getElementById('savedMessage').textContent = \`Your \${CONFIG.discount.percent}% discount has been applied for the next \${CONFIG.discount.duration_months} month(s). Enjoy!\`;
    }
    showStep('step-saved');
  } catch (err) {
    hideLoader();
    showToast(err.message || 'Something went wrong.', 'error');
  }
}

/* Step 2 : Decline offer → show pause (if not already shown) */
function declineOffer() {
  if (state.cancelReason === 'not_using') {
    goToFinalConfirm();
  } else {
    showStep('step-pause');
  }
}

/* Pause */
async function acceptPause() {
  try {
    showLoader('Pausing your subscription...');
    await api('/api/pause-subscription', {
      method: 'POST',
      body: {
        customer_id: state.customerId,
        subscription_id: state.subscriptionId,
      },
    });
    hideLoader();
    document.getElementById('savedTitle').textContent = 'Subscription paused!';
    document.getElementById('savedMessage').textContent = 'Your billing is paused. We\'ll be here when you\'re ready to come back. You can resume anytime.';
    showStep('step-saved');
  } catch (err) {
    hideLoader();
    showToast(err.message || 'Could not pause subscription.', 'error');
  }
}

/* Final confirm */
function goToFinalConfirm() {
  const plan = CONFIG.plans[state.currentPlan];
  document.getElementById('confirmPlanName').textContent = plan.display_name;
  if (state.periodEnd) {
    const d = new Date(state.periodEnd * 1000);
    document.getElementById('confirmDate').textContent = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  showStep('step-confirm');
}

/* Actually cancel */
async function confirmCancel() {
  try {
    showLoader('Canceling your subscription...');
    await api('/api/cancel-subscription', {
      method: 'POST',
      body: {
        customer_id: state.customerId,
        subscription_id: state.subscriptionId,
        reason: state.cancelReason,
      },
    });
    hideLoader();
    showStep('step-cancelled');
  } catch (err) {
    hideLoader();
    showToast(err.message || 'Could not cancel.', 'error');
  }
}

/* =========================================================
   HELPERS
   ========================================================= */
async function api(path, opts = {}) {
  const url = path.startsWith('http') ? path : path;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data;
}

function showLoader(text) {
  document.getElementById('loaderText').textContent = text;
  document.getElementById('loader').classList.add('active');
}

function hideLoader() {
  document.getElementById('loader').classList.remove('active');
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = \`toast \${type} show\`;
  setTimeout(() => t.classList.remove('show'), 4500);
}
</script>

</body>
</html>
`;

// =====================================================
// GET /
// Serve the inlined HTML frontend
// =====================================================
app.get('/', (req, res) => {
  res.send(HTML_CONTENT);
});

// =====================================================
// GET /api/config
// Returns plan + discount info to the frontend
// =====================================================
app.get('/api/config', (req, res) => {
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
// Matches by PRODUCT ID so it works for any price
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
      expand: ['data.items.data.price.product'],
      limit: 10,
    });

    if (subscriptions.data.length === 0) {
      return res.status(404).json({ success: false, error: 'No active subscription found.' });
    }

    // Find the subscription that matches one of our products
    let matchedSub = null;
    let currentPlan = 'unknown';

    for (const sub of subscriptions.data) {
      for (const item of sub.items.data) {
        // Get the product ID — it might be a string or an expanded object
        const productId = typeof item.price.product === 'string'
          ? item.price.product
          : item.price.product.id;

        const plan = findPlanByProduct(productId);
        if (plan !== 'unknown') {
          matchedSub = sub;
          currentPlan = plan;
          break;
        }
      }
      if (matchedSub) break;
    }

    if (!matchedSub) {
      return res.status(404).json({ success: false, error: 'No matching subscription found for your products.' });
    }

    res.json({
      success: true,
      customer_id,
      email: customer.email,
      subscription_id: matchedSub.id,
      current_plan: currentPlan,
      current_period_end: matchedSub.current_period_end,
    });
  } catch (err) {
    console.error('[GET /api/subscription]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// POST /api/switch-plan
// Switches to a different plan's default price
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

    // Use the configured default price for the plan being switched to
    const newPriceId = PLANS[new_plan].default_price_id;

    if (!newPriceId) {
      return res.status(400).json({ success: false, error: 'No default price configured for this plan.' });
    }

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

    const coupon = await stripe.coupons.create({
      percent_off: DISCOUNT.percent,
      duration: 'repeating',
      duration_in_months: DISCOUNT.duration_months,
      name: 'Retention Offer — ' + DISCOUNT.percent + '% off for ' + DISCOUNT.duration_months + 'mo',
    });

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
// Pauses billing by pausing payment collection
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

    const updated = await stripe.subscriptions.update(subscription_id, {
      pause_collection: {
        behavior: 'void',
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
// START
// =====================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('ChurnShield Portal running on port ' + PORT);
  console.log('Products configured: ' + (Object.keys(PLANS).filter(k => PLANS[k].product_id).join(', ') || 'NONE — set PRODUCT_BASE, PRODUCT_ONE, PRODUCT_PRO env vars'));
});
