import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { referenceNo, resultCode } = req.body;

  if (resultCode === '00' && referenceNo) {
    await kv.set(referenceNo, {
      paid: true,
      paidAt: new Date().toISOString(),
      downloadUrl: process.env.SECURE_DOWNLOAD_URL
    });
  }

  return res.status(200).send('OK');
}