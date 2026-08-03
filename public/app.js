let selectedProductId = null;
let productsData = [];

// 1. โหลดรายการสินค้าจาก API
async function loadProducts() {
  const container = document.getElementById('product-list');
  try {
    const res = await fetch('/api/get-products');
    const data = await res.json();

    if (data.success && data.products.length > 0) {
      productsData = data.products;
      container.innerHTML = '';

      productsData.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = `p-4 rounded-xl border cursor-pointer transition-all flex justify-between items-center ${
          index === 0 ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700'
        }`;
        itemEl.onclick = () => selectProduct(item.id);
        itemEl.id = `product-item-${item.id}`;
        itemEl.innerHTML = `
          <div>
            <div class="font-medium text-slate-200">${item.title}</div>
            <div class="text-xs text-slate-500">Digital Download (.ZIP)</div>
          </div>
          <div class="text-lg font-bold text-purple-400">฿${item.price}</div>
        `;
        container.appendChild(itemEl);
      });

      // เลือกสินค้าชิ้นแรกเป็นค่าเริ่มต้น
      selectProduct(productsData[0].id);
    } else {
      container.innerHTML = `<div class="text-center text-slate-500 text-sm">ยังไม่มีรายการสินค้า</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div class="text-center text-red-400 text-sm">โหลดสินค้าไม่สำเร็จ</div>`;
  }
}

// 2. สลับการเลือกสินค้า
function selectProduct(id) {
  selectedProductId = id;
  const selected = productsData.find(p => p.id === id);

  productsData.forEach(p => {
    const el = document.getElementById(`product-item-${p.id}`);
    if (el) {
      if (p.id === id) {
        el.className = 'p-4 rounded-xl border cursor-pointer transition-all flex justify-between items-center border-purple-500 bg-purple-500/10 text-white';
      } else {
        el.className = 'p-4 rounded-xl border cursor-pointer transition-all flex justify-between items-center border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700';
      }
    }
  });

  if (selected) {
    document.getElementById('price-display').innerText = `฿${selected.price}`;
    document.getElementById('payment-info').classList.remove('hidden');
  }
}

// 3. แสดงชื่อไฟล์ที่เลือก
function handleFileChange(event) {
  const file = event.target.files[0];
  const fileLabel = document.getElementById('file-label');
  const submitBtn = document.getElementById('submit-btn');

  if (file) {
    fileLabel.innerText = file.name;
    fileLabel.className = 'text-sm font-medium text-purple-300';
    submitBtn.disabled = false;
  } else {
    fileLabel.innerText = 'คลิกหรือลากรูปสลิปมาวางที่นี่';
    fileLabel.className = 'text-sm text-slate-400';
    submitBtn.disabled = true;
  }
}

// 4. ส่งสลิปไปตรวจสอบ
async function handleVerifySlip(event) {
  event.preventDefault();
  const fileInput = document.getElementById('slip-input');
  const errorMsg = document.getElementById('error-message');
  const submitBtn = document.getElementById('submit-btn');

  if (!fileInput.files[0] || !selectedProductId) {
    showError('กรุณาเลือกสินค้าและแนบสลิปการโอนเงิน');
    return;
  }

  errorMsg.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.innerText = 'กำลังตรวจสอบสลิป...';

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('productId', selectedProductId);

  try {
    const res = await fetch('/api/verify-slip', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || 'เกิดข้อผิดพลาดในการตรวจสอบสลิป');
    }

    // ซ่อนฟอร์ม แล้วแสดงปุ่มดาวน์โหลด
    document.getElementById('slip-form').classList.add('hidden');
    document.getElementById('download-container').classList.remove('hidden');
    document.getElementById('download-link-box').innerHTML = `
      <a href="${data.downloadUrl}" target="_blank" rel="noopener noreferrer" class="inline-block w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20">
        ดาวน์โหลดสินค้า (${data.productName})
      </a>
    `;

  } catch (err) {
    showError(err.message);
    submitBtn.disabled = false;
    submitBtn.innerText = 'ยืนยันการชำระเงิน';
  }
}

function showError(msg) {
  const errorMsg = document.getElementById('error-message');
  errorMsg.innerText = msg;
  errorMsg.classList.remove('hidden');
}

// เรียกทำงานเมื่อโหลดหน้า
window.onload = loadProducts;