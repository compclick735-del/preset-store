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

  try {
    const form = formidable({});
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const rawProductId = fields.productId;
    const productId = Array.isArray(rawProductId) ? rawProductId[0] : rawProductId;

    const rawFile = files.file || files.files;
    const slipFile = Array.isArray(rawFile) ? rawFile[0] : rawFile;

    if (!slipFile || !productId) {
      return res.status(400).json({ success: false, message: 'กรุณาเลือกสินค้าและแนบไฟล์สลิปให้ถูกต้อง' });
    }

    // 1. ดึงข้อมูลสินค้าจาก Supabase
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลสินค้าที่ระบุ' });
    }

    // 2. อ่านไฟล์สลิป และระบุ MIME Type ให้ชัดเจน
    const filePath = slipFile.filepath || slipFile.path;
    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = slipFile.mimetype || slipFile.type || 'image/jpeg';
    const fileBlob = new Blob([fileBuffer], { type: mimeType });

    const slipokFormData = new FormData();
    slipokFormData.append('files', fileBlob, slipFile.originalFilename || slipFile.name || 'slip.jpg');

    const branchId = process.env.SLIPOK_BRANCH_ID || process.env.SLIPOK_API_KEY;

    // 3. ยิงตรวจสอบไปยัง SlipOK API
    const slipokRes = await fetch(
      `https://api.slipok.com/api/line/apikey/${branchId}`,
      {
        method: 'POST',
        headers: {
          'x-authorization': process.env.SLIPOK_API_KEY,
        },
        body: slipokFormData,
      }
    );

    const slipData = await slipokRes.json();
    console.log('SlipOK Response:', JSON.stringify(slipData)); // บันทึก Log ดูใน Vercel

    if (!slipokRes.ok || !slipData.success) {
      return res.status(400).json({
        success: false,
        message: slipData.data?.message || slipData.message || 'สลิปไม่ถูกต้อง หรือถูกใช้งานไปแล้ว',
      });
    }

    // 4. ตรวจสอบยอดเงินโอน
    const paidAmount = Number(slipData.data?.amount || 0);
    const expectedPrice = Number(product.price);

    if (paidAmount < expectedPrice) {
      return res.status(400).json({
        success: false,
        message: `ยอดเงินโอนไม่ครบถ้วน (สินค้าราคา ฿${expectedPrice} ยอดโอนคือ ฿${paidAmount})`,
      });
    }

    // 5. ออก Signed URL สำหรับดาวน์โหลดไฟล์ ZIP
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
    console.error('Verify Slip Error:', error);
    return res.status(500).json({ success: false, message: error.message || 'เกิดข้อผิดพลาดในการประมวลผล' });
  }
}