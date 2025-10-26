# 🎭 AR 3D Face Filter

เว็บแอพพลิเคชั่น AR 3D Filter ที่ใช้กล้องเพื่อตรวจจับใบหน้าและใส่ filter 3D แบบเรียลไทม์

## ✨ ฟีเจอร์

- 📹 **เข้าถึงกล้องแบบเรียลไทม์** - ใช้ MediaDevices API
- 🤖 **ตรวจจับใบหน้าด้วย AI** - ใช้ TensorFlow.js และ MediaPipe FaceMesh
- 🎨 **3D Rendering** - ใช้ Three.js สำหรับแสดง 3D objects
- 🎭 **Filter หลากหลาย**:
  - แว่นตา (Glasses)
  - หน้ากาก (Mask)
  - หูกระต่าย (Bunny Ears)
  - มงกุฎ (Crown)

## 🚀 วิธีใช้งาน

### 1. เปิดด้วย Live Server

เนื่องจากแอพใช้กล้อง จำเป็นต้องรันผ่าน HTTPS หรือ localhost

**ใช้ Python:**
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

**ใช้ Node.js:**
```bash
# ติดตั้ง http-server
npm install -g http-server

# รันเซิร์ฟเวอร์
http-server -p 8000
```

**ใช้ PHP:**
```bash
php -S localhost:8000
```

### 2. เปิดในเบราว์เซอร์

เปิด `http://localhost:8000` ในเบราว์เซอร์

### 3. อนุญาตการเข้าถึงกล้อง

เมื่อเบราว์เซอร์ขออนุญาต ให้กดอนุญาตการเข้าถึงกล้อง

### 4. เลือก Filter

คลิกปุ่ม filter ที่ต้องการเพื่อใส่ filter บนใบหน้า

## 🛠️ เทคโนโลยีที่ใช้

- **HTML5** - โครงสร้างหน้าเว็บ
- **CSS3** - การตอกแต่ง UI
- **JavaScript (ES6+)** - ตรรกะของแอพ
- **TensorFlow.js** - Machine Learning สำหรับตรวจจับใบหน้า
- **MediaPipe FaceMesh** - โมเดลสำหรับตรวจจับจุด landmark บนใบหน้า
- **Three.js** - 3D Graphics Library
- **MediaDevices API** - เข้าถึงกล้อง

## 📋 ความต้องการของระบบ

- เบราว์เซอร์ที่รองรับ WebGL และ getUserMedia:
  - Chrome 90+
  - Firefox 88+
  - Safari 14+
  - Edge 90+
- กล้องเว็บแคมหรือกล้องในอุปกรณ์
- การเชื่อมต่ออินเทอร์เน็ต (สำหรับโหลด libraries)

## 🎨 การปรับแต่ง

### เพิ่ม Filter ใหม่

แก้ไขในฟังก์ชั่น `createFilters()` ในไฟล์ `app.js`:

```javascript
// สร้าง group สำหรับ filter ใหม่
const myFilterGroup = new THREE.Group();

// สร้าง 3D object
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);

myFilterGroup.add(cube);
filterObjects.myFilter = myFilterGroup;
scene.add(myFilterGroup);
myFilterGroup.visible = false;
```

จากนั้นเพิ่มปุ่มใน `index.html`:

```html
<button class="filter-btn" data-filter="myFilter">Filter ของฉัน</button>
```

### ปรับแต่งสี/ขนาด

แก้ไข material properties ในฟังก์ชั่น `createFilters()`:

```javascript
const material = new THREE.MeshPhongMaterial({
    color: 0xff0000,      // สี (hex)
    shininess: 100,       // ความมัน
    transparent: true,    // โปร่งแสง
    opacity: 0.5         // ระดับความโปร่งแสง
});
```

## 🐛 การแก้ปัญหา

### กล้องไม่ทำงาน
- ตรวจสอบว่าเบราว์เซอร์ได้รับอนุญาตเข้าถึงกล้อง
- ต้องใช้ HTTPS หรือ localhost
- ตรวจสอบว่ากล้องไม่ได้ถูกใช้งานโดยแอพอื่น

### Filter ไม่ติดบนใบหน้า
- ตรวจสอบให้แน่ใจว่าใบหน้าอยู่ในกรอบกล้อง
- แสงสว่างเพียงพอ
- ใบหน้าหันมาทางกล้อง

### โหลดช้า
- รอให้โมเดล AI โหลดเสร็จ (ครั้งแรกอาจใช้เวลา 10-20 วินาที)
- ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต

## 📄 License

MIT License - ใช้งานได้อย่างอิสระ

## 👨‍💻 การพัฒนาเพิ่มเติม

สามารถพัฒนาเพิ่มเติม:
- เพิ่ม filter มากขึ้น
- บันทึกภาพหรือวิดีโอ
- ปรับแต่ง filter แบบเรียลไทม์
- Multi-face support
- AR effects แบบ advanced

---

สร้างด้วย ❤️ โดยใช้ TensorFlow.js และ Three.js
