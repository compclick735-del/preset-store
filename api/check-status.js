import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ paid: false });

  const order = await kv.get(orderId);

  if (order && order.paid) {
    return res.status(200).json({
      paid: true,
      downloadUrl: order.downloadUrl
    });
  }

  return res.status(200).json({ paid: false });
}