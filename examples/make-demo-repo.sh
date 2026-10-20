#!/usr/bin/env bash
# Builds a small demo repository with three agent worktrees that clash the way
# parallel Claude Code agents typically do. Usage: ./make-demo-repo.sh [target-dir]
set -euo pipefail

TARGET="${1:-$PWD/lanekeeper-demo}"
if [ -e "$TARGET" ]; then
  echo "Target already exists: $TARGET" >&2
  exit 1
fi

mkdir -p "$TARGET/shop"
cd "$TARGET/shop"
git init -q -b main
git config user.email "demo@example.com"
git config user.name "Lanekeeper demo"

mkdir -p src/payments src/checkout src/product
cat > src/payments/PaymentService.ts <<'EOF'
export class PaymentService {
  charge(amount: number) {
    return { ok: true, amount };
  }
}
EOF
cat > src/checkout/useCheckout.ts <<'EOF'
import { PaymentService } from '../payments/PaymentService';

export function useCheckout() {
  const payments = new PaymentService();
  return (amount: number) => payments.charge(amount);
}
EOF
cat > src/product/ProductPage.tsx <<'EOF'
export function ProductPage({ product }) {
  return <h1>{product.name}</h1>;
}
EOF
cat > package-lock.json <<'EOF'
{
  "name": "shop",
  "lockfileVersion": 3,
  "packages": {
    "": { "name": "shop" },
    "node_modules/react": { "version": "18.3.1" }
  }
}
EOF
git add -A && git commit -qm "Initial shop"

git worktree add -q -b agent/stripe ../shop-stripe
git worktree add -q -b agent/paypal ../shop-paypal
git worktree add -q -b agent/product-page ../shop-product-page

# Agent A: replaces PaymentService with a Stripe implementation.
cd ../shop-stripe
git rm -q src/payments/PaymentService.ts
mkdir -p src/payments
cat > src/payments/StripePaymentService.ts <<'EOF'
export class StripePaymentService {
  charge(amount: number) {
    return { ok: true, amount, provider: 'stripe' };
  }
}
EOF
cat > src/checkout/useCheckout.ts <<'EOF'
import { StripePaymentService } from '../payments/StripePaymentService';

export function useCheckout() {
  const payments = new StripePaymentService();
  return (amount: number) => payments.charge(amount);
}
EOF
sed -i.bak 's#"node_modules/react": { "version": "18.3.1" }#"node_modules/react": { "version": "18.3.1" },\n    "node_modules/stripe": { "version": "17.2.0" }#' package-lock.json && rm -f package-lock.json.bak
git add -A && git commit -qm "Replace PaymentService with StripePaymentService"

# Agents B (paypal) and C (product-page) start with clean worktrees, so the clash
# lights up live while they work. Suggested prompts:
cat <<MSG
Demo repository ready: $TARGET/shop (worktrees: shop-stripe, shop-paypal, shop-product-page)

Agent A (shop-stripe) has already replaced PaymentService. Now start two agents:
  cd $TARGET/shop-paypal       && claude --plugin-dir <path-to-lanekeeper>
    "Add a refund(amount) method to PaymentService in src/payments/PaymentService.ts"
    (optional, for the lockfile clash: "also add node_modules/@paypal/sdk 1.4.0 to package-lock.json")
  cd $TARGET/shop-product-page && claude --plugin-dir <path-to-lanekeeper>
    "Add a short description paragraph under the heading in src/product/ProductPage.tsx"
Then run /lanekeeper:clashes in any of them.
MSG
