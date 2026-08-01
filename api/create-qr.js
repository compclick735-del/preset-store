import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  // รับราคาและชื่อพรีเซ็ตที่ลูกค้าเลือกจากหน้าเว็บ
  const { amount = 390.00, itemTitle = 'Presets Pack' } = req.body || {};
  const orderId = 'ORD-' + Date.now();

  try {
    const response = await fetch('https://api.gbprimepay.com/v1/qrcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: process.env.GB_TOKEN,
        amount: amount,
        referenceNo: orderId,
        backgroundUrl: `https://${process.env.VERCEL_URL}/api/webhook`
      })
    });

    const qrData = await response.json();

    await kv.set(orderId, {
      paid: false,
      amount: amount,
      itemTitle: itemTitle,
      createdAt: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      orderId: orderId,
      qrImageUrl: qrData.qrcodeUrl || `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=PROMPTPAY_TEST_${amount}`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error creating QR' });
  }
}