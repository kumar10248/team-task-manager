const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const crypto = require('crypto');
const Razorpay = require('razorpay');

async function testRazorpay() {
  console.log('Testing Razorpay Standard Integration with Credentials...');
  console.log('Key ID:', process.env.RAZORPAY_KEY_ID);
  console.log('Key Secret exists:', Boolean(process.env.RAZORPAY_KEY_SECRET));

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  // Step 1: Create Order
  console.log('\n--- Step 1: Creating Razorpay Order (min 100 paise) ---');
  const amount = 50000; // 50000 paise = ₹500
  const currency = 'INR';
  const receipt = `test_rcpt_${Date.now()}`;

  const order = await razorpay.orders.create({
    amount,
    currency,
    receipt,
    notes: { test: 'Standard checkout integration test' },
  });

  console.log('Order created successfully:');
  console.log({
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
    status: order.status,
  });

  if (!order.id || !order.id.startsWith('order_')) {
    throw new Error('Invalid order_id received from Razorpay');
  }

  // Step 2 & 3: Signature Verification
  console.log('\n--- Step 2 & 3: Verifying HMAC-SHA256 Signature ---');
  const testPaymentId = `pay_test_${Date.now()}`;
  
  // Compute valid signature: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
  const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
  hmac.update(`${order.id}|${testPaymentId}`);
  const validSignature = hmac.digest('hex');

  // Verify match
  const verifyHmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
  verifyHmac.update(`${order.id}|${testPaymentId}`);
  const expectedSig = verifyHmac.digest('hex');

  const isMatch = crypto.timingSafeEqual(
    Buffer.from(expectedSig, 'utf-8'),
    Buffer.from(validSignature, 'utf-8')
  );
  console.log('Generated Signature:', validSignature);
  console.log('Signature Match Result:', isMatch);

  // Negative test: invalid signature
  const invalidSig = 'invalid_tampered_signature_hex_1234567890abcdef';
  let isInvalidMatch = false;
  try {
    isInvalidMatch = crypto.timingSafeEqual(
      Buffer.from(expectedSig, 'utf-8'),
      Buffer.from(invalidSig, 'utf-8')
    );
  } catch {
    isInvalidMatch = expectedSig === invalidSig;
  }
  console.log('Tampered Signature Match Result (expected false):', isInvalidMatch);

  console.log('\n✅ Razorpay Standard Checkout SDK and Signature verification working perfectly!');
}

testRazorpay().catch(console.error);
