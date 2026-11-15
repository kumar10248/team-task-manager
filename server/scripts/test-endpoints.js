const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const http = require('http');
const crypto = require('crypto');
const app = require('../app');

async function testEndpoints() {
  console.log('Testing Express API endpoints /api/create-order and /api/verify-payment...');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Test POST /api/create-order with invalid amount (< 100 paise)
    console.log('\nTest 1: Amount < 100 paise validation');
    const resInvalid = await fetch(`${baseUrl}/api/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 50 }), // 50 paise is < 100
    });
    const dataInvalid = await resInvalid.json();
    console.log('Status (expected 400):', resInvalid.status);
    console.log('Response:', dataInvalid);
    if (resInvalid.status !== 400 || dataInvalid.success !== false) {
      throw new Error('Expected 400 Bad Request for amount < 100');
    }

    // 2. Test POST /api/create-order with valid amount (50000 paise = ₹500)
    console.log('\nTest 2: Valid order creation');
    const resValid = await fetch(`${baseUrl}/api/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 50000,
        currency: 'INR',
        receipt: `test_ep_${Date.now()}`,
      }),
    });
    const dataValid = await resValid.json();
    console.log('Status (expected 200):', resValid.status);
    console.log('Response:', dataValid);
    if (resValid.status !== 200 || !dataValid.order_id) {
      throw new Error('Order creation endpoint failed');
    }

    const orderId = dataValid.order_id;
    const testPaymentId = `pay_ep_${Date.now()}`;

    // 3. Test POST /api/verify-payment with missing fields
    console.log('\nTest 3: Missing fields verification');
    const resMissing = await fetch(`${baseUrl}/api/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId }),
    });
    const dataMissing = await resMissing.json();
    console.log('Status (expected 400):', resMissing.status);
    console.log('Response:', dataMissing);
    if (resMissing.status !== 400) {
      throw new Error('Expected 400 for missing fields');
    }

    // 4. Test POST /api/verify-payment with tampered signature
    console.log('\nTest 4: Tampered signature rejection');
    const resTampered = await fetch(`${baseUrl}/api/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id: orderId,
        razorpay_payment_id: testPaymentId,
        razorpay_signature: 'invalid_tampered_signature_1234567890abcdef',
      }),
    });
    const dataTampered = await resTampered.json();
    console.log('Status (expected 400):', resTampered.status);
    console.log('Response:', dataTampered);
    if (resTampered.status !== 400 || dataTampered.isPaid !== false) {
      throw new Error('Expected 400 for tampered signature');
    }

    // 5. Test POST /api/verify-payment with valid signature
    console.log('\nTest 5: Valid HMAC-SHA256 signature verification');
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${orderId}|${testPaymentId}`);
    const validSignature = hmac.digest('hex');

    const resSuccess = await fetch(`${baseUrl}/api/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id: orderId,
        razorpay_payment_id: testPaymentId,
        razorpay_signature: validSignature,
      }),
    });
    const dataSuccess = await resSuccess.json();
    console.log('Status (expected 200):', resSuccess.status);
    console.log('Response:', dataSuccess);
    if (resSuccess.status !== 200 || !dataSuccess.isPaid) {
      throw new Error('Expected 200 and isPaid: true for valid signature');
    }

    console.log('\n🎉 ALL 5 ENDPOINT TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.close();
  }
}

testEndpoints().catch(console.error);
