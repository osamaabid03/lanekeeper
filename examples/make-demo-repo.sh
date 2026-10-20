#!/usr/bin/env bash
# Builds a small demo repository with three agent worktrees. One agent (stripe) has already renamed a method
# that another agent (paypal) is about to call from a new file: the two branches merge cleanly in Git and
# still break. Usage: ./make-demo-repo.sh [target-dir]
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
    "node_modules/lodash": { "version": "4.17.21" },
    "node_modules/react": { "version": "18.3.1" },
    "node_modules/zod": { "version": "3.23.8" }
  }
}
EOF
git add -A && git commit -qm "Initial shop"

git worktree add -q -b agent/stripe ../shop-stripe
git worktree add -q -b agent/paypal ../shop-paypal
git worktree add -q -b agent/product-page ../shop-product-page

# Agent A (stripe) has already renamed charge() to createPayment() and updated its caller.
cd ../shop-stripe
cat > src/payments/PaymentService.ts <<'EOF'
export class PaymentService {
  createPayment(amount: number) {
    return { ok: true, amount, provider: 'stripe' };
  }
}
EOF
cat > src/checkout/useCheckout.ts <<'EOF'
import { PaymentService } from '../payments/PaymentService';

export function useCheckout() {
  const payments = new PaymentService();
  return (amount: number) => payments.createPayment(amount);
}
EOF
sed -i.bak 's#"node_modules/react": { "version": "18.3.1" },#"node_modules/react": { "version": "18.3.1" },\n    "node_modules/stripe": { "version": "17.2.0" },#' package-lock.json && rm -f package-lock.json.bak
git add -A && git commit -qm "Rename charge to createPayment"

# The paypal and product-page worktrees start clean, so the clash lights up live while they work.
cat <<MSG
Demo repository ready: $TARGET/shop (worktrees: shop-stripe, shop-paypal, shop-product-page)

Agent A (shop-stripe) has already renamed PaymentService.charge. Now start two agents:
  cd $TARGET/shop-paypal       && claude --plugin-dir <path-to-lanekeeper>
    "Create src/payments/paypal/client.ts with a function enablePayPal(service: PaymentService) that calls
     service.charge(). Don't change any other file."
    (optional, for the lockfile clash: "also add node_modules/@paypal/sdk 1.4.0 to package-lock.json,
     right after the empty root entry")
  cd $TARGET/shop-product-page && claude --plugin-dir <path-to-lanekeeper>
    "Add a short description paragraph under the heading in src/product/ProductPage.tsx"
Then run /lanekeeper:clashes in any of them.
MSG
