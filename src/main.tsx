// ========================================================================================
// ไฟล์: src/main.tsx
// หน้าที่: จุดเริ่มต้นการทำงานหลัก (Entry Point) ของแอปพลิเคชัน React
// คำอธิบาย: ทำการ mount คอมโพเนนต์ <App /> ลงใน DOM element ที่มี id เป็น 'root'
// ========================================================================================

// นำเข้า createRoot จาก react-dom/client เพื่อใช้ฟีเจอร์ React 18 Concurrent Rendering
import { createRoot } from 'react-dom/client';

// นำเข้าคอมโพเนนต์หลัก App ของระบบจำลอง SAM Simulation
import App from './App.tsx';

// นำเข้ารูปแบบตกแต่ง CSS ทั่วทั้งระบบ (รวมถึง Tailwind CSS)
import './index.css';

// ค้นหา DOM element ที่มี ID 'root' จาก index.html แล้วเรนเดอร์คอมโพเนนต์ <App /> ลงไป
createRoot(document.getElementById('root')!).render(<App />);
