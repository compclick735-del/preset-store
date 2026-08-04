import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false, // ปิด bodyParser ของ Vercel เพื่อให้ formidable จัดการ Multipart
  },
};

// ตรวจสอบ Environment Variables ของ Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ [SUPABASE ERROR] ขาด SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ใน Environment Variables');
}

// สร้าง Supabase Admin Client
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    // 1. ตรวจสอบ Environment Variables ของ SlipOK
    const apiKey = process.env.SLIPOK_API_KEY;
    const branchId = process.env.SLIPOK_BRANCH_ID || apiKey;

    if (!apiKey) {
      console.error('❌ Missing SLIPOK_API_KEY in Environment Variables');
      return res.status(500).json({ success: false, message: 'ระบบหลังบ้านยังไม่ได้ตั้งค่า SLIPOK_API_KEY' });
    }

    // 2. Parse Form Data
    const form = formidable({});
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    // ดึงค่า productId
    const rawProductId = fields.productId;
    const productId = Array.isArray(rawProductId) ? rawProductId[0] : rawProductId;

    // ดึงค่าไฟล์สลิป (รองรับทั้ง key 'file' และ 'files')
    const rawFile = files.file || files.files;
    const slipFile = Array.isArray(rawFile) ? rawFile[0] : rawFile;

    if (!slipFile || !productId) {
      return res.status(400).json({ success: false, message: 'กรุณาเลือกสินค้าและแนบไฟล์สลิปให้ถูกต้อง' });
    }

    // 3. ดึงข้อมูลสินค้าจาก Supabase
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      console.error('❌ Supabase Product Fetch Error:', productError);
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลสินค้าที่ระบุในระบบ' });
    }

    // 4. อ่านไฟล์สลิป และสร้าง Native File Object สมบูรณ์สำหรับ Node.js 20+
    const filePath = slipFile.filepath || slipFile.path;
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = slipFile.originalFilename || slipFile.name || 'slip.jpg';
    const fileType = slipFile.mimetype || slipFile.type || 'image/jpeg';

    const fileObj = new File([fileBuffer], fileName, { type: fileType });

    const slipokFormData = new FormData();
    slipokFormData.append('files', fileObj);

    // 5. ส่งไฟล์สลิปไปตรวจสอบที่ SlipOK API
    const slipokRes = await fetch(
      `https://api.slipok.com/api/line/apikey/${branchId}`,
      {
        method: 'POST',
        headers: {
          'x-authorization': apiKey,
        },
        body: slipokFormData,
      }
    );

    const slipData = await slipokRes.json();
    console.log('✅ SlipOK Response Log:', JSON.stringify(slipData));

    if (!slipokRes.ok || !slipData.success) {
      return res.status(400).json({
        success: false,
        message: slipData.data?.message || slipData.message || 'สลิปไม่ถูกต้อง ถูกใช้งานไปแล้ว หรือไม่ใช่งานโอนเงิน',
      });
    }

    // 6. ตรวจสอบยอดเงินโอนเทียบกับราคาสินค้าใน Database
    const paidAmount = Number(slipData.data?.amount || 0);
    const expectedPrice = Number(product.price);

    if (paidAmount < expectedPrice) {
      return res.status(400).json({
        success: false,
        message: `ยอดเงินโอนไม่ครบถ้วน (สินค้าราคา ฿${expectedPrice} แต่ยอดโอนคือ ฿${paidAmount})`,
      });
    }

    // 7. ออก Signed URL สำหรับดาวน์โหลดไฟล์ ZIP จาก Supabase Storage (หมดอายุใน 1 ชั่วโมง)
    const bucketName = (process.env.SUPABASE_BUCKET_NAME || 'digital-products-presets').trim();
    
    // ทำความสะอาด file_path (ลบช่องว่างหัว-ท้าย และลบ / นำหน้าออก)
    const cleanFilePath = (product.file_path || '').trim().replace(/^\/+/, '');

    console.log(`🔍 [STORAGE DEBUG] Bucket Name: "${bucketName}"`);
    console.log(`🔍 [STORAGE DEBUG] DB Raw Path: "${product.file_path}"`);
    console.log(`🔍 [STORAGE DEBUG] Cleaned Path: "${cleanFilePath}"`);

    const { data: urlData, error: urlError } = await supabaseAdmin.storage
      .from(bucketName)
      .createSignedUrl(cleanFilePath, 3600);

    if (urlError || !urlData?.signedUrl) {
      console.error('❌ Supabase Signed URL Error:', urlError);
      return res.status(500).json({ 
        success: false, 
        message: `ไม่สามารถสร้างลิงก์ดาวน์โหลดสินค้าได้ (${urlError?.message || 'Object not found'})` 
      });
    }

    // 8. ส่งผลลัพธ์กลับไปยังหน้าบ้าน
    return res.status(200).json({
      success: true,
      message: 'ตรวจสอบการชำระเงินสำเร็จ!',
      productName: product.title,
      downloadUrl: urlData.signedUrl,
    });

  } catch (error) {
    console.error('❌ Verify Slip Server Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'เกิดข้อผิดพลาดในการประมวลผลระบบหลังบ้าน',
    });
  }
}