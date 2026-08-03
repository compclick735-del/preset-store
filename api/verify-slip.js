import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const form = formidable({});

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอ่านไฟล์สลิป' });
    }

    const productId = Array.isArray(fields.productId) ? fields.productId[0] : fields.productId;
    const slipFile = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!slipFile || !productId) {
      return res.status(400).json({ success: false, message: 'กรุณาเลือกสินค้าและแนบไฟล์สลิปให้ถูกต้อง' });
    }

    try {
      // 1. ดึงข้อมูลสินค้าจากตาราง products
      const { data: product, error: productError } = await supabaseAdmin
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (productError || !product) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลสินค้าที่ระบุ' });
      }

      // 2. ส่งไฟล์สลิปไปตรวจกับ SlipOK API
      const fileBuffer = fs.readFileSync(slipFile.filepath);
      const fileBlob = new Blob([fileBuffer]);
      const slipokFormData = new FormData();
      slipokFormData.append('files', fileBlob, slipFile.originalFilename || 'slip.jpg');

      const slipokRes = await fetch(
        `https://api.slipok.com/api/line/apikey/${process.env.SLIPOK_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'x-authorization': process.env.SLIPOK_API_KEY,
          },
          body: slipokFormData,
        }
      );

      const slipData = await slipokRes.json();

      if (!slipokRes.ok || !slipData.success) {
        return res.status(400).json({
          success: false,
          message: slipData.message || 'สลิปไม่ถูกต้อง หรือถูกใช้งานไปแล้ว',
        });
      }

      // 3. ตรวจสอบยอดเงินโอน
      const paidAmount = Number(slipData.data?.amount || 0);
      const expectedPrice = Number(product.price);

      if (paidAmount < expectedPrice) {
        return res.status(400).json({
          success: false,
          message: `ยอดเงินโอนไม่ครบถ้วน (สินค้าราคา ฿${expectedPrice} ยอดโอนคือ ฿${paidAmount})`,
        });
      }

      // 4. ออก Signed URL หมดอายุใน 1 ชั่วโมง (3600 วินาที)
      const bucketName = process.env.SUPABASE_BUCKET_NAME || 'digital-products-presets';
      const { data: urlData, error: urlError } = await supabaseAdmin.storage
        .from(bucketName)
        .createSignedUrl(product.file_path, 3600);

      if (urlError || !urlData?.signedUrl) {
        return res.status(500).json({ success: false, message: 'ไม่สามารถสร้างลิงก์ดาวน์โหลดได้' });
      }

      return res.status(200).json({
        success: true,
        message: 'ตรวจสอบการชำระเงินสำเร็จ!',
        productName: product.title,
        downloadUrl: urlData.signedUrl,
      });

    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });
}